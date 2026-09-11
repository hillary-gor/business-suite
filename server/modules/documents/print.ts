import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NotFoundError } from '@/server/db/errors';
import { withReadOnlyTransaction, type RequestContext } from '@/server/db/transaction';
import { DOCUMENT_KIND_CONFIG, documentFilename, type DocumentKind } from '@/lib/documents/kinds';
import {
  buildDocumentModel,
  documentModelFromDraft,
  mapPaymentDocument,
  mapStatementDocument,
  withCompany,
  type CommercialPrintLine,
} from '@/lib/documents/mappers';
import {
  formatAddressParts,
  type DocumentCompany,
  type DocumentDraft,
  type DocumentModel,
} from '@/lib/documents/model';
import { Money } from '@/lib/money';
import { getAdjustment, getTransfer } from '@/server/modules/inventory/lists';
import {
  getBill,
  getGoodsReceipt,
  getPurchaseOrder,
  getSupplierCredit,
  getSupplierPayment,
  getSupplierStatement,
} from '@/server/modules/purchasing/documents';
import {
  getArReceipt,
  getCreditNote,
  getCustomerStatement,
  getDebitNote,
  getInvoice,
  getQuotation,
  getRefund,
  getSalesOrder,
  getSalesReceipt,
} from '@/server/modules/sales/documents';
import { renderDocumentPdf } from '@/server/pdf/render';

function commercialLines(
  rows: ReadonlyArray<{
    description: string;
    sku?: string | null;
    quantity: string;
    unit_price?: string;
    unitPrice?: string;
    tax_label?: string | null;
    tax_amount?: string;
    line_net?: string;
    extra?: string | null;
  }>,
  extraFallback?: string | null,
): CommercialPrintLine[] {
  return rows.map((row) => ({
    description: row.description,
    sku: row.sku ?? null,
    quantity: row.quantity,
    unitPrice: row.unit_price ?? row.unitPrice ?? '0',
    taxLabel: row.tax_label ?? null,
    taxAmount: row.tax_amount ?? null,
    amount: row.line_net ?? '0',
    extra: row.extra ?? extraFallback ?? null,
  }));
}

function meta(fields: Array<[string, string | null | undefined]>): DocumentModel['meta'] {
  return fields
    .filter(([, value]) => Boolean(value && value.trim()))
    .map(([label, value]) => ({ label, value: value as string }));
}

let cachedDefaultLogo: string | null | undefined;

async function defaultLogoDataUri(): Promise<string | null> {
  if (cachedDefaultLogo !== undefined) return cachedDefaultLogo;
  try {
    const bytes = await readFile(path.join(process.cwd(), 'public/brand/surge-innovations.png'));
    cachedDefaultLogo = `data:image/png;base64,${bytes.toString('base64')}`;
  } catch {
    cachedDefaultLogo = null;
  }
  return cachedDefaultLogo;
}

function asBuffer(value: unknown): Buffer | null {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return null;
}

export async function loadCompanyLetterhead(context: RequestContext): Promise<DocumentCompany> {
  const row = await withReadOnlyTransaction(context, (tx) =>
    tx.one<{
      name: string;
      trading_name: string | null;
      registration_number: string | null;
      tax_pin: string | null;
      address_line1: string | null;
      address_line2: string | null;
      city: string | null;
      postal_code: string | null;
      country_code: string;
      phone: string | null;
      email: string | null;
      logo_mime: string | null;
      logo_bytes: Buffer | Uint8Array | null;
    }>(
      `select legal_name as name, trading_name, registration_number, tax_pin, address_line1,
              address_line2, city, postal_code, country_code, phone, email, logo_mime, logo_bytes
         from app.entities where id = $1`,
      [context.entityId],
    ),
  );

  const bytes = asBuffer(row.logo_bytes);
  const logoDataUri = bytes
    ? `data:${row.logo_mime || 'image/png'};base64,${bytes.toString('base64')}`
    : await defaultLogoDataUri();

  return {
    name: row.name,
    tradingName: row.trading_name,
    email: row.email,
    phone: row.phone,
    registrationNumber: row.registration_number,
    taxPin: row.tax_pin,
    address: formatAddressParts({
      line1: row.address_line1,
      line2: row.address_line2,
      city: row.city,
      postalCode: row.postal_code,
      country: row.country_code === 'KE' ? 'Kenya' : row.country_code,
    }),
    logoDataUri,
  };
}

async function stamp(context: RequestContext, model: DocumentModel): Promise<DocumentModel> {
  return withCompany(model, await loadCompanyLetterhead(context));
}

function missing(kind: DocumentKind): never {
  throw new NotFoundError(`${DOCUMENT_KIND_CONFIG[kind].title} was not found.`);
}

export async function loadDocumentModel(
  context: RequestContext,
  kind: DocumentKind,
  id: string,
  asOf?: string,
): Promise<DocumentModel> {
  const config = DOCUMENT_KIND_CONFIG[kind];

  switch (config.source) {
    case 'invoice': {
      const record = await getInvoice(context, id);
      if (!record) missing(kind);
      const { invoice, lines } = record;
      return stamp(
        context,
        buildDocumentModel({
          kind,
          number: invoice.invoice_no,
          issueDate: invoice.invoice_date,
          dueDate: invoice.due_date,
          currency: invoice.currency_code,
          party: {
            name: invoice.customer_name,
            email: invoice.customer_email,
            phone: invoice.customer_phone,
            address: invoice.bill_address,
          },
          shipTo:
            invoice.ship_to_name || invoice.ship_to_address || invoice.customer_ship_address
              ? {
                  name: invoice.ship_to_name || invoice.customer_name,
                  address: invoice.ship_to_address || invoice.customer_ship_address,
                }
              : null,
          meta: meta([
            ['Customer PO', invoice.customer_po],
            ['Warehouse', invoice.warehouse_name],
            ['Terms', invoice.payment_terms_name],
          ]),
          lines: commercialLines(lines, invoice.warehouse_name),
          subtotal: invoice.subtotal,
          tax: invoice.tax_total,
          total: invoice.total,
          balance: invoice.outstanding,
          notes: invoice.notes,
        }),
      );
    }
    case 'quotation': {
      const record = await getQuotation(context, id);
      if (!record) missing(kind);
      return stamp(
        context,
        buildDocumentModel({
          kind,
          number: record.quotation_no,
          issueDate: record.quotation_date,
          dueDate: record.valid_until,
          currency: record.currency_code,
          party: {
            name: record.customer_name,
            email: record.customer_email,
            phone: record.customer_phone,
            address: record.bill_address,
          },
          shipTo: record.ship_address
            ? { name: record.customer_name, address: record.ship_address }
            : null,
          meta: meta([['Warehouse', record.warehouse_name]]),
          lines: commercialLines(record.lines),
          subtotal: record.subtotal,
          tax: record.tax_total,
          total: record.total,
          notes: record.notes,
        }),
      );
    }
    case 'sales-order': {
      const record = await getSalesOrder(context, id);
      if (!record) missing(kind);
      return stamp(
        context,
        buildDocumentModel({
          kind,
          number: record.order.order_no,
          issueDate: record.order.order_date,
          currency: record.order.currency_code,
          party: {
            name: record.order.customer_name,
            email: record.order.customer_email,
            phone: record.order.customer_phone,
            address: record.order.bill_address,
          },
          shipTo: record.order.ship_address
            ? { name: record.order.customer_name, address: record.order.ship_address }
            : null,
          meta: meta([
            ['Customer PO', record.order.customer_po],
            ['Warehouse', record.order.warehouse_name],
          ]),
          lines: commercialLines(record.lines, record.order.warehouse_name),
          subtotal: record.order.subtotal,
          tax: record.order.tax_total,
          total: record.order.total,
          notes: record.order.notes,
        }),
      );
    }
    case 'sales-receipt': {
      const record = await getSalesReceipt(context, id);
      if (!record) missing(kind);
      return stamp(
        context,
        buildDocumentModel({
          kind,
          number: record.receipt.receipt_no,
          issueDate: record.receipt.receipt_date,
          currency: record.receipt.currency_code,
          party: {
            name: record.receipt.customer_name,
            email: record.receipt.customer_email,
            address: record.receipt.bill_address,
          },
          shipTo:
            record.receipt.ship_to_name || record.receipt.ship_to_address
              ? {
                  name: record.receipt.ship_to_name || record.receipt.customer_name,
                  address: record.receipt.ship_to_address,
                }
              : null,
          meta: meta([
            ['Customer PO', record.receipt.customer_po],
            ['Warehouse', record.receipt.warehouse_name],
          ]),
          lines: commercialLines(record.lines, record.receipt.warehouse_name),
          subtotal: record.receipt.subtotal,
          tax: record.receipt.tax_total,
          total: record.receipt.total,
          notes: record.receipt.notes,
        }),
      );
    }
    case 'ar-receipt': {
      const record = await getArReceipt(context, id);
      if (!record) missing(kind);
      return stamp(
        context,
        mapPaymentDocument({
          kind: 'receipt',
          number: record.receipt.receipt_no,
          issueDate: record.receipt.receipt_date,
          party: {
            name: record.receipt.customer_name,
            email: record.receipt.customer_email,
            address: record.receipt.bill_address,
          },
          currency: record.receipt.currency_code,
          amount: record.receipt.amount,
          notes: record.receipt.memo,
          allocations: record.allocations.map((row) => ({
            description: row.invoice_no ? `Invoice ${row.invoice_no}` : 'Invoice',
            date: row.invoice_date,
            amount: row.amount,
          })),
        }),
      );
    }
    case 'credit-note': {
      const record = await getCreditNote(context, id);
      if (!record) missing(kind);
      return stamp(
        context,
        buildDocumentModel({
          kind,
          number: record.note.credit_no,
          issueDate: record.note.credit_date,
          currency: record.note.currency_code,
          party: {
            name: record.note.customer_name,
            email: record.note.customer_email,
            address: record.note.bill_address,
          },
          meta: meta([
            ['Invoice', record.note.invoice_no],
            ['Warehouse', record.note.warehouse_name],
          ]),
          lines: commercialLines(record.lines),
          subtotal: record.note.subtotal,
          tax: record.note.tax_total,
          total: record.note.total,
          notes: record.note.notes,
        }),
      );
    }
    case 'debit-note': {
      const record = await getDebitNote(context, id);
      if (!record) missing(kind);
      return stamp(
        context,
        buildDocumentModel({
          kind,
          number: record.note.debit_no,
          issueDate: record.note.debit_date,
          currency: record.note.currency_code,
          party: {
            name: record.note.customer_name,
            email: record.note.customer_email,
            address: record.note.bill_address,
          },
          lines: commercialLines(record.lines),
          subtotal: record.note.subtotal,
          tax: record.note.tax_total,
          total: record.note.total,
          notes: record.note.notes,
        }),
      );
    }
    case 'refund': {
      const record = await getRefund(context, id);
      if (!record) missing(kind);
      return stamp(
        context,
        mapPaymentDocument({
          kind: 'refund',
          number: record.refund.refund_no,
          issueDate: record.refund.refund_date,
          party: {
            name: record.refund.customer_name,
            email: record.refund.customer_email,
            address: record.refund.bill_address,
          },
          currency: record.refund.currency_code,
          amount: record.refund.amount,
          notes: record.refund.memo,
          allocations: record.allocations.map((row) => ({
            description: row.invoice_no ? `Invoice ${row.invoice_no}` : 'Invoice',
            date: row.invoice_date,
            amount: row.amount,
          })),
        }),
      );
    }
    case 'purchase-order': {
      const record = await getPurchaseOrder(context, id);
      if (!record) missing(kind);
      return stamp(
        context,
        buildDocumentModel({
          kind,
          number: record.po.po_no,
          issueDate: record.po.order_date,
          dueDate: record.po.expected_date,
          currency: record.po.currency_code,
          party: {
            name: record.po.supplier_name,
            email: record.po.supplier_email,
            address: record.po.mailing_address,
          },
          meta: meta([['Warehouse', record.po.warehouse_name]]),
          lines: commercialLines(
            record.lines.map((line) => ({
              description: line.description,
              sku: line.part_number,
              quantity: line.quantity,
              unit_price: line.unit_price,
              tax_label: line.tax_label,
              tax_amount: line.tax_amount,
              line_net: line.line_net,
            })),
          ),
          subtotal: record.po.subtotal,
          tax: record.po.tax_total,
          total: record.po.total,
          notes: record.po.notes,
        }),
      );
    }
    case 'goods-receipt': {
      const record = await getGoodsReceipt(context, id);
      if (!record) missing(kind);
      return stamp(
        context,
        buildDocumentModel({
          kind,
          number: record.receipt.grn_no,
          issueDate: record.receipt.receipt_date,
          currency: 'KES',
          party: {
            name: record.receipt.supplier_name,
            email: record.receipt.supplier_email,
            address: record.receipt.mailing_address,
          },
          meta: meta([
            ['Warehouse', record.receipt.warehouse_name],
            ['Purchase order', record.receipt.po_no],
          ]),
          lines: record.lines.map((line) => ({
            description: line.description,
            sku: line.sku,
            quantity: line.quantity,
            unitPrice: line.unit_cost,
            amount: line.unit_cost,
            extra: line.extra,
          })),
          subtotal: '0',
          tax: '0',
          total: '0',
          notes: record.receipt.notes,
        }),
      );
    }
    case 'bill': {
      const record = await getBill(context, id);
      if (!record) missing(kind);
      return stamp(
        context,
        buildDocumentModel({
          kind,
          number: record.bill.bill_no,
          issueDate: record.bill.bill_date,
          dueDate: record.bill.due_date,
          currency: record.bill.currency_code,
          party: {
            name: record.bill.supplier_name,
            email: record.bill.supplier_email,
            address: record.bill.mailing_address,
          },
          meta: meta([['Supplier ref', record.bill.supplier_ref]]),
          lines: commercialLines(record.lines),
          subtotal: record.bill.subtotal,
          tax: record.bill.tax_total,
          total: record.bill.total,
          balance: record.bill.outstanding,
          notes: record.bill.notes,
        }),
      );
    }
    case 'supplier-payment': {
      const record = await getSupplierPayment(context, id);
      if (!record) missing(kind);
      return stamp(
        context,
        mapPaymentDocument({
          kind: 'supplier-payment',
          number: record.payment.payment_no,
          issueDate: record.payment.payment_date,
          party: {
            name: record.payment.supplier_name,
            email: record.payment.supplier_email,
            address: record.payment.mailing_address,
          },
          currency: record.payment.currency_code,
          amount: record.payment.amount,
          notes: record.payment.memo,
          allocations: record.allocations.map((row) => ({
            description: row.bill_no ? `Bill ${row.bill_no}` : 'Bill',
            date: row.bill_date,
            amount: row.amount,
          })),
        }),
      );
    }
    case 'supplier-credit': {
      const record = await getSupplierCredit(context, id);
      if (!record) missing(kind);
      return stamp(
        context,
        buildDocumentModel({
          kind,
          number: record.credit.credit_no,
          issueDate: record.credit.credit_date,
          currency: record.credit.currency_code,
          party: {
            name: record.credit.supplier_name,
            email: record.credit.supplier_email,
            address: record.credit.mailing_address,
          },
          lines: commercialLines(record.lines),
          subtotal: record.credit.subtotal,
          tax: record.credit.tax_total,
          total: record.credit.total,
          notes: record.credit.notes,
        }),
      );
    }
    case 'customer-statement': {
      const statement = await getCustomerStatement(context, id, asOf);
      if (!statement) missing(kind);
      const openRows = statement.open_invoices.map((row) => ({
        description: `Invoice ${row.invoice_no}`,
        date: String(row.invoice_date),
        due: String(row.due_date),
        amount: String(row.outstanding),
      }));
      let openTotal = Money.zero();
      for (const row of openRows) openTotal = openTotal.plus(row.amount);
      return stamp(
        context,
        mapStatementDocument({
          kind: 'customer-statement',
          asOf: String(statement.as_of),
          party: {
            name: statement.customer_name,
            email: statement.customer_email,
            phone: statement.customer_phone,
            address: statement.customer_address,
          },
          currency: statement.currency_code,
          openRows,
          activityRows: statement.recent_activity.map((row) => ({
            description: `${row.type.replaceAll('_', ' ')} ${row.doc_no ?? ''}`.trim(),
            date: String(row.doc_date),
            amount: String(row.amount),
          })),
          total: openTotal.toDatabase(),
        }),
      );
    }
    case 'supplier-statement': {
      const statement = await getSupplierStatement(context, id, asOf);
      if (!statement) missing(kind);
      const openRows = statement.open_bills.map((row) => ({
        description: `Bill ${row.bill_no}`,
        date: String(row.bill_date),
        due: String(row.due_date),
        amount: String(row.outstanding),
      }));
      let openTotal = Money.zero();
      for (const row of openRows) openTotal = openTotal.plus(row.amount);
      return stamp(
        context,
        mapStatementDocument({
          kind: 'supplier-statement',
          asOf: String(statement.as_of),
          party: {
            name: statement.supplier_name,
            email: statement.supplier_email,
            phone: statement.supplier_phone,
            address: statement.supplier_address,
          },
          currency: statement.currency_code,
          openRows,
          activityRows: statement.recent_activity.map((row) => ({
            description: `${row.type.replaceAll('_', ' ')} ${row.doc_no ?? ''}`.trim(),
            date: String(row.doc_date),
            amount: String(row.amount),
          })),
          total: openTotal.toDatabase(),
        }),
      );
    }
    case 'stock-transfer': {
      const record = await getTransfer(context, id);
      if (!record) missing(kind);
      let transferTotal = Money.zero();
      for (const line of record.lines) transferTotal = transferTotal.plus(line.value);
      return stamp(
        context,
        buildDocumentModel({
          kind,
          number: record.header.id.slice(0, 8).toUpperCase(),
          issueDate: record.header.movementDate,
          currency: 'KES',
          party: {
            name: record.header.fromWarehouse || 'Source warehouse',
          },
          shipTo: record.header.toWarehouse ? { name: record.header.toWarehouse } : null,
          lines: record.lines.map((line) => ({
            description: `${line.description} (${line.movementType.replaceAll('_', ' ')})`,
            sku: line.partNumber,
            quantity: line.quantity,
            unitPrice: line.unitCost,
            amount: line.value,
            extra: line.warehouseCode,
          })),
          subtotal: transferTotal.toDatabase(),
          tax: '0',
          total: transferTotal.toDatabase(),
          notes: record.header.notes,
        }),
      );
    }
    case 'inventory-adjustment': {
      const record = await getAdjustment(context, id);
      if (!record) missing(kind);
      let adjustmentTotal = Money.zero();
      for (const line of record.lines) adjustmentTotal = adjustmentTotal.plus(line.value);
      return stamp(
        context,
        buildDocumentModel({
          kind,
          number: record.header.reference,
          issueDate: record.header.adjustmentDate,
          currency: 'KES',
          party: {
            name: `${record.header.accountCode} — ${record.header.accountName}`,
          },
          meta: meta([['Reason', record.header.reason]]),
          lines: record.lines.map((line) => ({
            description: line.description,
            sku: line.partNumber,
            quantity: line.quantity,
            unitPrice: line.unitCost,
            amount: line.value,
            extra: line.warehouseCode,
          })),
          subtotal: adjustmentTotal.toDatabase(),
          tax: '0',
          total: adjustmentTotal.toDatabase(),
          notes: record.header.notes,
        }),
      );
    }
  }
}

export async function loadDraftDocumentModel(
  context: RequestContext,
  draft: DocumentDraft,
): Promise<DocumentModel> {
  return stamp(context, documentModelFromDraft(draft));
}

export async function renderSavedDocumentPdf(
  context: RequestContext,
  kind: DocumentKind,
  id: string,
  asOf?: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const model = await loadDocumentModel(context, kind, id, asOf);
  return {
    buffer: await renderDocumentPdf(model),
    filename: documentFilename(kind, model.number),
  };
}

export async function renderDraftDocumentPdf(
  context: RequestContext,
  draft: DocumentDraft,
): Promise<{ buffer: Buffer; filename: string }> {
  const model = await loadDraftDocumentModel(context, draft);
  return {
    buffer: await renderDocumentPdf(model),
    filename: documentFilename(draft.kind, model.number),
  };
}
