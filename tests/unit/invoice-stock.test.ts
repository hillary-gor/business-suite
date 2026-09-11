import { describe, expect, it } from 'vitest';
import {
  applyReceiptAmount,
  invoiceLineStockWarning,
  invoiceStockWarningText,
  receiptCreditRemainder,
} from '@/lib/invoice-stock';

describe('invoice line stock warnings', () => {
  it('ignores services', () => {
    expect(invoiceLineStockWarning({ isStocked: false, qtyOnHand: '0', quantity: '2' })).toBeNull();
  });

  it('flags a stocked item at zero as out of stock', () => {
    expect(invoiceLineStockWarning({ isStocked: true, qtyOnHand: '0', quantity: '1' })).toBe('out');
  });

  it('flags a line that asks for more than on-hand', () => {
    expect(invoiceLineStockWarning({ isStocked: true, qtyOnHand: '2', quantity: '5' })).toBe(
      'short',
    );
    expect(invoiceStockWarningText('short', '2')).toContain('Only 2 on hand');
  });
});

describe('receipt allocation', () => {
  it('applies a received amount in invoice order', () => {
    expect(
      applyReceiptAmount(
        [
          { id: 'a', outstanding: '30.00' },
          { id: 'b', outstanding: '20.00' },
        ],
        '40',
      ),
    ).toEqual({ a: '30.0000', b: '10.0000' });
  });

  it('credits anything left after open invoices', () => {
    expect(receiptCreditRemainder('50', '40')).toBe('10.0000');
    expect(receiptCreditRemainder('10', '40')).toBe('0');
  });
});
