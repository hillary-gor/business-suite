import { Money } from '@/lib/money';

export type InvoiceStockWarning = 'out' | 'short';

/** Stocked lines warn when on-hand cannot cover the quantity. Services skip this. */
export function invoiceLineStockWarning(input: {
  isStocked: boolean;
  qtyOnHand: string;
  quantity: string;
}): InvoiceStockWarning | null {
  if (!input.isStocked) return null;
  const onHand = Money.from(input.qtyOnHand || '0');
  const qty = Money.from(input.quantity || '0');
  if (!qty.isPositive()) return null;
  if (onHand.isZero() || onHand.isNegative()) return 'out';
  if (qty.comparedTo(onHand) > 0) return 'short';
  return null;
}

export function invoiceStockWarningText(warning: InvoiceStockWarning, qtyOnHand: string): string {
  if (warning === 'out')
    return 'This item is out of stock. You can still save a draft; issuing will fail.';
  return `Only ${qtyOnHand} on hand. Reduce the quantity or save as a draft; issuing will fail.`;
}

/** Spread a received amount across open invoices in date order. */
export function applyReceiptAmount(
  invoices: ReadonlyArray<{ id: string; outstanding: string }>,
  amount: string,
): Record<string, string> {
  let remaining = Money.from(amount || '0');
  if (!remaining.isPositive()) return {};
  const next: Record<string, string> = {};
  for (const invoice of invoices) {
    if (!remaining.isPositive()) break;
    const open = Money.from(invoice.outstanding);
    const applied = remaining.comparedTo(open) >= 0 ? open : remaining;
    if (!applied.isPositive()) continue;
    next[invoice.id] = applied.toDatabase();
    remaining = remaining.minus(applied);
  }
  return next;
}

export function receiptCreditRemainder(amount: string, applied: string): string {
  const extra = Money.from(amount || '0').minus(applied || '0');
  return extra.isPositive() ? extra.toDatabase() : '0';
}
