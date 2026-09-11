import { describe, expect, it } from 'vitest';
import {
  ISSUED_INVOICE_CANNOT_SAVE_MESSAGE,
  invoiceComposerPersistBlockedReason,
} from '@/lib/invoice-composer';

describe('invoice composer persist guard', () => {
  it('allows Save and Review and send while the invoice is still a draft', () => {
    expect(invoiceComposerPersistBlockedReason(false)).toBeNull();
  });

  it('blocks persist after issue so save_invoice is not called', () => {
    expect(invoiceComposerPersistBlockedReason(true)).toBe(ISSUED_INVOICE_CANNOT_SAVE_MESSAGE);
  });
});
