/**
 * The connection pool.
 *
 * Two separate constraints shape this file. Both are easy to break by
 * accident, and breaking either produces a failure that only appears in
 * production, so both are spelled out.
 *
 * ---------------------------------------------------------------------------
 * 1. The application connects as a role that cannot write the ledger
 * ---------------------------------------------------------------------------
 *
 * `skyjet_app` has no INSERT, UPDATE or DELETE privilege on any ledger table.
 * That is the last line of the defence described in the migrations: even a SQL
 * injection in application code cannot forge a journal entry, because the role
 * holding the connection has no privilege to insert one. Rows reach the ledger
 * only through the SECURITY DEFINER posting functions.
 *
 * Never point this at `postgres` or the service role to make something work.
 * If a write is being refused, the write is going the wrong way round.
 *
 * ---------------------------------------------------------------------------
 * 2. Production connects through a transaction-mode pooler
 * ---------------------------------------------------------------------------
 *
 * The hosted database's direct host resolves to IPv6 only, and dedicated IPv4
 * is a paid add-on. Vercel functions and most GitHub runners are IPv4-only, so
 * they cannot reach it at all. Production therefore goes through Supavisor in
 * transaction mode on port 6543, and that imposes three rules:
 *
 *   a. No named prepared statements. In transaction mode a client is handed a
 *      different backend on every transaction, so a statement prepared on one
 *      is absent on the next and the query fails with "prepared statement
 *      does not exist". node-postgres only prepares a named statement when a
 *      query is given a `name`, which the Transaction interface makes
 *      unrepresentable — and the guard below turns any attempt to bypass that
 *      into an immediate, loud error rather than an intermittent one.
 *
 *   b. No session state, and in particular nothing in the startup packet
 *      beyond what the pooler understands. This is the one that actually bit:
 *      node-postgres puts `statement_timeout` into the startup message (see
 *      pg/lib/client.js getStartupConf), and a PgBouncer-lineage pooler
 *      rejects startup parameters it does not recognise. The timeout is now
 *      applied per transaction in transaction.ts instead, which is both
 *      pooler-safe and strictly better: it is scoped to the transaction and
 *      cannot leak onto the next request that inherits the connection.
 *
 *   c. A small client-side pool. Each application instance holding connections
 *      occupies that many of the pooler's client slots, and on a serverless
 *      platform there may be hundreds of instances. The pooler is doing the
 *      real pooling; this pool exists only to avoid a handshake per request.
 */
import { readFileSync } from 'node:fs';
import { Pool, types } from 'pg';
import type { PoolClient } from 'pg';
import { SUPABASE_PROD_CA_2021 } from './supabase-ca';
import { assertDatabaseUrl } from './database-url';
import { translateDatabaseError } from './errors';

const NUMERIC_OID = 1700;
const INT8_OID = 20;

// Postgres NUMERIC arrives as a string and must stay one. node-postgres would
// otherwise be happy to hand back a double and quietly undo the precision the
// database went to such trouble to keep.
types.setTypeParser(NUMERIC_OID, (value) => value);
types.setTypeParser(INT8_OID, (value) => value);

/**
 * Applied per transaction via set_config, not as a startup parameter. A
 * runaway report must not hold a pooled connection open indefinitely and
 * starve the posting path.
 */
export const STATEMENT_TIMEOUT_MS = Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 30_000);

/**
 * Client-side ceiling, enforced by node-postgres rather than the server.
 * Deliberately a little longer than the server-side timeout so that, when a
 * statement is killed, the error the user sees is the informative one from
 * Postgres rather than a bare client timeout.
 */
const QUERY_TIMEOUT_MS = STATEMENT_TIMEOUT_MS + 5_000;

export class PreparedStatementError extends Error {
  constructor(name: string) {
    super(
      `Query "${name}" was issued as a named prepared statement. Production connects ` +
        'through a transaction-mode pooler, where a named statement prepared on one ' +
        'backend does not exist on the next, so this fails intermittently under load. ' +
        'Pass SQL and parameters as text and values instead; see the notes in ' +
        'server/db/pool.ts.',
    );
    this.name = 'PreparedStatementError';
  }
}

let pool: Pool | undefined;

export function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. It must point at the database as skyjet_app_login, ' +
        'through the pooler in production; see .env.example.',
    );
  }
  assertDatabaseUrl(connectionString);

  const ssl = resolveSsl(connectionString);

  pool = new Pool({
    connectionString,

    // Small on purpose; see note (c) above. Raise it only for a long-lived
    // container, and never above the pooler's per-tenant client limit divided
    // by the number of instances you expect to run.
    max: Number(process.env.DATABASE_POOL_MAX ?? 2),

    // Release connections back to the pooler quickly, since an idle client
    // still occupies a pooler slot.
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 10_000),
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 10_000),

    // Client-side only, so safe with a pooler.
    query_timeout: QUERY_TIMEOUT_MS,

    // Lets a serverless function exit once its work is done instead of being
    // held open by an idle socket.
    allowExitOnIdle: true,

    // Long-lived idle sockets through a pooler and NAT get dropped silently
    // otherwise, surfacing later as a connection reset mid-request.
    keepAlive: true,

    // application_name is part of the standard startup set and is understood
    // by the pooler. It is worth setting: it is what makes a connection
    // identifiable in pg_stat_activity when something is holding a lock.
    application_name: 'skyjet-business-suite',

    ...(ssl ? { ssl } : {}),
  });

  // Deliberately not `statement_timeout`, `lock_timeout` or
  // `idle_in_transaction_session_timeout`: node-postgres sends all three in
  // the startup packet, which a transaction-mode pooler refuses.

  pool.on('error', (error) => {
    // An idle client erroring is a pool-level event, not a request failure.
    console.error('[db] idle client error', error);
  });

  pool.on('connect', guardAgainstNamedStatements);

  return pool;
}

/**
 * Rejects named prepared statements at the point of use.
 *
 * The Transaction interface only accepts SQL as a string, so ordinary code
 * cannot express a named statement. This catches the case where someone
 * reaches for `getPool().query({ name, text })` directly — which works
 * perfectly against a direct connection and in local development, and then
 * fails under load in production once the pooler starts moving the client
 * between backends. Failing immediately and explaining why is worth the one
 * wrapped function per physical connection.
 */
function guardAgainstNamedStatements(client: PoolClient): void {
  const target = client as unknown as { query: (...args: unknown[]) => unknown };
  const original = target.query.bind(client);

  target.query = (...args: unknown[]) => {
    const config = args[0];
    if (config !== null && typeof config === 'object' && 'name' in config) {
      const name = (config as { name?: unknown }).name;
      if (typeof name === 'string' && name.length > 0) {
        throw new PreparedStatementError(name);
      }
    }
    return original(...args);
  };
}

/**
 * TLS configuration.
 *
 * Anything that is not plainly a local host gets TLS with verification on.
 * There is a `no-verify` escape hatch because a certificate problem at three
 * in the morning should not be unfixable, but it warns loudly every time,
 * because a connection carrying financial data that does not verify who it is
 * talking to is exactly the situation TLS exists to prevent. The right fix for
 * an untrusted chain is to supply the CA in DATABASE_SSL_CA, not to stop
 * checking.
 */
export function resolveSsl(
  connectionString: string,
): false | { ca?: string; rejectUnauthorized: boolean } {
  const mode = process.env.DATABASE_SSL ?? (isLocalHost(connectionString) ? 'disable' : 'require');

  if (mode === 'disable') return false;

  const ca = process.env.DATABASE_SSL_CA;
  if (ca) {
    return {
      ca: ca.startsWith('-----BEGIN') ? ca : readFileSync(ca, 'utf8'),
      rejectUnauthorized: true,
    };
  }

  if (mode === 'no-verify') {
    console.warn(
      '[db] TLS certificate verification is DISABLED (DATABASE_SSL=no-verify). ' +
        'The connection is encrypted but unauthenticated. Supply the database CA in ' +
        'DATABASE_SSL_CA and remove this setting.',
    );
    return { rejectUnauthorized: false };
  }

  // Hosted Supabase presents a chain rooted at a private CA that Node does
  // not ship. Without it, `require` fails with SELF_SIGNED_CERT_IN_CHAIN —
  // which looks like a local intercept but is the server's real certificate.
  if (isSupabaseHost(connectionString)) {
    return { ca: SUPABASE_PROD_CA_2021, rejectUnauthorized: true };
  }

  return { rejectUnauthorized: true };
}

export function isSupabaseHost(connectionString: string): boolean {
  try {
    const { hostname } = new URL(connectionString);
    return (
      hostname === 'supabase.com' ||
      hostname.endsWith('.supabase.com') ||
      hostname.endsWith('.supabase.co')
    );
  } catch {
    return false;
  }
}

function isLocalHost(connectionString: string): boolean {
  try {
    const { hostname } = new URL(connectionString);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    // An unparseable connection string is not something to guess about; assume
    // it is remote so TLS stays on.
    return false;
  }
}

export async function acquire(): Promise<PoolClient> {
  try {
    return await getPool().connect();
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

/** Closes the pool. For scripts and tests; the server keeps it for its life. */
export async function closePool(): Promise<void> {
  if (pool) {
    const closing = pool;
    pool = undefined;
    await closing.end();
  }
}
