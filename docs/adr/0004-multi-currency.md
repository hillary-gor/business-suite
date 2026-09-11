# ADR 0004: Dual amounts on every ledger line, KES functional

- Status: accepted
- Date: 2026-09-03
- Related: [0003 numeric precision](0003-numeric-precision.md)

## Context

SkyJet buys in USD and EUR from overseas suppliers and sells largely in KES.
Its statutory reporting to KRA is in KES. The gap between those two facts is
where multi-currency accounting lives, and getting it wrong produces a ledger
that balances in no currency at all.

The specific problem: a USD 10,000 supplier bill raised when the rate is 129
and paid when the rate is 133 is the same USD 10,000 obligation throughout, but
it is KES 1,290,000 when raised and KES 1,330,000 when paid. The KES 40,000
difference is a real economic loss, it must land in the P&L, and it must not be
confused with a change to the supplier's balance — the supplier is owed exactly
what they were owed.

A naive design stores one amount per line and converts on the way out. That
cannot work: converting a historical balance at today's rate silently
restates history, and there is nowhere for the FX gain or loss to be recorded.

## Decision

**KES is the functional currency.** Every `gl.journal_entry_line` carries both
amounts: the transaction amount in its own currency, and the base amount in
KES, with the `fx_rate` used to derive it stored on the line.

Storing the rate on the line, rather than looking it up at report time, is what
makes history reproducible. The line records what the rate _was_, so a report
of a past period returns the same KES figure forever — the same property ADR
0002 secures for the entry itself.

**Balance is enforced on the base amounts.** Debits must equal credits in KES.
This is the only currency in which a mixed-currency entry can be expected to
balance, and it is checked at `COMMIT` by a deferred constraint trigger
(`gl.assert_entry_balanced`), because the lines of a balanced entry are
individually unbalanced while they are being inserted.

Translation rounding is real: converting each line independently can leave the
base amounts out by a cent. `gl.post_entry` detects this and posts the residue
to a configured rounding account rather than rejecting the entry or, worse,
adjusting a line to force a balance.

**Three distinct events, kept distinct:**

1. **Initial recognition.** Rate resolved via `app.fx_rate_on(from, to, date,
rate_type)`, which returns the applicable rate on or before the date. There
   is no fallback to "nearest" or "latest" — a missing rate is an error, not
   something to interpolate, because a guessed rate becomes a permanent part of
   the record.

2. **Realised gain or loss, on settlement.** When a foreign-currency invoice is
   paid, the difference between the base amount recognised and the base amount
   settled is realised FX and posts to the P&L. The foreign-currency balance of
   the receivable or payable goes to zero; it was never wrong.

3. **Unrealised gain or loss, at period end.** `gl.revalue_fx` walks the open
   foreign-currency balances on accounts flagged as monetary, restates them at
   the period-end rate, and posts the difference as unrealised FX.

The monetary/non-monetary distinction is why `gl.accounts` carries an
`is_monetary` flag. Cash, receivables and payables are monetary and get
revalued. Inventory and fixed assets are not: a part bought for USD 5,000 is
carried at its historical KES cost and does not move when the shilling does.
Revaluing inventory would be wrong, and without the flag it is the default
behaviour of a naive revaluation routine.

`gl.fx_revaluation_run` and `gl.fx_revaluation_position` record each run's
cumulative adjustment per position, so a second revaluation in the same period
posts only the increment rather than double-counting.

## How it is proven

`tests/sql/060_multicurrency_and_fx.sql` covers rate resolution including the
on-or-before boundary, dual-amount storage, translation rounding, a first
revaluation, a _second_ revaluation asserting only the increment is posted, and
that the ledger still balances in KES after all of it.

## Consequences

- Every posting path must supply a currency and a rate per line, even for
  KES-only entries where the rate is 1 and the two amounts are equal. A `CHECK`
  constraint enforces that they _are_ equal in that case, so the redundancy is
  self-checking rather than a place for drift.
- FX rates must be loaded before postings that need them. There is no
  self-healing here by design; a missing rate blocks the posting.
- Period close depends on revaluation having been run, which
  `checkCloseReadiness` in `server/modules/accounting/periods.ts` surfaces
  in the UI before close is attempted.
- Changing the functional currency later is a major migration. Given a Kenyan
  entity reporting to KRA, this is an acceptable bet.

## Alternatives considered

**Single amount plus conversion at report time.** Simpler schema, and wrong: it
restates history whenever rates are updated and provides no home for realised
FX.

**A separate FX-adjustment ledger alongside the main one.** Keeps the main
ledger single-currency. Rejected because two ledgers must then be reconciled to
produce any statement, and the reconciliation is the thing most likely to be
wrong.
