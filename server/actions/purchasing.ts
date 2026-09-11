'use server';

import { revalidatePath } from 'next/cache';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { userMessage } from '@/server/db/errors';
import * as purch from '@/server/modules/purchasing/documents';
import {
  approvePoInput,
  cancelPoInput,
  fieldErrors,
  reversePaymentInput,
  saveBillInput,
  saveCreditInput,
  saveExpenseInput,
  saveGoodsReceiptInput,
  savePaymentInput,
  savePoInput,
  sendPoEmailInput,
} from '@/server/modules/purchasing/schemas';
import { purchaseOrderEmail } from '@/server/mail/purchase-order';
import { sendTransactionalEmail } from '@/server/mail/send';
import { renderSavedDocumentPdf } from '@/server/modules/documents/print';

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

export async function savePoAction(
  raw: unknown,
): Promise<ActionResult<{ poId: string; poNo: string | null }>> {
  return run('savePo', async () => {
    const parsed = savePoInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }

    const { context } = await authorise(
      parsed.data.approve
        ? [Permission.ProcurementPurchaseCreate, Permission.ProcurementPurchaseApprove]
        : Permission.ProcurementPurchaseCreate,
    );

    const result = await purch.savePo(context, parsed.data);
    revalidatePath('/purchasing/orders');
    revalidatePath(`/purchasing/orders/${result.poId}`);
    revalidatePath('/purchasing/expenses');
    revalidatePath('/purchasing/vendors');
    return {
      ok: true,
      data: { poId: result.poId, poNo: result.poNo },
      message: result.poNo
        ? `Purchase order ${result.poNo} approved.`
        : 'Draft purchase order saved.',
    };
  });
}

export async function approvePoAction(raw: unknown): Promise<ActionResult<{ poNo: string }>> {
  return run('approvePo', async () => {
    const { context } = await authorise(Permission.ProcurementPurchaseApprove);
    const parsed = approvePoInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const result = await purch.approvePo(context, parsed.data.poId);
    revalidatePath('/purchasing/orders');
    revalidatePath(`/purchasing/orders/${parsed.data.poId}`);
    return {
      ok: true,
      data: { poNo: result.poNo },
      message: `Purchase order ${result.poNo} approved.`,
    };
  });
}

export async function sendPoEmailAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return run('sendPoEmail', async () => {
    const parsed = sendPoEmailInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the email address.',
        fields: fieldErrors(parsed.error),
      };
    }

    const { context, entity } = await authorise(Permission.ProcurementPurchaseCreate);
    const record = await purch.getPurchaseOrder(context, parsed.data.poId);
    if (!record) {
      return { ok: false, error: 'Purchase order not found.' };
    }

    const message = purchaseOrderEmail({
      companyName: entity.name,
      poNo: record.po.po_no,
      supplierName: record.po.supplier_name,
      orderDate: record.po.order_date,
      expectedDate: record.po.expected_date,
      currencyCode: record.po.currency_code,
      message: parsed.data.message,
      memo: record.po.notes,
      lines: record.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unit_price,
        lineNet: line.line_net,
        taxAmount: line.tax_amount,
      })),
      subtotal: record.po.subtotal,
      taxTotal: record.po.tax_total,
      total: record.po.total,
    });

    const pdf = await renderSavedDocumentPdf(context, 'purchase-order', parsed.data.poId);
    const sent = await sendTransactionalEmail({
      to: parsed.data.to,
      cc: parsed.data.cc,
      bcc: parsed.data.bcc,
      fromName: entity.name,
      subject: message.subject,
      html: message.html,
      text: message.text,
      tags: [{ name: 'category', value: 'purchase-order' }],
      attachments: [{ filename: pdf.filename, content: pdf.buffer }],
    });

    return { ok: true, data: { id: sent.id }, message: 'Purchase order emailed.' };
  });
}

export async function cancelPoAction(raw: unknown): Promise<ActionResult> {
  return run('cancelPo', async () => {
    const { context } = await authorise(Permission.ProcurementPurchaseCreate);
    const parsed = cancelPoInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    await purch.cancelPo(context, parsed.data.poId, parsed.data.reason);
    revalidatePath('/purchasing/orders');
    revalidatePath(`/purchasing/orders/${parsed.data.poId}`);
    return { ok: true, data: undefined, message: 'Purchase order cancelled.' };
  });
}

export async function saveGoodsReceiptAction(
  raw: unknown,
): Promise<ActionResult<{ goodsReceiptId: string; grnNo: string | null }>> {
  return run('saveGoodsReceipt', async () => {
    const { context } = await authorise(Permission.ProcurementPurchaseReceive);
    const parsed = saveGoodsReceiptInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const result = await purch.saveGoodsReceipt(context, parsed.data);
    revalidatePath('/purchasing/receipts');
    revalidatePath('/purchasing/expenses');
    revalidatePath('/inventory/stock');
    return {
      ok: true,
      data: { goodsReceiptId: result.goodsReceiptId, grnNo: result.grnNo },
      message: result.grnNo ? `Item receipt ${result.grnNo} posted.` : 'Draft item receipt saved.',
    };
  });
}

export async function saveBillAction(
  raw: unknown,
): Promise<ActionResult<{ billId: string; billNo: string | null }>> {
  return run('saveBill', async () => {
    const { context } = await authorise(Permission.FinancePaymentCreate);
    const parsed = saveBillInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const result = await purch.saveBill(context, parsed.data);
    revalidatePath('/purchasing/bills');
    revalidatePath('/purchasing/expenses');
    revalidatePath('/purchasing/vendors');
    revalidatePath('/accounting/journals');
    return {
      ok: true,
      data: { billId: result.billId, billNo: result.billNo },
      message: result.billNo ? `Bill ${result.billNo} posted.` : 'Draft bill saved.',
    };
  });
}

export async function savePaymentAction(
  raw: unknown,
): Promise<ActionResult<{ paymentId: string; paymentNo: string | null }>> {
  return run('savePayment', async () => {
    const { context } = await authorise(Permission.FinancePaymentCreate);
    const parsed = savePaymentInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const result = await purch.savePayment(context, parsed.data);
    revalidatePath('/purchasing/bills');
    revalidatePath('/purchasing/payments');
    revalidatePath('/purchasing/expenses');
    revalidatePath('/purchasing/vendors');
    revalidatePath('/accounting/journals');
    return {
      ok: true,
      data: { paymentId: result.paymentId, paymentNo: result.paymentNo },
      message: result.paymentNo ? `Payment ${result.paymentNo} posted.` : 'Draft payment saved.',
    };
  });
}

export async function reversePaymentAction(raw: unknown): Promise<ActionResult> {
  return run('reversePayment', async () => {
    const { context } = await authorise(Permission.FinancePaymentReverse);
    const parsed = reversePaymentInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    await purch.reversePayment(context, parsed.data.paymentId, parsed.data.reason);
    revalidatePath('/purchasing/bills');
    revalidatePath('/accounting/journals');
    return { ok: true, data: undefined, message: 'Payment reversed.' };
  });
}

export async function saveExpenseAction(
  raw: unknown,
): Promise<ActionResult<{ billId: string; billNo: string | null; paymentNo: string | null }>> {
  return run('saveExpense', async () => {
    const { context } = await authorise(Permission.FinancePaymentCreate);
    const parsed = saveExpenseInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const result = await purch.saveExpense(context, parsed.data);
    revalidatePath('/purchasing/expenses');
    revalidatePath('/purchasing/bills');
    revalidatePath('/purchasing/vendors');
    revalidatePath('/accounting/journals');
    return {
      ok: true,
      data: { billId: result.billId, billNo: result.billNo, paymentNo: result.paymentNo },
      message: result.billNo
        ? `Expense ${result.billNo} posted and paid${result.paymentNo ? ` as ${result.paymentNo}` : ''}.`
        : 'Expense posted.',
    };
  });
}

export async function saveCreditAction(
  raw: unknown,
): Promise<ActionResult<{ creditId: string; creditNo: string | null }>> {
  return run('saveCredit', async () => {
    const { context } = await authorise(Permission.FinancePaymentCreate);
    const parsed = saveCreditInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const result = await purch.saveCredit(context, parsed.data);
    revalidatePath('/purchasing/credits');
    revalidatePath('/purchasing/expenses');
    revalidatePath('/accounting/journals');
    return {
      ok: true,
      data: { creditId: result.creditId, creditNo: result.creditNo },
      message: result.creditNo
        ? `Supplier credit ${result.creditNo} posted.`
        : 'Draft credit saved.',
    };
  });
}
