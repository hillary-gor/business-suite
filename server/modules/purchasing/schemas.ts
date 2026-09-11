import { z } from 'zod';

const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,4})?$/, 'Enter an amount with up to four decimal places');

export const poLineInput = z.object({
  itemId: z.string().uuid().optional(),
  description: z.string().trim().min(1).max(500),
  quantity: moneyString,
  unitPrice: moneyString,
  taxCodeId: z.string().uuid().optional(),
});

export const savePoInput = z.object({
  poId: z.string().uuid().optional(),
  supplierId: z.string().uuid(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  currencyCode: z.string().length(3).optional(),
  paymentTermsId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(poLineInput).min(1),
  approve: z.boolean().default(false),
});

export const approvePoInput = z.object({
  poId: z.string().uuid(),
});

export const cancelPoInput = z.object({
  poId: z.string().uuid(),
  reason: z.string().trim().min(5).max(2000),
});

const emailAddress = z.string().trim().email('Enter a valid email address');

export const sendPoEmailInput = z.object({
  poId: z.string().uuid(),
  to: emailAddress,
  cc: z.array(emailAddress).max(10).optional(),
  bcc: z.array(emailAddress).max(10).optional(),
  message: z.string().trim().max(4000).optional(),
});

export const grnLineInput = z.object({
  poLineId: z.string().uuid().optional(),
  itemId: z.string().uuid(),
  description: z.string().trim().min(1).max(500),
  quantity: moneyString,
  unitCost: moneyString,
  binId: z.string().uuid().optional(),
  stockUnitId: z.string().uuid().optional(),
  serialNumber: z.string().trim().max(80).optional(),
  conditionCode: z.string().trim().max(10).optional(),
});

export const saveGoodsReceiptInput = z.object({
  goodsReceiptId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  poId: z.string().uuid().optional(),
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  warehouseId: z.string().uuid(),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(grnLineInput).min(1),
  post: z.boolean().default(true),
  idempotencyKey: z.string().uuid().optional(),
});

export const billLineInput = z.object({
  itemId: z.string().uuid().optional(),
  description: z.string().trim().min(1).max(500),
  quantity: moneyString,
  unitPrice: moneyString,
  taxCodeId: z.string().uuid().optional(),
  expenseAccountId: z.string().uuid().optional(),
  goodsReceiptLineId: z.string().uuid().optional(),
});

export const saveBillInput = z.object({
  billId: z.string().uuid().optional(),
  supplierId: z.string().uuid(),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  currencyCode: z.string().length(3).optional(),
  paymentTermsId: z.string().uuid().optional(),
  supplierRef: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(billLineInput).min(1),
  receiptMatches: z
    .array(
      z.object({
        goodsReceiptId: z.string().uuid(),
        amount: moneyString.optional(),
      }),
    )
    .default([]),
  post: z.boolean().default(true),
  idempotencyKey: z.string().uuid().optional(),
});

export const paymentAllocationInput = z.object({
  billId: z.string().uuid(),
  amount: moneyString,
});

export const savePaymentInput = z.object({
  paymentId: z.string().uuid().optional(),
  supplierId: z.string().uuid(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: moneyString,
  bankAccountId: z.string().uuid(),
  currencyCode: z.string().length(3).optional(),
  memo: z.string().trim().max(500).optional(),
  allocations: z.array(paymentAllocationInput).default([]),
  post: z.boolean().default(true),
  idempotencyKey: z.string().uuid().optional(),
});

export const saveExpenseInput = z.object({
  supplierId: z.string().uuid(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bankAccountId: z.string().uuid(),
  currencyCode: z.string().length(3).optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(500),
        amount: moneyString,
        taxCodeId: z.string().uuid().optional(),
        expenseAccountId: z.string().uuid().optional(),
      }),
    )
    .min(1),
  idempotencyKey: z.string().uuid().optional(),
  paymentIdempotencyKey: z.string().uuid().optional(),
});

export const reversePaymentInput = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().trim().min(10).max(2000),
});

export const creditLineInput = z.object({
  itemId: z.string().uuid().optional(),
  description: z.string().trim().min(1).max(500),
  quantity: moneyString,
  unitPrice: moneyString,
  taxCodeId: z.string().uuid().optional(),
  expenseAccountId: z.string().uuid().optional(),
  stockUnitId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
});

export const saveCreditInput = z.object({
  creditId: z.string().uuid().optional(),
  supplierId: z.string().uuid(),
  creditDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currencyCode: z.string().length(3).optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(creditLineInput).min(1),
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

export type SavePoInput = z.infer<typeof savePoInput>;
export type SendPoEmailInput = z.infer<typeof sendPoEmailInput>;
export type SaveGoodsReceiptInput = z.infer<typeof saveGoodsReceiptInput>;
export type SaveBillInput = z.infer<typeof saveBillInput>;
export type SavePaymentInput = z.infer<typeof savePaymentInput>;
export type SaveCreditInput = z.infer<typeof saveCreditInput>;
export type SaveExpenseInput = z.infer<typeof saveExpenseInput>;
