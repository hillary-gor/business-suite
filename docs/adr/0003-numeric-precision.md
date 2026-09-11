# ADR 0003: Fixed-scale NUMERIC everywhere, and no floating point in the money path

- Status: accepted
- Date: 2026-09-03
- Related: [0004 multi-currency](0004-multi-currency.md)

## Context

`0.1 + 0.2 === 0.30000000000000004` in every IEEE 754 double, which includes
every JavaScript `number`. This is not a curiosity; it is how an invoice comes
to be off by a cent, how a trial balance fails to balance by 0.0000001, and how
an inventory valuation drifts away from the general ledger over a few thousand
movements.

The failure is insidious because it is small. A system that is wrong by
thousands gets fixed on the first day. A system that is wrong by one cent per
few hundred transactions passes every casual inspection and is discovered by an
auditor two years in, when the cause is unreachable.

Aircraft parts add a second pressure. Unit prices range from a KES 40 fastener
to a KES 8,000,000 rotable, and quantities can be fractional (litres of
sealant, metres of cable). Four decimal places of money and six of quantity are
not excessive here.

## Decision

**In the database**, three domains defined in `0001_platform.sql`, used
everywhere rather than raw numeric types:

| Domain             | Type            | Used for              |
| ------------------ | --------------- | --------------------- |
| `app.money_amount` | `NUMERIC(19,4)` | every monetary amount |
| `app.quantity`     | `NUMERIC(19,6)` | stock quantities      |
| `app.fx_rate`      | `NUMERIC(19,8)` | exchange rates        |
| `app.tax_rate`     | `NUMERIC(9,6)`  | tax percentages       |

`NUMERIC` in Postgres is exact decimal arithmetic. There is no `float`,
`double precision` or `real` anywhere in the schema, and no `money` type either
— Postgres's `money` carries a locale-dependent scale, which is a trap in a
multi-currency system.

Rates get eight decimals because a rate is a multiplier, and rounding the
multiplier before applying it to a large amount loses more than rounding the
result. Money gets four rather than two because intermediate values — unit
prices, tax bases, cost layers — need more precision than the final presented
figure, and rounding is deferred to the last step.

**In transport**, `NUMERIC` and `int8` are read as strings. `server/db/pool.ts`
overrides the node-postgres type parsers for OIDs 1700 and 20 to return the raw
string. Without this, node-postgres helpfully parses `NUMERIC` into a JavaScript
double and silently discards the precision the database was carefully
preserving — the single most likely way for floating point to re-enter the
system.

**In application code**, `lib/money.ts` wraps `decimal.js`. `Money` is the
only sanctioned way to do arithmetic on an amount. It is constructed from
strings, does exact decimal arithmetic, rounds explicitly with half-up at the
storage scale, and serialises back to a string for the database.

`Money.from()` **rejects a JavaScript `number` that cannot be stored exactly**
at the ledger's scale. `Money.from(0.1 + 0.2)` throws rather than quietly
accepting `0.30000000000000004`. This is aggressive on purpose: by the time a
value is a `number` with floating-point residue, the damage has already
happened somewhere upstream, and the useful moment to fail is the moment it
tries to enter the money path.

**In the linter**, `eslint.config.mjs` bans `parseFloat`, `parseInt`, `isNaN`
and `Math.round` outside `lib/money.ts`. These are the four functions
someone reaches for when they have a numeric string and want to add to it, and
each one is a route back to doubles. The error message points at `Money`.

## How it is proven

- `lib/money.test.ts` covers the arithmetic, the rounding boundaries, the
  rejection of unstorable numbers, and the allocation helper that splits an
  amount without losing or inventing a cent.
- `tests/sql/080_trial_balance.sql` posts randomised entries and asserts total
  debits equal total credits exactly. With floating point anywhere in the path
  this test fails eventually rather than immediately, which is why it is
  randomised.
- The rounding-difference handling in `gl.post_entry` is covered by
  `tests/sql/060_multicurrency_and_fx.sql`.

## Consequences

- Amounts are strings in TypeScript. This looks wrong to anyone who has not
  read this ADR, and is the correct representation. The generated types in
  `server/db/schema.generated.ts` say `string` for every monetary column.
- `Money.from(x)` is required at every boundary where a value enters
  arithmetic. This is friction. It is also the entire mechanism.
- Comparisons must not use `===` on amounts, since `"10.0000"` and `"10.00"`
  are the same amount and different strings. Use `Money`'s comparison methods.
- Presentation rounds to the currency's display scale (two decimals for KES and
  USD) at the last moment, never in storage.

## Alternatives considered

**Integer minor units (store cents as `bigint`).** Exact and fast, and a common
choice. Rejected because it breaks down with four-decimal unit prices and
six-decimal quantities — you end up inventing a scale per column and tracking
it in application code, which is what `NUMERIC(19,4)` already does correctly in
the database, and because every ad-hoc SQL query against the database then
needs to know the scale to be readable.

**`NUMERIC` with no scale specified.** Allows arbitrary precision, which sounds
strictly better, but means two rows can hold the same amount at different
scales and a `CHECK` constraint cannot pin the storage scale down. Fixed scale
makes the constraint expressible.
