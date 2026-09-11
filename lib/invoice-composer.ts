/** save_invoice only updates DRAFT rows. After issue the composer must not call it. */
export const ISSUED_INVOICE_CANNOT_SAVE_MESSAGE =
  'This invoice has already been issued and cannot be saved as a draft.';

/** Null when Save or Review and send may call saveInvoiceAction. */
export function invoiceComposerPersistBlockedReason(issued: boolean): string | null {
  if (!issued) return null;
  return ISSUED_INVOICE_CANNOT_SAVE_MESSAGE;
}
