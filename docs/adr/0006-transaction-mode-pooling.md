# ADR 0006: The application connects through a transaction-mode pooler

- Status: accepted
- Date: 2026-09-04
- Related: [0001 write path](0001-write-path-architecture.md)

## Context

Two facts about the hosted project, discovered by provisioning it rather than
by reading documentation, constrain the connection layer.

**The direct database host is IPv6-only.**
`db.isibttscwburdguydntg.supabase.co` has an AAAA record and no A record.
Dedicated IPv4 is a paid add-on on this plan. Vercel functions and most GitHub
Actions runners are IPv4-only, so they cannot open a socket to the direct host
at all — the failure is a connection timeout, which reads like a firewall or
credential problem and sends you looking in the wrong place.

**The pooler hostname is per-tenant and cannot be guessed.** This project is on
`aws-1-eu-west-1.pooler.supabase.com`. `aws-0-eu-west-1.pooler.supabase.com`
also resolves in DNS but serves other tenants, and connecting to it fails
authentication with an error that looks like a wrong password. This was
determined empirically and is recorded in `.env.example` so nobody repeats it.

Production traffic therefore has to go through the pooler (Supavisor) in
transaction mode on port 6543. Transaction mode assigns a backend per
transaction rather than per connection, which is what allows a small number of
Postgres connections to serve a large number of serverless instances — and
which invalidates anything that assumes session continuity.

## Decision

Connect the application through the transaction-mode pooler, and hold the
connection layer to three rules.

**1. No named prepared statements.** In transaction mode consecutive
transactions from one client may land on different backends, so a statement
prepared on one is absent on the next and the query fails with "prepared
statement does not exist" — intermittently, under load, in production only.

node-postgres only prepares a named statement when a query config carries a
`name`; `client.query(sql, values)` uses the unnamed statement and sends
Parse/Bind/Execute/Sync as one unit, which is safe. Our `Transaction` interface
accepts SQL only as a `string`, so ordinary code cannot express a named
statement. `pool.ts` additionally wraps `query` on each physical connection and
throws `PreparedStatementError` if a `name` appears, to catch the case where
someone reaches for `getPool().query({ name, text })` — which works perfectly
in local development and fails only in production.

**2. Nothing session-scoped, and nothing extra in the startup packet.** This is
the rule that actually required a change. node-postgres puts
`statement_timeout`, `lock_timeout` and `idle_in_transaction_session_timeout`
into the startup message (`pg/lib/client.js`, `getStartupConf`), and a
PgBouncer-lineage pooler rejects startup parameters it does not recognise. The
statement timeout is now applied inside the transaction via
`set_config('statement_timeout', $4, true)` alongside the audit context.

That change is an improvement independent of the pooler. A session-level
timeout persists on a connection that the next request inherits; a
transaction-local one expires at `COMMIT`. The same reasoning already applied to
the audit context, which has always been set with `is_local => true` — a pooled
connection must not be able to leak the previous request's identity to the next
one, which would be a quiet and serious security bug.

**3. A small client-side pool.** `max` defaults to 2. Each instance holding
connections occupies that many of the pooler's client slots, and a serverless
deployment may have hundreds of instances; multiplying a generous per-instance
pool by the instance count is how a free-plan project exhausts its connection
limit. The pooler is doing the real pooling. This pool exists only to avoid a
TLS handshake per request, with `allowExitOnIdle` so a function can exit
promptly and a short idle timeout so slots are returned quickly.

Session-mode pooling on port 5432 remains available for the jobs that genuinely
need full protocol support — migrations, pgTAP, the SQL invariant runner —
and is reachable over IPv4, which the direct host is not. It is documented in
`.env.example` as the CI path.

## Consequences

- `LISTEN`/`NOTIFY`, advisory locks held across transactions, session-level
  `SET`, cursors held open between transactions, and `PREPARE` are all
  unavailable to the application. None are currently used. Anything that needs
  them belongs in a worker on a session-mode connection, not in a Server
  Action.
- `set_config(..., true)` inside the transaction is the only correct way to set
  session-ish state. A future engineer adding `SET` to a startup config or a
  `pool.on('connect')` handler will break production and not local
  development, which is why the reasoning is written into `pool.ts` and not
  only here.
- TLS is on and verified by default for any non-local host, with
  `DATABASE_SSL_CA` for a private chain. There is a `no-verify` escape hatch
  because a certificate problem should not be unfixable at 3am, but it warns on
  every start, since a connection carrying financial data that does not
  authenticate its peer defeats the purpose of encrypting it.

## Alternatives considered

**Buy dedicated IPv4 and use the direct connection.** A recurring cost to
regain full protocol support the application does not need, and it would leave
the pool oversized for serverless anyway. Revisit only if a component genuinely
requires session features.

**Session-mode pooling for the application.** Full protocol support, so no
constraints to respect. Rejected because session mode holds a backend for the
life of each client connection, which is precisely the resource a serverless
deployment cannot afford to hold.

**Supabase's PostgREST/`supabase-js` for writes instead of a direct
connection.** Sidesteps connection management entirely, and is incompatible
with ADR 0001: the write path depends on connecting as a role with no DML
privilege on ledger tables and invoking `SECURITY DEFINER` functions. Routing
writes through PostgREST would mean the browser's key reaching the write path.
