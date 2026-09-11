/**
 * The transaction helper.
 *
 * Every database interaction in the application goes through here, and it does
 * one job that nothing else can do reliably: it stamps the acting user, the
 * entity and the request onto the session before any statement runs. The audit
 * triggers and the posting functions read those settings. A write that arrives
 * without them either records an unattributed change or is refused outright,
 * so there is no path where work happens and the trail does not say who did
 * it.
 *
 * The settings are set with `is_local => true`, which scopes them to the
 * transaction. A pooled connection handed to the next request therefore cannot
 * inherit the previous request's identity, which would be a serious and very
 * quiet security bug.
 */
import type { PoolClient, QueryResultRow } from 'pg';
import { acquire, STATEMENT_TIMEOUT_MS } from './pool';
import { DatabaseError, translateDatabaseError } from './errors';

export interface RequestContext {
  /** app.users.id of the human or system actor. */
  readonly userId: string;
  /** The entity being operated on. */
  readonly entityId: string;
  /** Correlates the audit rows written by one request. */
  readonly requestId: string;
}

export interface Transaction {
  /** Runs a statement. Always parameterised; never interpolate values. */
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T[]>;
  /** Runs a statement expected to return exactly one row. */
  one<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T>;
  /** Runs a statement returning at most one row. */
  maybeOne<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T | null>;
  /** Returns a single scalar. */
  scalar<T>(sql: string, params?: readonly unknown[]): Promise<T>;
  readonly context: RequestContext;
}

type Work<T> = (tx: Transaction) => Promise<T>;

interface TransactionOptions {
  /** Opens the transaction read-only, so a query cannot write by accident. */
  readonly readOnly?: boolean;
  /**
   * SERIALIZABLE where a read-then-write must not interleave. The posting
   * functions take their own row locks, so READ COMMITTED is correct and
   * cheaper for ordinary work.
   */
  readonly isolation?: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
}

/**
 * Runs work in a transaction with the audit context set, committing on success
 * and rolling back on any thrown error.
 *
 * A serialisation failure is retried a small number of times with backoff,
 * because under SERIALIZABLE the correct response to `40001` is to try again,
 * and making every caller remember that would guarantee some caller forgets.
 */
export async function withTransaction<T>(
  context: RequestContext,
  work: Work<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const maxAttempts = options.isolation === 'SERIALIZABLE' ? 3 : 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = await acquire();
    try {
      return await runOnce(client, context, work, options);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === maxAttempts) throw error;
      await delay(25 * 2 ** (attempt - 1));
    } finally {
      client.release();
    }
  }

  throw lastError;
}

async function runOnce<T>(
  client: PoolClient,
  context: RequestContext,
  work: Work<T>,
  options: TransactionOptions,
): Promise<T> {
  const isolation = options.isolation ?? 'READ COMMITTED';
  const access = options.readOnly ? ' read only' : '';

  await client.query(`begin isolation level ${isolation}${access}`);
  try {
    // Parameterised so an identifier can never be smuggled in through a value.
    //
    // statement_timeout is set here rather than on the connection because
    // node-postgres would otherwise put it in the startup packet, which a
    // transaction-mode pooler rejects. Setting it locally is also the safer
    // choice regardless of the pooler: it expires with the transaction instead
    // of persisting on a connection that the next request will inherit.
    await client.query(
      `select set_config('app.current_user_id', $1, true),
              set_config('app.current_entity_id', $2, true),
              set_config('app.request_id', $3, true),
              set_config('statement_timeout', $4, true)`,
      [context.userId, context.entityId, context.requestId, String(STATEMENT_TIMEOUT_MS)],
    );

    const tx = makeTransaction(client, context);
    const result = await work(tx);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch (rollbackError) {
      // A failed rollback means the connection is unusable. Report the original
      // cause, which is what actually went wrong.
      console.error('[db] rollback failed', rollbackError);
    }
    throw translateDatabaseError(error);
  }
}

function makeTransaction(client: PoolClient, context: RequestContext): Transaction {
  const query = async <T extends QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> => {
    const result = await client.query<T>(sql, params as unknown[]);
    return result.rows;
  };

  return {
    context,
    query,
    async one<T extends QueryResultRow>(sql: string, params: readonly unknown[] = []): Promise<T> {
      const rows = await query<T>(sql, params);
      if (rows.length !== 1) {
        throw new DatabaseError(
          `Expected exactly one row, got ${rows.length}`,
          'unexpected_row_count',
        );
      }
      return rows[0] as T;
    },
    async maybeOne<T extends QueryResultRow>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<T | null> {
      const rows = await query<T>(sql, params);
      if (rows.length > 1) {
        throw new DatabaseError(
          `Expected at most one row, got ${rows.length}`,
          'unexpected_row_count',
        );
      }
      return rows[0] ?? null;
    },
    async scalar<T>(sql: string, params: readonly unknown[] = []): Promise<T> {
      const rows = await query(sql, params);
      const row = rows[0];
      if (!row) {
        throw new DatabaseError('Expected a value, got no rows', 'unexpected_row_count');
      }
      return Object.values(row)[0] as T;
    },
  };
}

/** Convenience wrapper for reads. Read-only so a report cannot write. */
export async function withReadOnlyTransaction<T>(
  context: RequestContext,
  work: Work<T>,
): Promise<T> {
  return withTransaction(context, work, { readOnly: true });
}

/**
 * A read-only transaction that knows the actor but not yet an entity.
 *
 * Session resolution is the one query that cannot go through withTransaction:
 * we do not know the entity until we have read app.user_roles, and RLS on
 * app.users is `id = app.current_user_id()`. A query that does not set that
 * GUC sees zero rows and the application concludes the user is not
 * provisioned — while the proxy, looking only at the Auth cookie, keeps
 * sending them back to `/`. That is a redirect loop, not an access decision.
 *
 * is_local => true so a pooled connection cannot leak this identity onto the
 * next request.
 */
export async function withActorRead<T>(
  userId: string,
  work: (query: Transaction['query']) => Promise<T>,
): Promise<T> {
  const client = await acquire();
  try {
    await client.query('begin isolation level read committed read only');
    await client.query(
      `select set_config('app.current_user_id', $1, true),
              set_config('statement_timeout', $2, true)`,
      [userId, String(STATEMENT_TIMEOUT_MS)],
    );
    const query: Transaction['query'] = async (sql, params = []) => {
      const result = await client.query(sql, params as unknown[]);
      return result.rows;
    };
    const result = await work(query);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch (rollbackError) {
      console.error('[db] rollback failed', rollbackError);
    }
    throw translateDatabaseError(error);
  } finally {
    client.release();
  }
}

/**
 * A read-only transaction with no actor. Used only for the public company
 * brand on the sign-in page, which has to work before anyone is signed in.
 */
export async function withUnauthenticatedRead<T>(
  work: (query: Transaction['query']) => Promise<T>,
): Promise<T> {
  const client = await acquire();
  try {
    await client.query('begin isolation level read committed read only');
    await client.query(`select set_config('statement_timeout', $1, true)`, [
      String(STATEMENT_TIMEOUT_MS),
    ]);
    const query: Transaction['query'] = async (sql, params = []) => {
      const result = await client.query(sql, params as unknown[]);
      return result.rows;
    };
    const result = await work(query);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch (rollbackError) {
      console.error('[db] rollback failed', rollbackError);
    }
    throw translateDatabaseError(error);
  } finally {
    client.release();
  }
}

function isRetryable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  // 40001 serialisation failure, 40P01 deadlock detected.
  return code === '40001' || code === '40P01';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
