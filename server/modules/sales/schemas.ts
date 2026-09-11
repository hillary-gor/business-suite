import { z } from 'zod';

const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,4})?$/, 'Enter an amount with up to four decimal places');

export const saveCustomerInput = z.object({
  customerId: z.string().uuid().optional(),
  code: z.string().trim().max(40).optional(),
  legalName: z.string().trim().min(2).max(200),
  tradingName: z.string().trim().max(200).optional(),
  taxPin: z.string().trim().max(40).optional(),
  currencyCode: z.string().length(3).optional(),
  paymentTermsId: z.string().uuid().optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const invoiceLineInput = z.object({
  itemId: z.string().uuid().optional(),
  description: z.string().trim().min(1).max(500),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  quantity: moneyString,
  unitPrice: moneyString,
  taxCodeId: z.string().uuid().optional(),
  revenueAccountId: z.string().uuid().optional(),
  stockUnitId: z.string().uuid().optional(),
  stockLotId: z.string().uuid().optional(),
});

export const saveInvoiceInput = z.object({
  invoiceId: z.string().uuid().optional(),
  customerId: z.string().uuid(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currencyCode: z.string().length(3).optional(),
  paymentTermsId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  billEmail: z.string().trim().email().optional().or(z.literal('')),
  shipToName: z.string().trim().max(200).optional(),
  shipToAddress: z.string().trim().max(500).optional(),
  customerPo: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(invoiceLineInput).min(1),
  issue: z.boolean().default(false),
  idempotencyKey: z.string().uuid().optional(),
});

export const receiptAllocationInput = z.object({
  invoiceId: z.string().uuid(),
  amount: moneyString,
});

export const saveReceiptInput = z.object({
  receiptId: z.string().uuid().optional(),
  customerId: z.string().uuid(),
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: moneyString,
  bankAccountId: z.string().uuid(),
  currencyCode: z.string().length(3).optional(),
  memo: z.string().trim().max(500).optional(),
  allocations: z.array(receiptAllocationInput).default([]),
  post: z.boolean().default(true),
  idempotencyKey: z.string().uuid().optional(),
});

export const voidInvoiceInput = z.object({
  invoiceId: z.string().uuid(),
  reason: z.string().trim().min(10).max(2000),
});

export const docLineInput = z.object({
  itemId: z.string().uuid().optional(),
  description: z.string().trim().min(1).max(500),
  quantity: moneyString,
  unitPrice: moneyString,
  taxCodeId: z.string().uuid().optional(),
  revenueAccountId: z.string().uuid().optional(),
});

export const saveQuotationInput = z.object({
  quotationId: z.string().uuid().optional(),
  customerId: z.string().uuid(),
  quotationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currencyCode: z.string().length(3).optional(),
  warehouseId: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(docLineInput).min(1),
  send: z.boolean().default(false),
});

export const convertQuotationInput = z.object({
  quotationId: z.string().uuid(),
});

export const saveSalesOrderInput = z.object({
  salesOrderId: z.string().uuid().optional(),
  customerId: z.string().uuid(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currencyCode: z.string().length(3).optional(),
  warehouseId: z.string().uuid().optional(),
  customerPo: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(docLineInput).min(1),
  confirm: z.boolean().default(false),
});

export const convertOrderInput = z.object({
  salesOrderId: z.string().uuid(),
});

export const creditNoteLineInput = docLineInput.extend({
  stockUnitId: z.string().uuid().optional(),
  unitCostBase: moneyString.optional(),
});

export const saveCreditNoteInput = z.object({
  creditNoteId: z.string().uuid().optional(),
  customerId: z.string().uuid(),
  creditDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currencyCode: z.string().length(3).optional(),
  warehouseId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
  restock: z.boolean().default(false),
  lines: z.array(creditNoteLineInput).min(1),
  allocations: z
    .array(
      z.object({
        invoiceId: z.string().uuid(),
        amount: moneyString,
      }),
    )
    .default([]),
  post: z.boolean().default(true),
  idempotencyKey: z.string().uuid().optional(),
});

export const saveDebitNoteInput = z.object({
  debitNoteId: z.string().uuid().optional(),
  customerId: z.string().uuid(),
  debitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currencyCode: z.string().length(3).optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(docLineInput).min(1),
  post: z.boolean().default(true),
  idempotencyKey: z.string().uuid().optional(),
});

export const saveRefundInput = z.object({
  refundId: z.string().uuid().optional(),
  customerId: z.string().uuid(),
  refundDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: moneyString,
  bankAccountId: z.string().uuid(),
  currencyCode: z.string().length(3).optional(),
  memo: z.string().trim().max(500).optional(),
  allocations: z.array(receiptAllocationInput).default([]),
  post: z.boolean().default(true),
  idempotencyKey: z.string().uuid().optional(),
});

export const saveSalesReceiptInput = z.object({
  salesReceiptId: z.string().uuid().optional(),
  customerId: z.string().uuid(),
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bankAccountId: z.string().uuid(),
  currencyCode: z.string().length(3).optional(),
  paymentTermsId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  billEmail: z.string().trim().email().optional().or(z.literal('')),
  shipToName: z.string().trim().max(200).optional(),
  shipToAddress: z.string().trim().max(500).optional(),
  customerPo: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z
    .array(
      z.object({
        itemId: z.string().uuid().optional(),
        description: z.string().trim().min(1).max(500),
        serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        quantity: moneyString,
        unitPrice: moneyString,
        taxCodeId: z.string().uuid().optional(),
        stockUnitId: z.string().uuid().optional(),
        stockLotId: z.string().uuid().optional(),
      }),
    )
    .min(1),
  post: z.boolean().default(true),
  idempotencyKey: z.string().uuid().optional(),
});

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export type SaveCustomerInput = z.infer<typeof saveCustomerInput>;
export type SaveInvoiceInput = z.infer<typeof saveInvoiceInput>;
export type SaveReceiptInput = z.infer<typeof saveReceiptInput>;
export type SaveQuotationInput = z.infer<typeof saveQuotationInput>;
export type SaveSalesOrderInput = z.infer<typeof saveSalesOrderInput>;
export type SaveCreditNoteInput = z.infer<typeof saveCreditNoteInput>;
export type SaveDebitNoteInput = z.infer<typeof saveDebitNoteInput>;
export type SaveRefundInput = z.infer<typeof saveRefundInput>;
export type SaveSalesReceiptInput = z.infer<typeof saveSalesReceiptInput>;
