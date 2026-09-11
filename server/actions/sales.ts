'use server';

import { revalidatePath } from 'next/cache';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { userMessage } from '@/server/db/errors';
import * as sales from '@/server/modules/sales/documents';
import {
  convertOrderInput,
  convertQuotationInput,
  fieldErrors,
  saveCreditNoteInput,
  saveCustomerInput,
  saveDebitNoteInput,
  saveInvoiceInput,
  saveQuotationInput,
  saveReceiptInput,
  saveRefundInput,
  saveSalesOrderInput,
  saveSalesReceiptInput,
  voidInvoiceInput,
} from '@/server/modules/sales/schemas';

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fields?: Record<string, string> };

async function run<T>(
  label: string,
  work: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await work();
  } catch (error) {
    console.error(`[action:${label}]`, error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function saveCustomerAction(
  raw: unknown,
): Promise<ActionResult<{ customerId: string }>> {
  return run('saveCustomer', async () => {
    const { context } = await authorise(Permission.MastersManageCustomers);
    const parsed = saveCustomerInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const result = await sales.saveCustomer(context, parsed.data);
    revalidatePath('/sales/customers');
    revalidatePath('/sales/invoices/new');
    return { ok: true, data: result, message: 'Customer saved.' };
  });
}

export async function saveInvoiceAction(
  raw: unknown,
): Promise<ActionResult<{ invoiceId: string; invoiceNo: string | null }>> {
  return run('saveInvoice', async () => {
    const parsed = saveInvoiceInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }

    const { context } = await authorise(
      parsed.data.issue
        ? [Permission.SalesInvoiceCreate, Permission.SalesInvoiceIssue]
        : Permission.SalesInvoiceCreate,
    );

    const result = await sales.saveInvoice(context, parsed.data);
    revalidatePath('/sales/invoices');
    revalidatePath('/sales/transactions');
    revalidatePath('/sales/customers');
    revalidatePath('/accounting/journals');
    revalidatePath('/accounting/trial-balance');

    return {
      ok: true,
      data: { invoiceId: result.invoiceId, invoiceNo: result.invoiceNo },
      message: result.invoiceNo ? `Invoice ${result.invoiceNo} issued.` : 'Draft invoice saved.',
    };
  });
}

export async function voidInvoiceAction(raw: unknown): Promise<ActionResult> {
  return run('voidInvoice', async () => {
    const { context } = await authorise(Permission.SalesInvoiceVoid);
    const parsed = voidInvoiceInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    await sales.voidInvoice(context, parsed.data.invoiceId, parsed.data.reason);
    revalidatePath('/sales/invoices');
    revalidatePath('/sales/transactions');
    revalidatePath('/accounting/journals');
    return { ok: true, data: undefined, message: 'Invoice voided.' };
  });
}

export async function saveReceiptAction(
  raw: unknown,
): Promise<ActionResult<{ receiptId: string; receiptNo: string | null }>> {
  return run('saveReceipt', async () => {
    const { context } = await authorise(Permission.SalesPaymentCreate);
    const parsed = saveReceiptInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const result = await sales.saveReceipt(context, parsed.data);
    revalidatePath('/sales/invoices');
    revalidatePath('/sales/payments');
    revalidatePath('/sales/transactions');
    revalidatePath('/sales/customers');
    revalidatePath('/accounting/journals');
    return {
      ok: true,
      data: { receiptId: result.receiptId, receiptNo: result.receiptNo },
      message: result.receiptNo ? `Receipt ${result.receiptNo} posted.` : 'Draft receipt saved.',
    };
  });
}

export async function saveQuotationAction(
  raw: unknown,
): Promise<ActionResult<{ quotationId: string; quotationNo: string | null }>> {
  return run('saveQuotation', async () => {
    const parsed = saveQuotationInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const { context } = await authorise(
      parsed.data.send
        ? [Permission.SalesInvoiceCreate, Permission.SalesInvoiceIssue]
        : Permission.SalesInvoiceCreate,
    );
    const result = await sales.saveQuotation(context, parsed.data);
    revalidatePath('/sales/estimates');
    revalidatePath('/sales/transactions');
    revalidatePath('/sales/customers');
    return {
      ok: true,
      data: { quotationId: result.quotationId, quotationNo: result.quotationNo },
      message: result.quotationNo
        ? `Estimate ${result.quotationNo} sent.`
        : 'Draft estimate saved.',
    };
  });
}

export async function convertQuotationAction(
  raw: unknown,
): Promise<ActionResult<{ invoiceId: string }>> {
  return run('convertQuotation', async () => {
    const { context } = await authorise(Permission.SalesInvoiceCreate);
    const parsed = convertQuotationInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const result = await sales.convertQuotationToInvoice(context, parsed.data.quotationId);
    revalidatePath('/sales/estimates');
    revalidatePath('/sales/invoices');
    revalidatePath('/sales/transactions');
    revalidatePath('/sales/customers');
    return { ok: true, data: result, message: 'Estimate converted to a draft invoice.' };
  });
}

export async function acceptQuotationAction(raw: unknown): Promise<ActionResult> {
  return run('acceptQuotation', async () => {
    const { context } = await authorise(Permission.SalesInvoiceCreate);
    const parsed = convertQuotationInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    await sales.acceptQuotation(context, parsed.data.quotationId);
    revalidatePath('/sales/estimates');
    revalidatePath('/sales/transactions');
    revalidatePath('/sales/customers');
    return { ok: true, data: undefined, message: 'Estimate marked accepted.' };
  });
}

export async function saveSalesOrderAction(
  raw: unknown,
): Promise<ActionResult<{ salesOrderId: string; orderNo: string | null }>> {
  return run('saveSalesOrder', async () => {
    const parsed = saveSalesOrderInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const { context } = await authorise(
      parsed.data.confirm
        ? [Permission.SalesInvoiceCreate, Permission.SalesInvoiceIssue]
        : Permission.SalesInvoiceCreate,
    );
    const result = await sales.saveSalesOrder(context, parsed.data);
    revalidatePath('/sales/orders');
    revalidatePath('/sales/transactions');
    return {
      ok: true,
      data: { salesOrderId: result.salesOrderId, orderNo: result.orderNo },
      message: result.orderNo
        ? `Sales order ${result.orderNo} confirmed.`
        : 'Draft sales order saved.',
    };
  });
}

export async function convertOrderAction(
  raw: unknown,
): Promise<ActionResult<{ invoiceId: string }>> {
  return run('convertOrder', async () => {
    const { context } = await authorise(Permission.SalesInvoiceCreate);
    const parsed = convertOrderInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const result = await sales.convertOrderToInvoice(context, parsed.data.salesOrderId);
    revalidatePath('/sales/orders');
    revalidatePath('/sales/invoices');
    revalidatePath('/sales/transactions');
    return { ok: true, data: result, message: 'Sales order converted to a draft invoice.' };
  });
}

export async function saveCreditNoteAction(
  raw: unknown,
): Promise<ActionResult<{ creditNoteId: string; creditNo: string | null }>> {
  return run('saveCreditNote', async () => {
    const parsed = saveCreditNoteInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const { context } = await authorise(
      parsed.data.post
        ? [Permission.SalesInvoiceCreate, Permission.SalesInvoiceIssue]
        : Permission.SalesInvoiceCreate,
    );
    const result = await sales.saveCreditNote(context, parsed.data);
    revalidatePath('/sales/credit-notes');
    revalidatePath('/sales/invoices');
    revalidatePath('/sales/transactions');
    revalidatePath('/accounting/journals');
    return {
      ok: true,
      data: { creditNoteId: result.creditNoteId, creditNo: result.creditNo },
      message: result.creditNo
        ? `Credit note ${result.creditNo} posted.`
        : 'Draft credit note saved.',
    };
  });
}

export async function saveDebitNoteAction(
  raw: unknown,
): Promise<ActionResult<{ debitNoteId: string; debitNo: string | null }>> {
  return run('saveDebitNote', async () => {
    const parsed = saveDebitNoteInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const { context } = await authorise(
      parsed.data.post
        ? [Permission.SalesInvoiceCreate, Permission.SalesInvoiceIssue]
        : Permission.SalesInvoiceCreate,
    );
    const result = await sales.saveDebitNote(context, parsed.data);
    revalidatePath('/sales/debit-notes');
    revalidatePath('/sales/transactions');
    revalidatePath('/accounting/journals');
    return {
      ok: true,
      data: { debitNoteId: result.debitNoteId, debitNo: result.debitNo },
      message: result.debitNo ? `Debit note ${result.debitNo} posted.` : 'Draft debit note saved.',
    };
  });
}

export async function saveRefundAction(
  raw: unknown,
): Promise<ActionResult<{ refundId: string; refundNo: string | null }>> {
  return run('saveRefund', async () => {
    const { context } = await authorise(Permission.SalesPaymentCreate);
    const parsed = saveRefundInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const result = await sales.saveRefund(context, parsed.data);
    revalidatePath('/sales/refunds');
    revalidatePath('/sales/transactions');
    revalidatePath('/accounting/journals');
    return {
      ok: true,
      data: { refundId: result.refundId, refundNo: result.refundNo },
      message: result.refundNo ? `Refund ${result.refundNo} posted.` : 'Draft refund saved.',
    };
  });
}

export async function saveSalesReceiptAction(
  raw: unknown,
): Promise<ActionResult<{ salesReceiptId: string; receiptNo: string | null }>> {
  return run('saveSalesReceipt', async () => {
    const parsed = saveSalesReceiptInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const { context } = await authorise(
      parsed.data.post
        ? [Permission.SalesInvoiceCreate, Permission.SalesInvoiceIssue]
        : Permission.SalesInvoiceCreate,
    );
    const result = await sales.saveSalesReceipt(context, parsed.data);
    revalidatePath('/sales/receipts');
    revalidatePath('/sales/transactions');
    revalidatePath('/accounting/journals');
    return {
      ok: true,
      data: { salesReceiptId: result.salesReceiptId, receiptNo: result.receiptNo },
      message: result.receiptNo
        ? `Sales receipt ${result.receiptNo} posted.`
        : 'Draft sales receipt saved.',
    };
  });
}
