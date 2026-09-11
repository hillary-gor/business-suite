# ADR 0001: The ledger is written only by database functions

- Status: accepted
- Date: 2026-09-03
- Supersedes: nothing
- Related: [0002 ledger immutability](0002-ledger-immutability.md), [0006 transaction-mode pooling](0006-transaction-mode-pooling.md)

## Context

SkyJet's financial and inventory records will outlive this codebase. They will
be audited, and the business will be run from them. The question this ADR
settles is: **what component is allowed to create a journal entry?**

The obvious answer, and the one nearly every application of this shape picks,
is "the application". You write an ORM model, you write a service that
constructs debits and credits, and the database faithfully stores what it is
handed. The database is a persistence layer and the business rules live in
application code.

That answer has a specific failure mode which matters here more than usual.
When the database will accept any row the application sends, then correctness
depends on _every_ code path that ever writes being correct — including the
migration script someone runs at 2am, the admin panel added in year three, the
data-fix script, the second application someone inevitably writes against the
same database, and the intern's first pull request. Each is an independent
opportunity to create an unbalanced entry, post to a closed period, or move
stock without moving its value. Nothing detects it at the time. It is found
months later during a reconciliation, by which point the wrong numbers have
been reported to KRA and used to make decisions.

We also expect this system to be handed to another engineering team. We cannot
transfer the knowledge in a current engineer's head, but we can transfer
constraints that hold whether or not the next team reads the documentation.

## Decision

Business documents never write ledger tables. All ledger writes go through
`SECURITY DEFINER` functions in the database — principally `gl.post_entry` and
`inv.post_movement` — and the application role is stripped of the privilege
needed to bypass them.

Concretely, four layers, each of which assumes the one above it has failed:

1. **The browser never writes.** It holds an RLS-scoped Supabase key that can
   read what the user is entitled to read and nothing more. There is no code
   path from the client to a write. A hostile client with a valid session and
   a copy of our source can, at most, read its own data.

2. **Server Actions authorise.** Every action calls `authorise()` before doing
   anything, which resolves the session, loads effective permissions for the
   target entity, and refuses if the required permission is absent. Input is
   then parsed by a Zod schema, so a malformed or hostile payload is rejected
   at the boundary rather than partway through a transaction. Only then is a
   module function called. `proxy.ts` refreshes sessions and is explicitly
   _not_ an authorisation boundary — it is documented as such in the file,
   because middleware that looks like a security control but is not is worse
   than none.

3. **Posting functions own the ledger.** `gl.post_entry` is the sole path into
   `gl.journal_entry` and `gl.journal_entry_line`. It validates the period is
   open, the accounts exist and are postable, the currencies are coherent, the
   required dimensions are present, and the entry balances; allocates a gapless
   document number; and writes entry and lines in one transaction. There is no
   flag to skip validation, because such a flag would be used.

4. **`skyjet_app` holds no DML privilege on any ledger table.** This is the
   layer that makes the others more than convention. The role the application
   connects as has been granted `EXECUTE` on the posting functions and
   `SELECT` on what it needs to read. It has no `INSERT`, `UPDATE` or `DELETE`
   on `gl.journal_entry`, `gl.journal_entry_line` or `inv.stock_ledger`. A SQL
   injection in application code therefore cannot forge a journal entry: the
   connection holding the injected statement lacks the privilege to run it.
   The functions can write because `SECURITY DEFINER` runs them as their owner,
   and the only way to invoke them is to satisfy their validation.

**RLS is the second lock, not the first.** Row-Level Security is applied
deny-by-default to every table in every business schema
(`0008_row_level_security.sql`). But it is deliberately not the primary write
control, and it is worth being precise about why: RLS constrains _which rows_ a
role may touch. It has nothing to say about whether those rows balance, whether
the period is open, or whether a stock movement carries its matching value
posting. An RLS policy cannot express "the sum of debits in this entry equals
the sum of credits", because that is a statement about a set of rows that do
not all exist yet. RLS is excellent at containing a compromised session to one
entity's data; it is the wrong tool for ledger integrity, and treating it as
the main defence is a common and expensive mistake.

## Consequences

What we accept in exchange:

- **Business logic lives in PL/pgSQL.** This is unfashionable, harder to unit
  test with familiar tooling, and unfamiliar to many application engineers. It
  is also the only place the rule can be enforced for every caller, forever.
  [ADR 0007](0007-sql-test-harness.md) covers how we test it.
- **Migrations are the deployment unit for logic changes.** Changing posting
  behaviour means a migration, review and deploy — not a hotfix. For code that
  writes the ledger this friction is a feature.
- **Some errors surface as Postgres exceptions.** `server/db/errors.ts`
  translates constraint names and `RAISE EXCEPTION` messages into something a
  user can act on. That mapping needs maintaining as constraints are added.
- **Local development needs a real Postgres.**
  [ADR 0007](0007-sql-test-harness.md) covers how we avoid requiring Docker
  for it.

What we get:

- An unbalanced entry cannot exist in the database, no matter what writes to
  it, including software not yet written.
- The audit question "who changed this and when" always has an answer, because
  the only path that produces ledger rows also stamps the actor.
- A reviewer or auditor can verify the invariants by reading the migrations and
  the grants, without auditing the whole application.

## Alternatives considered

**Application-enforced, with database constraints as a backstop.** Cheaper and
more conventional. Rejected because the backstop cannot express the rules that
matter most; a `CHECK` constraint cannot see the other lines of the entry.

**Application-enforced, with a nightly reconciliation job.** Detects damage
instead of preventing it, and detects it after the numbers have been used.
Also requires someone to be reading the job's output in year three, which is
not a property of a system, it is a hope.

**Stored procedures but with a privileged application role.** Keeps the
validated path but keeps the ability to bypass it. In practice the bypass gets
used — for a data fix, under time pressure, by someone who is confident. The
lack of privilege is the point.
