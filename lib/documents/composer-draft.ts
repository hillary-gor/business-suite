import { Money } from '@/lib/money';
import type { DocumentKind } from './kinds';
import type { DocumentDraft, DocumentParty } from './model';

export function composerMoneyLines(input: {
  lines: ReadonlyArray<{
    description: string;
    itemId?: string;
    quantity?: string;
    unitPrice?: string;
    amount?: string;
    taxCodeId?: string;
  }>;
  items?: ReadonlyArray<{
    id: string;
    label?: string;
    description?: string;
    partNumber?: string;
  }>;
  taxCodes: ReadonlyArray<{ id: string; label: string; rate: string }>;
}): { lines: DocumentDraft['lines']; subtotal: string; tax: string; total: string } {
  let subtotal = Money.zero();
  let tax = Money.zero();
  const lines: DocumentDraft['lines'] = [];
  for (const line of input.lines) {
    const item = input.items?.find((entry) => entry.id === line.itemId);
    const description = line.description || item?.description || item?.label || '';
    if (!description && !line.itemId) continue;
    const net = line.amount
      ? Money.from(line.amount || '0')
      : Money.from(line.quantity || '0').times(line.unitPrice || '0');
    const rate = input.taxCodes.find((code) => code.id === line.taxCodeId)?.rate ?? '0';
    const taxAmount = net.times(rate);
    subtotal = subtotal.plus(net);
    tax = tax.plus(taxAmount);
    lines.push({
      description: description || 'Line',
      sku: item?.partNumber ?? null,
      quantity: line.quantity || (line.amount ? '1' : '0'),
      unitPrice: line.unitPrice || line.amount || '0',
      taxLabel: input.taxCodes.find((code) => code.id === line.taxCodeId)?.label || 'No tax',
      taxAmount: taxAmount.toDatabase(),
      amount: net.toDatabase(),
    });
  }
  return {
    lines,
    subtotal: subtotal.toDatabase(),
    tax: tax.toDatabase(),
    total: subtotal.plus(tax).toDatabase(),
  };
}

export function composerDraft(input: {
  kind: DocumentKind;
  number?: string | null;
  issueDate: string;
  dueDate?: string | null;
  party: DocumentParty;
  shipTo?: DocumentParty | null;
  meta?: DocumentDraft['meta'];
  notes?: string | null;
  currency: string;
  lines: DocumentDraft['lines'];
  subtotal: string;
  tax: string;
  total: string;
}): DocumentDraft {
  return {
    kind: input.kind,
    number: input.number,
    issueDate: input.issueDate,
    dueDate: input.dueDate?.trim() ? input.dueDate : null,
    party: input.party,
    shipTo: input.shipTo,
    meta: input.meta,
    lines: input.lines,
    currency: input.currency,
    subtotal: input.subtotal,
    tax: input.tax,
    total: input.total,
    notes: input.notes,
  };
}

export function composerPaymentDraft(input: {
  kind: 'receipt' | 'refund' | 'supplier-payment';
  issueDate: string;
  party: DocumentParty;
  currency: string;
  amount: string;
  notes?: string | null;
  allocations?: Array<{ description: string; date: string; amount: string }>;
}): DocumentDraft {
  const amount = input.amount || '0';
  const allocations = (input.allocations ?? []).filter((row) => row.amount.trim().length > 0);
  const lines =
    allocations.length > 0
      ? allocations.map((row) => ({
          description: row.description || 'Applied',
          extra: row.date,
          amount: row.amount,
        }))
      : [{ description: 'Amount', extra: input.issueDate, amount }];
  return composerDraft({
    kind: input.kind,
    issueDate: input.issueDate,
    party: input.party,
    notes: input.notes,
    currency: input.currency,
    lines,
    subtotal: amount,
    tax: '0',
    total: amount,
  });
}
