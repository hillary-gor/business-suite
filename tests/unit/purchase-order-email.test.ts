import { describe, expect, it } from 'vitest';
import { purchaseOrderEmail } from '@/server/mail/purchase-order';

describe('purchase order email', () => {
  it('names the PO, includes tax, and escapes HTML in the body', () => {
    const message = purchaseOrderEmail({
      companyName: 'SkyJet Aircraft Spares',
      poNo: '1001',
      supplierName: 'Acme <parts>',
      orderDate: '2026-09-06',
      expectedDate: '2026-09-20',
      currencyCode: 'KES',
      message: 'Please deliver to hangar <2>.',
      memo: 'Urgent',
      lines: [
        {
          description: 'Filter <A>',
          quantity: '2',
          unitPrice: '1000',
          lineNet: '2000',
          taxAmount: '320',
        },
      ],
      subtotal: '2000',
      taxTotal: '320',
      total: '2320',
    });

    expect(message.subject).toBe('Purchase order 1001 from SkyJet Aircraft Spares');
    expect(message.text).toContain('Supplier: Acme <parts>');
    expect(message.text).toContain('Tax: Ksh 320.00');
    expect(message.html).toContain('Acme &lt;parts&gt;');
    expect(message.html).toContain('Filter &lt;A&gt;');
    expect(message.html).toContain('Please deliver to hangar &lt;2&gt;.');
    expect(message.html).not.toContain('<parts>');
  });
});
