# ADR 0005: Costing method per item — specific identification for serialised, weighted average for consumables

- Status: accepted
- Date: 2026-09-03
- Related: [0001 write path](0001-write-path-architecture.md)

## Context

An aircraft-parts business does not have one kind of inventory, it has two, and
they need different costing.

A rotable — a landing-gear actuator, a fuel pump — has a serial number, an
airworthiness certificate, a condition (new, overhauled, serviceable,
as-removed), accumulated hours and cycles, and possibly a shelf-life expiry. It
was bought for a specific price. When it is sold, the cost of sale is _that
part's_ cost. Averaging it with a different actuator bought two years ago at a
different price produces a margin figure for the sale that is simply not true,
and the margin per unit is the number the business is managed by.

A consumable — rivets, sealant, safety wire, O-rings — is fungible. Nobody
knows or cares which rivet went into which job. Tracking individual rivet cost
would be expensive, useless, and would generate a stock ledger row per rivet.

Compounding this: certification traceability is a hard requirement, not an
accounting nicety. An installed part must be traceable to its certificate and
its source. That obligation exists regardless of costing, and it means
serialised parts already need individual identity in the database. Given they
have individual identity, giving them individual cost is nearly free.

## Decision

`inv.items.costing_method` and `inv.items.tracking_mode` are per-item, set when
the item is created.

**Serialised items: specific identification.** Each physical unit is a row in
`inv.stock_units` carrying its own `acquisition_cost`, plus its condition,
certificate links, hours and cycles. An outbound movement must name the unit;
`inv.post_movement` refuses a serialised issue that does not identify one,
rather than picking a unit itself. The cost of sale is that unit's acquisition
cost. Margin per sale is exact.

**Bulk items: weighted average.** Held as `inv.stock_lots` with a running
average maintained by `inv.current_average_cost`, and issues costed by
`inv.issue_cost`. Weighted average rather than FIFO because FIFO requires
maintaining and consuming cost layers in order, which is materially more
machinery, and for low-value fungible consumables the difference in reported
cost is immaterial. Weighted average is also what the business already gets
from QuickBooks, so the cutover does not introduce an unexplained change in
margin.

**Quantity and value move together or not at all.** This is invariant 8 and the
reason `inv.post_movement` exists rather than separate stock and GL calls. A
single function, in one transaction, writes the `inv.stock_ledger` row and
calls `gl.post_entry` for the value posting. There is no ordering in which one
succeeds and the other does not. `inv.verify_inventory_ties_to_gl` compares the
sub-ledger valuation against the inventory control accounts and is expected to
return zero variance at any moment — it is exposed on the dashboard, so a
divergence is visible the day it happens rather than at year end.

**Condition cannot silently improve.** `inv.fn_stock_unit_condition_guard`
blocks a downgraded unit being upgraded without a certificate to justify it.
An as-removed unit becoming "overhauled" by an `UPDATE` would be both an
airworthiness problem and a stock-value overstatement, and it is exactly the
kind of change a well-meaning bulk edit makes.

**Releasability is a database check.** `inv.unit_is_releasable` and
`inv.assert_unit_releasable` enforce that a unit has a valid certificate, an
acceptable condition, and unexpired shelf life before it can be issued. A part
that cannot be legally installed cannot be shipped, and that decision does not
depend on the UI having remembered to check.

## How it is proven

`tests/sql/070_inventory_costing.sql` covers specific-identification cost of
sale, weighted-average recalculation across receipts at different prices,
refusal of a serialised issue with no unit named, refusal of an inbound
movement with no unit cost, refusal of a movement that would drive stock
negative, and finally `inv.verify_inventory_ties_to_gl` returning zero variance
after a mixed sequence of movements.

## Consequences

- The costing method is per item, so both code paths exist permanently and both
  need maintaining. This is the cost of the domain being genuinely two domains.
- Changing an item's costing method after it has movements is not supported.
  The existing ledger was costed under the old method and retrospectively
  recosting it would rewrite history. Treat it as a new item.
- Serialised items generate more rows — one per physical unit, forever. For
  aircraft parts this is both acceptable and the point, since those rows carry
  the traceability record.
- Weighted average means an issue's cost depends on receipts posted before it,
  so backdating a receipt into a period where issues have already been costed
  is refused. Period control (invariant 7) is what makes this enforceable.

## Alternatives considered

**FIFO for everything.** Defensible and common. Rejected for serialised parts
because it produces a knowably wrong margin when identity is already tracked,
and rejected for consumables as unnecessary machinery.

**Standard costing with variance accounts.** Appropriate for manufacturing with
stable BOMs. Wrong for a distributor whose acquisition costs move with the FX
rate and the used-parts market; the variance accounts would absorb everything
interesting and explain nothing.

**Average costing for everything, with serials tracked for traceability only.**
Tempting, since the traceability requirement is met either way and there is one
costing path to maintain. Rejected because per-unit margin is a number the
business actually uses to price and to decide what to stock, and averaging
across a USD 40,000 overhauled unit and a USD 12,000 as-removed one makes that
number meaningless.
