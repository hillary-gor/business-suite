# SkyJet Business Suite

Cloud business management platform for **SkyJet Aircraft Spares**, a Kenyan
aircraft-parts distributor. It is progressively replacing the company's
QuickBooks Desktop installation with a system that understands the parts
business: serial-numbered rotables with airworthiness certificates, condition
codes, shelf life, multi-currency purchasing, and KRA/eTIMS fiscalisation.

This is not a demo or a prototype. It holds the general ledger and the stock
records of an operating business, it will be audited, and it is expected to be
maintained by engineers who have never spoken to whoever wrote it.

**If you are that engineer, read this file and then
[docs/adr/0001-write-path-architecture.md](docs/adr/0001-write-path-architecture.md).**
Between them they explain the decisions that will otherwise look strange, and
several things in this codebase look strange for good reasons.

---

## Contents

- [Why the architecture is shaped like this](#why-the-architecture-is-shaped-like-this)
- [The eight invariants](#the-eight-invariants)
- [Running it](#running-it)
- [Scripts](#scripts)
- [The query checker](#the-query-checker)
- [Repository layout](#repository-layout)
- [Deliberate deviations](#deliberate-deviations)
- [Scope: Phase 1 and beyond](#scope-phase-1-and-beyond)
- [Architecture decision records](#architecture-decision-records)

---

## Why the architecture is shaped like this

Stack: Next.js (App Router, TypeScript, strict) on Supabase Postgres.

The organising decision is that **the database, not the application, owns
financial correctness.** Everything else follows from it, and it is worth
understanding the reason before you change anything.

In a conventional application the database stores whatever it is handed, and
correctness depends on every code path that writes being correct. That includes
the data-fix script, the admin panel added in year three, the second
application someone writes against the same database, and every pull request
from now until the system is retired. Each is an independent chance to create
an unbalanced entry or post into a closed period. Nothing catches it at the
time; it surfaces during a reconciliation months later, after the wrong numbers
have been filed with KRA and used to make decisions.

So the write path has four layers, each of which assumes the one above it has
already failed.

```
Browser  ──reads only──────────────────────────────►  Postgres (RLS-scoped)
   │
   │ form submit
   ▼
Server Action        authorise() → Zod parse → module
   │                 permission check happens HERE
   ▼
Posting function     gl.post_entry / inv.post_movement   (SECURITY DEFINER)
   │                 period open? accounts valid? balanced? number allocated?
   ▼
Ledger tables        gl.journal_entry, gl.journal_entry_line, inv.stock_ledger
                     append-only; skyjet_app has NO insert/update/delete here
```

**The browser never writes.** It holds a publishable Supabase key that can read
what the signed-in user is entitled to read, and nothing more. There is no code
path from the client to a write. A hostile client with a valid session and a
copy of our source can, at most, read its own entity's data.

**Server Actions are where permissions are checked.** Every action calls
`authorise()` first — it resolves the session, loads effective permissions for
the target entity, and refuses if the required permission is missing. Then Zod
parses the input, so a malformed payload is rejected at the boundary rather
than halfway through a transaction.

> `proxy.ts` refreshes Supabase sessions and is **not** an authorisation
> boundary. It says so in the file. Middleware that looks like a security
> control but is not is more dangerous than no middleware, because reviewers
> assume it is doing the job.

**Posting functions own the ledger.** `gl.post_entry` is the only path into
`gl.journal_entry`. It validates the period, accounts, currencies, dimensions
and balance, allocates a gapless document number, and writes entry and lines
atomically. There is no flag to skip validation, because a flag like that would
eventually be used.

**`skyjet_app` holds no DML privilege on any ledger table.** This is what makes
the layers above more than a convention. The role the application connects as
has `EXECUTE` on the posting functions and `SELECT` on what it reads. It has no
`INSERT`, `UPDATE` or `DELETE` on `gl.journal_entry`,
`gl.journal_entry_line` or `inv.stock_ledger`. **A SQL injection in application
code cannot forge a journal entry** — the connection carrying the injected
statement lacks the privilege to execute it. The functions can write because
`SECURITY DEFINER` runs them as their owner, and the only way in is to satisfy
their validation.

Never "fix" a refused write by pointing `DATABASE_URL` at `postgres` or the
service role. If a write is being refused, the write is going the wrong way
round.

### RLS is the second lock, not the first

Row-Level Security is enabled deny-by-default on every table in every business
schema (`0008_row_level_security.sql`), and `100_security_posture.sql` asserts
there are no gaps. But it is deliberately not the primary write control, and
the reason is structural rather than stylistic:

RLS constrains **which rows** a role may touch. It cannot express "the debits
in this entry equal the credits", because that is a claim about a set of rows
that do not all exist yet. It cannot check that the period is open, or that a
stock movement carries its matching value posting. RLS is excellent at
containing a compromised session to one entity's data, which is exactly what it
is used for here. Treating it as the main defence for ledger integrity is a
common and expensive mistake.

---

## The eight invariants

These are the properties the system guarantees regardless of what calls it.
Until now they existed only in migration comments; this is the index.

| #   | Invariant                                                                                                                                                                                                                        | Enforced in                                                                                                                                                                                                                                    | Proven by                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | **Money is exact.** Amounts are `NUMERIC(19,4)`, quantities `NUMERIC(19,6)`, FX rates `NUMERIC(19,8)`. No float anywhere in the money path, in the database or in TypeScript.                                                    | Domains `app.money_amount` / `app.quantity` / `app.fx_rate` in `0001_platform.sql`; `NUMERIC` read as string in `server/db/pool.ts`; `lib/money.ts`; a lint rule banning `parseFloat`/`parseInt`/`isNaN`/`Math.round` outside the money module | `lib/money.test.ts`, `tests/sql/080_trial_balance.sql` |
| 2   | **A posted entry is immutable.** Never edited, never deleted — corrected by reversal, which writes a new mirror entry and requires a reason. An entry can be reversed at most once.                                              | `app.enable_append_only` (`0001_platform.sql`) applied in `0002_accounting_core.sql`; `gl.reverse_entry` in `0005_posting_engine.sql`; unique constraint on `reversal_of_entry_id`                                                             | `tests/sql/010_ledger_immutability.sql`                |
| 3   | **Every entry balances.** Total debits equal total credits **in the base currency**, checked by the database at `COMMIT`, not by the application.                                                                                | Deferred constraint trigger `gl.assert_entry_balanced`, `0002_accounting_core.sql`                                                                                                                                                             | `tests/sql/020_balance_enforcement.sql`                |
| 4   | **One posting engine.** No business document writes ledger lines. Everything goes through `gl.post_entry`, and the application role lacks the privilege to do otherwise.                                                         | `0005_posting_engine.sql`, including the `skyjet_app` grant lockdown                                                                                                                                                                           | `tests/sql/100_security_posture.sql`                   |
| 5   | **Replay cannot double-post.** A posting request carrying an idempotency key returns the original entry instead of creating a second one — so a retried Server Action, a double-clicked button or a redelivered webhook is safe. | `app.idempotency_keys` (`0001_platform.sql`); checks at the top of `gl.post_entry` and `gl.reverse_entry` (`0005_posting_engine.sql`)                                                                                                          | `tests/sql/040_idempotency.sql`                        |
| 6   | **Document numbers are gapless**, per entity, per document type, per fiscal year. A rolled-back transaction returns its number to the pool rather than burning it.                                                               | `app.numbering_sequences` and `app.next_document_number`, `0001_platform.sql`                                                                                                                                                                  | `tests/sql/030_document_numbering.sql`                 |
| 7   | **A closed period rejects postings.** Reopening requires the `gl.reopen_period` permission, a written reason, and that no later period is already closed — and it is logged.                                                     | `gl.assert_period_open` (`0002_accounting_core.sql`), called by every posting path; `gl.close_period` / `gl.reopen_period` (`0006_period_close_and_opening_balances.sql`)                                                                      | `tests/sql/050_period_control.sql`                     |
| 8   | **Stock quantity and stock value move together.** One transaction writes the stock ledger row and the GL value posting, or neither happens. The sub-ledger ties to the inventory control accounts at all times.                  | `inv.post_movement` (`0005_posting_engine.sql`); `inv.verify_inventory_ties_to_gl` (`0004_inventory_core.sql`), surfaced on the dashboard                                                                                                      | `tests/sql/070_inventory_costing.sql`                  |

Invariant 6 deserves a note, because "gapless" is stronger than "unique" and
costs more. Numbers are allocated under a row lock rather than from a Postgres
sequence, because a sequence deliberately does not roll back and would leave
gaps. A gap in an invoice series is a question an auditor is entitled to ask
and the business must be able to answer, so the contention is worth it.

---

## Running it

### Prerequisites

- **Node.js 20 or later.** That is the only hard requirement.
- **Docker + Supabase CLI** — optional. Needed only to run against a real
  Postgres locally. Everything below works without it.

```bash
npm install
cp .env.example .env.local   # then fill it in — read the comments, they matter
```

`.env.example` documents the three connection-string formats and the reasons
they are not interchangeable: the direct host is IPv6-only, the pooler hostname
is per-tenant and must not be guessed, and pooler usernames are
`<role>.<project-ref>`. See
[ADR 0006](docs/adr/0006-transaction-mode-pooling.md).

### Path A — no Docker (the default, and the fast one)

The database scripts boot **PGlite**, Postgres compiled to WASM, in-process.
No daemon, no container, no port; a fresh database in a couple of seconds.

```bash
npm run db:validate       # apply all migrations + seed, report the first failure
npm run test:sql          # run the SQL invariant suite
npm run db:check-queries  # check every SQL query in server/ and app/ against the schema
npm run verify            # everything: format, lint, typecheck, unit, queries, SQL
```

This is how you should work day to day. See
[ADR 0007](docs/adr/0007-sql-test-harness.md) for why.

### Path B — real Postgres

Every script above honours `SUPABASE_DB_URL`. Set it and the same code runs
against a real database instead of PGlite — locally via the Supabase CLI, or
against the hosted project.

```bash
npm run db:start          # supabase start
npm run db:reset          # drop, re-apply all migrations, re-seed
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:sql
```

PGlite is not byte-identical to a server build, so CI runs the suite **both
ways**: a fast PGlite job for feedback and a full job against real Supabase,
which is the one that decides. If you hit a CI-only failure, reproduce it by
setting `SUPABASE_DB_URL` locally.

### Then

```bash
npm run dev
```

---

## Deploying to a hosted Supabase project

Three connection strings, and they are not interchangeable. `.env.example`
explains each; the short version is that the direct host
`db.<ref>.supabase.co` publishes only an AAAA record, so anything without IPv6
— most CI runners, most serverless — cannot reach it at all and must use a
pooler host. Pooler usernames are `<role>.<project-ref>`, not `<role>`.

```bash
# 1. Schema. Applies pending migrations and records them in schema_migrations.
#    Session mode (5432), because DDL needs full protocol support.
npx supabase db push --db-url "$SUPABASE_DB_URL"

# 2. Reference data: chart of accounts, tax codes, roles, fiscal calendar.
#    --exclude-local strips the fenced developer fixtures. Never apply
#    seed.sql to a hosted database without it — see below.
npm run db:seed

# 3. The application login. Not in a migration, because a password in a
#    migration is a password in version control.
npm run db:provision-role

# 4. Prove the lockdown is real, as the application sees it.
npm run db:verify-role
```

**On the seed.** `supabase/seed.sql` contains a `-- @local-only:begin` /
`-- @local-only:end` region holding the development login role, whose password
is in version control. `scripts/apply-sql.mjs --exclude-local` removes fenced
regions before applying. Put any future developer-only fixture inside a marked
region; do not rely on remembering.

**On step 4.** It is not ceremony. The harness connects as the database owner,
which bypasses RLS and satisfies the privileged-session check, so there are
whole classes of misconfiguration it structurally cannot see. Both controls
that were broken in the first deployment were found by this script and by
nothing else. Run it after any change to grants, policies or roles. ADR 0008
has the full account.

---

## Scripts

| Script                                                  | What it does                                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`                       | Next.js                                                                                                              |
| `npm run lint` / `lint:fix`                             | ESLint, including the rules that ban float arithmetic on money                                                       |
| `npm run typecheck`                                     | `tsc --noEmit`                                                                                                       |
| `npm run test` / `test:watch`                           | Vitest unit tests (the money module, mostly)                                                                         |
| `npm run test:sql`                                      | **The invariant suite.** `tests/sql/*.sql`, each file in its own transaction                                         |
| `npm run db:validate`                                   | Apply every migration and the seed, and report the first failure. The quickest check that a migration is well-formed |
| `npm run db:check-queries`                              | **The query checker.** See below                                                                                     |
| `npm run db:types`                                      | Regenerate `server/db/schema.generated.ts` from the schema                                                           |
| `npm run db:seed`                                       | Apply `supabase/seed.sql` to a hosted database, stripping the local-only fixtures                                    |
| `npm run db:provision-role`                             | Create or rotate the application login role. Writes the password to `.env.local`, never to the terminal              |
| `npm run db:verify-role`                                | **Posture check.** Connects over the real pooler as the real application role and asserts what it cannot do          |
| `npm run db:provision-user`                             | Grant a Supabase Auth account a role in an entity. Signing up alone grants nothing                                   |
| `npm run db:start` / `db:stop` / `db:reset` / `db:diff` | Supabase CLI wrappers                                                                                                |
| `npm run format` / `format:check`                       | Prettier                                                                                                             |
| **`npm run verify`**                                    | **Run this before pushing.** format → lint → typecheck → unit → query check → SQL invariants. What CI runs           |

If you regenerate types, commit the result. CI fails if
`schema.generated.ts` is stale, because a generated file that disagrees with
the schema is worse than no generated file.

---

## The query checker

`scripts/validate-queries.mjs`, run by `npm run db:check-queries`.

**Do not delete this. It is not a linter and it is not redundant with
TypeScript.**

It extracts every SQL string embedded in `server/**` and executes each one
against a real schema (PGlite, or `SUPABASE_DB_URL`) inside a transaction that
is rolled back. It then classifies the result: name-resolution errors are
reported as failures, while errors that prove the query _did_ resolve — a
missing parameter type, a permission refusal, a raised business exception — are
treated as a pass.

It exists because of a gap nothing else covers. SQL in a TypeScript template
literal is an opaque string to the compiler; the row type is whatever you
declared it to be, and there is nothing connecting that declaration to the
database. A query selecting a column that was renamed three migrations ago
compiles, typechecks, passes lint, and fails at runtime — on the page nobody
opened during review.

This is not hypothetical. On its first run it found **eight** real mismatches
between the application queries and the schema, including a wrong join
condition and three functions called with the wrong argument list. Every one
would have reached production.

### Why `select *` is rejected

This surprises people, so:

1. `select *` resolves against _any_ table shape. If a column is renamed, the
   query keeps succeeding and the value arrives in TypeScript as `undefined`.
   Nothing throws. A monetary figure renders as blank or `NaN`, or a condition
   on it silently takes the wrong branch. **An explicit column list turns that
   into a loud error at check time.**
2. The checker cannot see through a star. A star means the query is unverified,
   so accepting it would create a way to opt out of the check by writing
   sloppier SQL.

List the columns the code actually reads. It is also better SQL: it documents
the query's real dependencies, and it stops a wide table dragging bytes across
the wire.

---

## Repository layout

```
app/                      Next.js App Router (project root)
  (app)/                  authenticated shell (nav, entity picker)
    accounting/           accounts, journals, trial-balance, ledger,
                          periods, opening-balances
  sign-in/                auth entry
components/ui.tsx         shared presentational primitives
lib/money.ts              THE money type. All amount arithmetic goes here
proxy.ts                  session refresh. NOT an authorisation boundary
server/
  actions/                Server Actions: authorise → parse → call module
  auth/session.ts         session resolution, permission loading, authorise()
  db/
    pool.ts               connection pool; transaction-pooler constraints
    transaction.ts        withTransaction; stamps actor/entity/request
    errors.ts             Postgres errors → messages a user can act on
    schema.generated.ts   generated; do not hand-edit
  modules/accounting/     business logic; the only caller of posting functions
    schemas.ts            Zod schemas — the trust boundary
types/                    shared TypeScript types
public/                   static assets

supabase/
  migrations/
    0001_platform.sql     entities, users, RBAC, audit, numbering, idempotency
    0002_accounting_core.sql  currencies, FX, fiscal calendar, CoA, journal
    0003_masters.sql      customers, suppliers, items, warehouses, tax codes
    0004_inventory_core.sql   stock units/lots, certificates, stock ledger
    0005_posting_engine.sql   gl.post_entry, inv.post_movement, privileges
    0006_period_close_and_opening_balances.sql  close, FX reval, QB cutover
    0007_etims_architecture.sql   integration outbox, eTIMS records
    0008_row_level_security.sql   deny-by-default RLS everywhere
  seed.sql                CoA, roles, permissions, Kenyan tax codes, calendar

tests/sql/                the invariant suite, numbered by invariant
scripts/                  PGlite harness, test runner, query checker, codegen
docs/adr/                 architecture decision records
```

Migrations are **append-only in effect**: once applied to the hosted database,
edit them only for changes that are provably no-ops there. Everything else is a
new numbered migration.

---

## Deliberate deviations

Choices that look like mistakes and are not. Each has an ADR; this is the
summary so a reviewer does not have to guess.

**Business logic in PL/pgSQL rather than TypeScript.** Unfashionable, harder to
test with familiar tooling, and the only place a rule can be enforced for every
caller including software not yet written. → [ADR 0001](docs/adr/0001-write-path-architecture.md)

**A hand-written SQL assertion harness instead of pgTAP.** pgTAP is the
standard tool and is available on the hosted project. It is a Postgres
extension, so it cannot be installed into PGlite, which would mean the
database tests require Docker — and tests that require Docker are the tests
that get skipped locally, which undermines the reason for putting the logic in
the database at all. `tests/sql/_harness.sql` is about a hundred lines with no
dependencies. Maintaining two assertion libraries would guarantee the two
suites drift. → [ADR 0007](docs/adr/0007-sql-test-harness.md)

**Monetary amounts are `string` in TypeScript, not `number`.** A `number`
cannot hold `NUMERIC(19,4)` faithfully. The type parsers in `pool.ts` keep
`NUMERIC` as text on the way out precisely so node-postgres does not helpfully
undo the precision the database preserved. → [ADR 0003](docs/adr/0003-numeric-precision.md)

**`parseFloat`, `parseInt`, `isNaN` and `Math.round` are banned by lint outside
`lib/money.ts`.** These are the four functions someone reaches for when
they have a numeric string and want to add to it, and each is a route back to
floating point. → [ADR 0003](docs/adr/0003-numeric-precision.md)

**A client-side pool of 2.** Looks far too small. The pooler is doing the real
pooling; every connection an instance holds occupies one of its client slots,
and a serverless deployment may have hundreds of instances. → [ADR 0006](docs/adr/0006-transaction-mode-pooling.md)

**`statement_timeout` is set per transaction rather than on the connection.**
node-postgres would put it in the startup packet, which a transaction-mode
pooler rejects. It is also the safer scoping: a transaction-local setting
cannot leak onto the next request that inherits the connection. → [ADR 0006](docs/adr/0006-transaction-mode-pooling.md)

**Gapless numbering under a row lock instead of a Postgres sequence.**
Sequences do not roll back, and a gap in an invoice series is a question the
business must be able to answer.

**Weighted average for consumables but specific identification for serialised
parts.** Two costing paths is more code. Averaging a USD 40,000 overhauled
actuator with a USD 12,000 as-removed one makes per-unit margin meaningless,
and margin is a number the business prices from. → [ADR 0005](docs/adr/0005-inventory-costing.md)

**No ORM.** Explicit SQL against database functions, checked by the query
checker. An ORM's value is generating DML from models, and the application is
not permitted to issue DML against the tables that matter.

---

## Scope: Phase 1 and beyond

### Phase 1 — done

The accounting and inventory **foundation**, which is the part everything else
has to sit on and the part that is expensive to change later.

- Platform: multi-entity, users, RBAC, generic before/after audit trigger on
  every auditable table, gapless numbering, idempotency keys, attachments
- General ledger: chart of accounts for a parts distributor, fiscal calendar,
  the posting engine, reversal, trial balance, ledger detail
- Multi-currency: dual amounts per line, FX rate tables, realised FX on
  settlement, period-end revaluation of monetary balances only
- Inventory foundation: serialised units with condition codes, certificates,
  shelf life; lots; append-only stock ledger; both costing methods; the
  sub-ledger-to-GL tie-out
- Period close, year-end close, and the validated QuickBooks opening-balance
  import
- eTIMS **architecture**: transactional outbox, device registration, item
  classification, fiscalisation record tables
- Deny-by-default RLS, the invariant suite, the query checker, CI

### Phase 1 — explicitly not included

Do not read the presence of a table as the presence of a feature.

- **Sales cycle is partial.** Customers, invoices and customer receipts post
  through `sales.issue_invoice` / `sales.post_receipt`. Quotations, sales
  orders, picking, packing, deliveries, credit notes and eTIMS transmission
  are not built.
- **No purchasing cycle.** No requisitions, purchase orders, goods receipt or
  supplier bills UI.
- **Banking is partial.** Receipts deposit to cash/bank accounts. Transfers,
  withdrawals, reconciliation and statements are not built.
- **No live eTIMS transmission.** The outbox, the classification data and the
  record tables exist and are tested; the worker that talks to KRA and the
  signing integration do not.
- **No expense capture, fixed assets, or payroll.**
- **No document storage wiring.** `app.attachments` and the bucket config exist;
  upload flows do not.

### Phase 2 onward

Roughly in dependency order:

1. **Sales cycle** — quotation → order → pick/pack → delivery + POD → invoice,
   each posting through `gl.post_entry` and `inv.post_movement`
2. **Purchasing cycle** — PO → goods receipt (with certificate capture at the
   receiving desk, where the paperwork actually is) → supplier bill
3. **Payments and banking** — receipts, payments, allocation to open items,
   realised FX on settlement, bank reconciliation, customer statements
4. **eTIMS go-live** — the outbox worker, signing, and the retry/backoff
   handling for KRA being unavailable
5. **Reporting** — P&L, balance sheet, aged receivables and payables, stock
   valuation, margin by part and by customer
6. **Expenses, fixed assets, document management**

The order is deliberate: revenue and stock movement first, because that is
where the business's daily pain is, and because the accounting foundation
underneath them already exists and is tested.

---

## Architecture decision records

Read these before proposing a structural change. If you supersede one, write a
new ADR that says so rather than editing the old one — the record of what was
believed and when is the point.

| ADR                                                                                | Decision                                                               |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [0001](docs/adr/0001-write-path-architecture.md)                                   | The ledger is written only by database functions                       |
| [0002](docs/adr/0002-ledger-immutability.md)                                       | Posted entries are never edited or deleted, only reversed              |
| [0003](docs/adr/0003-numeric-precision.md)                                         | Fixed-scale `NUMERIC` everywhere; no float in the money path           |
| [0004](docs/adr/0004-multi-currency.md)                                            | Dual amounts on every ledger line, KES functional                      |
| [0005](docs/adr/0005-inventory-costing.md)                                         | Costing method per item: specific identification vs weighted average   |
| [0006](docs/adr/0006-transaction-mode-pooling.md)                                  | The application connects through a transaction-mode pooler             |
| [0007](docs/adr/0007-sql-test-harness.md)                                          | A custom SQL assertion harness and PGlite, instead of pgTAP and Docker |
| [0008](docs/adr/0008-authorization-must-be-tested-from-an-unprivileged-session.md) | Privilege keys on `session_user`; RLS names the application role       |

---

## Conventions worth knowing

- **Never interpolate a value into SQL.** Always parameterise. The query
  checker relies on parameterised form, and so does not being injectable.
- **Never pass a `name` to a node-postgres query.** Named prepared statements
  break under transaction-mode pooling; `pool.ts` throws if you try.
- **Session-ish state uses `set_config(..., true)`**, transaction-scoped. A
  session-level `SET` leaks onto the next request that inherits the pooled
  connection — which for the audit context would be a security bug.
- **Every write runs inside `withTransaction`**, which stamps the acting user,
  entity and request id. A write without them is either unattributed or
  refused.
- **Amount comparisons go through `Money`.** `"10.0000"` and `"10.00"` are the
  same amount and different strings.
- **Run `npm run verify` before pushing.**
