# ADR 0002: Posted entries are never edited or deleted, only reversed

- Status: accepted
- Date: 2026-09-03
- Related: [0001 write path](0001-write-path-architecture.md)

## Context

Users make mistakes. Someone will post a KES 400,000 supplier bill to the wrong
account, or with the wrong date, and will want it fixed. The question is what
"fixed" means.

QuickBooks Desktop, which this system replaces, allows editing a posted
transaction in place. This is the single most common source of the problem the
business already has: a report run in March and the same report run in June
return different numbers for the same period, and nobody can say why. The
prior-period figure changed underneath the report because someone edited a
transaction that the report had already counted. There is no record that this
happened, so there is nothing to investigate and no way to reproduce the
earlier number.

For a business that will be audited, "the numbers you reported last quarter can
no longer be reproduced" is not an inconvenience, it is a finding.

## Decision

`gl.journal_entry` and `gl.journal_entry_line` are append-only. So is
`inv.stock_ledger`, and so is `audit.log`.

Enforcement is `app.enable_append_only`, defined in `0001_platform.sql` and
applied in `0002_accounting_core.sql`. It installs triggers that raise on
`UPDATE` and `DELETE`. Two details are deliberate and easy to lose:

- The triggers are **statement-level as well as row-level**. A row-level
  trigger never fires for `TRUNCATE`, and never fires for a `DELETE` that
  matches no rows — so a row-level-only guard would let `TRUNCATE
gl.journal_entry` through, which is the single worst thing that could happen
  to this table.
- The guard is on the table, not in the posting function. It therefore also
  applies to anything that acquires DML privilege later, including a superuser
  session that has not thought about it. It is a speed bump for a determined
  superuser, not a wall — but it converts a catastrophic accident into an error
  message.

Correction is `gl.reverse_entry`. It writes a _new_ entry that mirrors the
original — debits become credits — links it back via
`reversal_of_entry_id`, and requires a written reason. An entry may be reversed
at most once, enforced by a unique constraint on `reversal_of_entry_id` rather
than by application logic. The corrected version is then posted as a further
new entry.

The consequence for reporting is the point of the whole exercise: a report over
a past period returns the same numbers today as it did when it was first run,
because the rows it counted still exist and still say the same thing. A
correction appears as two additional entries with a date and an author, which
is exactly what an auditor wants to see.

`updated_at` and `updated_by` columns exist on mutable master-data tables
(customers, items, accounts) and those tables _are_ editable, with the generic
audit trigger recording before and after images in `audit.log`. Immutability
applies to the ledger, not to everything.

## How it is proven

`tests/sql/010_ledger_immutability.sql` does not test through the application
or through the posting functions. It posts an entry and then attacks the tables
directly with `UPDATE` and `DELETE`, asserting each is refused. It then
exercises `gl.reverse_entry` and asserts the mirror entry is correct and that a
second reversal is refused. Testing the guard rather than the happy path is the
whole value: the happy path never tries to delete a journal entry.

## Consequences

- Storage grows monotonically. For a business of this size, irrelevant.
- The UI must make reversal feel like a normal operation rather than a
  punishment, or users will find another way — most likely by posting an
  ad-hoc adjusting entry that is harder to trace than a reversal.
  `app/(app)/accounting/journals/[entryId]/reverse-form.tsx` exists for
  this reason.
- A genuine data migration that must rewrite history requires an explicit,
  reviewed, temporary disabling of the trigger by a superuser. This should
  happen approximately never, and the difficulty is intentional.
- Deleting a draft is not a thing. Nothing is a draft; if it is in the ledger,
  it was posted. Documents that need a draft stage (quotations, orders) keep
  that state in their own tables and only touch the ledger when they post.
