import { describe, expect, it } from 'vitest';
import {
  buildDocumentModel,
  mapStatementDocument,
  partyRoleFor,
  visibleColumns,
  type CommercialPrintInput,
} from '@/lib/documents/mappers';

const invoiceInput: CommercialPrintInput = {
  kind: 'invoice',
  number: '1001',
  issueDate: '2026-09-06',
  dueDate: '2026-09-20',
  currency: 'KES',
  party: { name: 'Hangar Co', email: 'ops@example.com' },
  lines: [
    {
      description: 'Oil filter',
      sku: 'FIL-1',
      quantity: '2',
      unitPrice: '1000',
      taxLabel: 'VAT 16%',
      taxAmount: '320',
      amount: '2000',
    },
  ],
  subtotal: '2000',
  tax: '320',
  total: '2320',
};

describe('document mappers', () => {
  it('builds an invoice model with tax and totals', () => {
    const model = buildDocumentModel(invoiceInput);

    expect(model.title).toBe('Invoice');
    expect(model.showMoney).toBe(true);
    expect(model.lines[0]?.taxLabel).toBe('VAT 16%');
    expect(model.totals).toEqual({
      subtotal: '2000',
      tax: '320',
      total: '2320',
      balance: null,
      currency: 'Ksh',
    });
  });

  it('hides rates and amounts on a packing list from the same invoice', () => {
    const packing = buildDocumentModel({ ...invoiceInput, kind: 'packing-list' });

    expect(packing.showMoney).toBe(false);
    expect(packing.totals).toBeNull();
    expect(visibleColumns(packing).map((column) => column.key)).toEqual([
      'description',
      'sku',
      'quantity',
      'extra',
    ]);
    expect(packing.lines[0]?.description).toBe('Oil filter');
    expect(packing.lines[0]?.quantity).toBe('2');
  });

  it('uses the supplier as the party on a purchase order', () => {
    const model = buildDocumentModel({
      ...invoiceInput,
      kind: 'purchase-order',
      party: { name: 'Acme Parts' },
    });

    expect(partyRoleFor('purchase-order')).toBe('supplier');
    expect(model.partyRole).toBe('supplier');
    expect(model.partyLabel).toBe('Supplier');
    expect(model.party.name).toBe('Acme Parts');
  });

  it('maps a statement from open balances, not product lines', () => {
    const model = mapStatementDocument({
      kind: 'customer-statement',
      asOf: '2026-09-06',
      party: { name: 'Hangar Co' },
      currency: 'KES',
      openRows: [
        {
          description: 'Invoice 1001',
          date: '2026-08-01',
          due: '2026-08-15',
          amount: '2320',
        },
      ],
      activityRows: [{ description: 'Payment 12', date: '2026-08-20', amount: '-1000' }],
      total: '2320',
    });

    expect(model.profile).toBe('statement');
    expect(model.lines.map((line) => line.description)).toEqual([
      'Invoice 1001',
      'Recent activity',
      'Payment 12',
    ]);
    expect(model.lines[0]?.amount).toBe('2320');
    expect(model.lines.some((line) => line.description === 'Oil filter')).toBe(false);
  });
});
