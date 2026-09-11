# ADR 0007: A custom SQL assertion harness and PGlite, instead of pgTAP and Docker

- Status: accepted
- Date: 2026-09-03
- Related: [0001 write path](0001-write-path-architecture.md), [0002 ledger immutability](0002-ledger-immutability.md)

## Context

ADR 0001 puts the business rules in the database. That decision is only
defensible if those rules are tested as thoroughly as application code would
be, which means the database tests must be _easy to run_. A test suite that
requires a working Docker install, a `supabase start`, and ninety seconds of
container boot is a suite that gets run in CI and skipped on the laptop — and
rules that are only checked in CI are rules that get broken locally and
debugged slowly.

pgTAP is the standard answer for testing Postgres. It is good, and it is
available on the hosted project (1.3.3, not installed). The obstacle is that it
is a Postgres extension: running it requires a Postgres instance with the
extension present, which in practice means Docker.

The developers on this project do not all have Docker, and on Windows the
Docker requirement is a real and recurring obstacle rather than a theoretical
one.

## Decision

Two deliberate deviations from the obvious choice, and a reviewer should read
this before flagging either as an oversight.

**1. Tests run against PGlite by default, not a container.**
`scripts/lib/pglite-harness.mjs` boots PGlite — Postgres compiled to WASM —
in-process, applies a small prelude that stands in for the Supabase-managed
objects the migrations expect (`auth` schema, `auth.users`, the `anon`,
`authenticated` and `service_role` roles, the `extensions` schema), then applies
every migration in order. No Docker, no daemon, no port, and a fresh database
per run in a couple of seconds.

Every script honours `SUPABASE_DB_URL`: set it and the same tests run against a
real Postgres instead. So the fast path is the default and the authoritative
path is one environment variable away. CI runs both — `invariants-fast` against
PGlite for quick feedback and the full job against a real Supabase instance,
because PGlite is not byte-identical to a server build and the real database is
the one that matters.

**2. A hand-written assertion library instead of pgTAP.**
`tests/sql/_harness.sql` defines `test.ok`, `test.eq`, `test.eq_num`,
`test.throws` and `test.throws_at_commit`, recording results in a `test.results`
table that `scripts/run-db-tests.mjs` reads back. It is roughly a hundred lines.
It exists because pgTAP cannot be installed into PGlite, and rewriting the
suite for two different assertion libraries would guarantee the two drift.

Two things about it are worth understanding before changing it:

- `test.throws_at_commit` is not redundant with `test.throws`. The balance
  check is a **deferred** constraint trigger, so an unbalanced entry is
  accepted by the `INSERT` and rejected at `COMMIT`. Asserting that requires
  wrapping a whole transaction and inspecting how it ended, which is
  structurally different from catching an exception around one statement, and
  it is the only way to test invariant 3 honestly.
- `test.eq_num` exists separately from `test.eq` because the money domains are
  distinct types. `test.eq(text, numeric, app.money_amount)` fails to resolve
  an overload, and the resulting error is about function signatures rather than
  about the amount being wrong, which wastes the reader's time.

The suite deliberately attacks the tables directly rather than going through
the posting functions. `010_ledger_immutability.sql` runs `UPDATE` and `DELETE`
against `gl.journal_entry` and asserts each is refused. Testing the guard is
the point; the happy path never tries to delete a journal entry.

## Consequences

- PGlite and a server Postgres are not identical. Extension behaviour and some
  planner details differ. The mitigation is that CI runs the same suite against
  real Postgres, so a divergence is caught before merge, and `SUPABASE_DB_URL`
  lets any developer reproduce a CI-only failure locally.
- The harness is ours to maintain. It is small, and it has no dependencies to
  age.
- Test output is our own format rather than TAP, so it does not plug into
  TAP-consuming reporters. Nothing here needs that.
- `pgtap` remains available on the hosted project. If a future need arises for
  assertions this harness cannot express — schema-shape assertions are the
  likely case — it can be installed and used _in addition_, against a real
  database, without displacing the fast local path.

## Alternatives considered

**pgTAP with Docker, and no local fast path.** The conventional choice.
Rejected because it makes the database tests the ones nobody runs before
pushing, which undermines ADR 0001.

**Test the database only through the TypeScript layer with Vitest.** Familiar
tooling, and it cannot test what matters: the guards fire when something writes
the tables _directly_, and the application layer has no way to attempt that.
It would test the happy path and miss every invariant.

**Skip database tests and rely on application tests.** Not compatible with a
system whose correctness argument rests on database-enforced invariants.
