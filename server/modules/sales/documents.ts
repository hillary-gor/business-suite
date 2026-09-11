import {
  withReadOnlyTransaction,
  withTransaction,
  type RequestContext,
} from '@/server/db/transaction';
import type {
  SaveCreditNoteInput,
  SaveCustomerInput,
  SaveDebitNoteInput,
  SaveInvoiceInput,
  SaveQuotationInput,
  SaveReceiptInput,
  SaveRefundInput,
  SaveSalesOrderInput,
  SaveSalesReceiptInput,
} from './schemas';

export async function saveCustomer(context: RequestContext, input: SaveCustomerInput) {
  return withTransaction(context, async (tx) => {
    const id = await tx.scalar<string>(`select app.save_customer($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        customer_id: input.customerId ?? null,
        code: input.code ?? null,
        legal_name: input.legalName,
        trading_name: input.tradingName ?? null,
        tax_pin: input.taxPin ?? null,
        currency_code: input.currencyCode ?? null,
        payment_terms_id: input.paymentTermsId ?? null,
        email: input.email || null,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
      }),
    ]);
    return { customerId: id };
  });
}

export async function saveInvoice(context: RequestContext, input: SaveInvoiceInput) {
  return withTransaction(context, async (tx) => {
    const invoiceId = await tx.scalar<string>(`select sales.save_invoice($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        invoice_id: input.invoiceId ?? null,
        customer_id: input.customerId,
        invoice_date: input.invoiceDate,
        due_date: input.dueDate ?? null,
        currency_code: input.currencyCode ?? null,
        payment_terms_id: input.paymentTermsId ?? null,
        warehouse_id: input.warehouseId ?? null,
        bill_email: input.billEmail || null,
        ship_to_name: input.shipToName ?? null,
        ship_to_address: input.shipToAddress ?? null,
        customer_po: input.customerPo ?? null,
        notes: input.notes ?? null,
        lines: input.lines.map((line) => ({
          item_id: line.itemId ?? null,
          description: line.description,
          service_date: line.serviceDate ?? null,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          tax_code_id: line.taxCodeId ?? null,
          revenue_account_id: line.revenueAccountId ?? null,
          stock_unit_id: line.stockUnitId ?? null,
          stock_lot_id: line.stockLotId ?? null,
        })),
      }),
    ]);

    let entryId: string | null = null;
    let invoiceNo: string | null = null;

    if (input.issue) {
      entryId = await tx.scalar<string>(`select sales.issue_invoice($1, $2)`, [
        invoiceId,
        input.idempotencyKey ?? null,
      ]);
      const row = await tx.one<{ invoice_no: string }>(
        `select invoice_no from sales.invoices where id = $1`,
        [invoiceId],
      );
      invoiceNo = row.invoice_no;
    }

    return { invoiceId, entryId, invoiceNo };
  });
}

export async function voidInvoice(context: RequestContext, invoiceId: string, reason: string) {
  return withTransaction(context, async (tx) => {
    const entryId = await tx.scalar<string>(`select sales.void_invoice($1, $2)`, [
      invoiceId,
      reason,
    ]);
    return { entryId };
  });
}

export async function saveReceipt(context: RequestContext, input: SaveReceiptInput) {
  return withTransaction(context, async (tx) => {
    const receiptId = await tx.scalar<string>(`select sales.save_receipt($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        receipt_id: input.receiptId ?? null,
        customer_id: input.customerId,
        receipt_date: input.receiptDate,
        amount: input.amount,
        bank_account_id: input.bankAccountId,
        currency_code: input.currencyCode ?? null,
        memo: input.memo ?? null,
        allocations: input.allocations.map((a) => ({
          invoice_id: a.invoiceId,
          amount: a.amount,
        })),
      }),
    ]);

    let entryId: string | null = null;
    let receiptNo: string | null = null;

    if (input.post) {
      entryId = await tx.scalar<string>(`select sales.post_receipt($1, $2)`, [
        receiptId,
        input.idempotencyKey ?? null,
      ]);
      const row = await tx.one<{ receipt_no: string }>(
        `select receipt_no from sales.receipts where id = $1`,
        [receiptId],
      );
      receiptNo = row.receipt_no;
    }

    return { receiptId, entryId, receiptNo };
  });
}

export async function listCustomers(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      code: string;
      legal_name: string;
      trading_name: string | null;
      currency_code: string;
      email: string | null;
      is_active: boolean;
      outstanding: string;
    }>(
      `select c.id, c.code, c.legal_name, c.trading_name, c.currency_code, c.email, c.is_active,
              coalesce((
                select sum(b.outstanding)
                  from sales.v_invoice_balances b
                  join sales.invoices i on i.id = b.id
                 where i.customer_id = c.id and i.status = 'ISSUED'
              ), 0)::text as outstanding
         from app.customers c
        where c.entity_id = $1
        order by c.legal_name`,
      [context.entityId],
    ),
  );
}

export async function listInvoices(
  context: RequestContext,
  filter: {
    status: string;
    from: string;
    to: string;
    today: string;
    sort: 'date' | 'status';
    dir: 'asc' | 'desc';
    limit: number;
    offset: number;
  },
) {
  return withReadOnlyTransaction(context, async (tx) => {
    const summary = await tx.one<{ total: string }>(
      `select count(*)::text as total
         from sales.invoices i
         join app.customers c on c.id = i.customer_id
         join sales.v_invoice_balances b on b.id = i.id
        where i.entity_id = $1
          and i.invoice_date between $2::date and $3::date
          and (
            $4 = 'all'
            or ($4 = 'unpaid' and i.status = 'ISSUED' and b.outstanding > 0)
            or (
              $4 = 'overdue'
              and i.status = 'ISSUED'
              and b.outstanding > 0
              and i.due_date < $5::date
            )
            or (
              $4 = 'not_due'
              and i.status = 'ISSUED'
              and b.outstanding > 0
              and i.due_date >= $5::date
            )
            or ($4 = 'paid' and i.status = 'ISSUED' and b.outstanding <= 0)
            or ($4 = 'deposited' and i.status = 'ISSUED' and b.outstanding <= 0)
            or ($4 = 'not_deposited' and false)
            or ($4 = 'needs_attention' and false)
          )`,
      [context.entityId, filter.from, filter.to, filter.status, filter.today],
    );

    const total = Number(summary.total);
    const lastPage = Math.max(1, Math.ceil(total / Math.max(1, filter.limit)));
    const requestedPage = Math.floor(filter.offset / Math.max(1, filter.limit)) + 1;
    const page = Math.min(Math.max(1, requestedPage), lastPage);
    const offset = (page - 1) * filter.limit;

    const rows = await tx.query<{
      id: string;
      invoice_no: string | null;
      status: string;
      invoice_date: string;
      due_date: string;
      customer_id: string;
      customer_name: string;
      currency_code: string;
      total: string;
      outstanding: string;
    }>(
      `select i.id, i.invoice_no, i.status::text, i.invoice_date::text, i.due_date::text,
              i.customer_id::text as customer_id, c.legal_name as customer_name,
              i.currency_code, i.total::text, b.outstanding::text
         from sales.invoices i
         join app.customers c on c.id = i.customer_id
         join sales.v_invoice_balances b on b.id = i.id
        where i.entity_id = $1
          and i.invoice_date between $2::date and $3::date
          and (
            $4 = 'all'
            or ($4 = 'unpaid' and i.status = 'ISSUED' and b.outstanding > 0)
            or (
              $4 = 'overdue'
              and i.status = 'ISSUED'
              and b.outstanding > 0
              and i.due_date < $5::date
            )
            or (
              $4 = 'not_due'
              and i.status = 'ISSUED'
              and b.outstanding > 0
              and i.due_date >= $5::date
            )
            or ($4 = 'paid' and i.status = 'ISSUED' and b.outstanding <= 0)
            or ($4 = 'deposited' and i.status = 'ISSUED' and b.outstanding <= 0)
            or ($4 = 'not_deposited' and false)
            or ($4 = 'needs_attention' and false)
          )
        order by
          case
            when $6 = 'status' then (
              case
                when i.status = 'ISSUED' and b.outstanding > 0 and i.due_date < $5::date then 0
                when i.status = 'ISSUED' and b.outstanding > 0 then 1
                when i.status = 'ISSUED' then 2
                when i.status = 'DRAFT' then 3
                else 4
              end
            ) * case when $7 = 'desc' then -1 else 1 end
            else extract(epoch from i.invoice_date)::bigint * case when $7 = 'desc' then -1 else 1 end
          end,
          i.created_at desc
        limit $8 offset $9`,
      [
        context.entityId,
        filter.from,
        filter.to,
        filter.status,
        filter.today,
        filter.sort,
        filter.dir,
        filter.limit,
        offset,
      ],
    );

    return { rows, total, page };
  });
}

export async function getInvoice(context: RequestContext, invoiceId: string) {
  return withReadOnlyTransaction(context, async (tx) => {
    const invoice = await tx.maybeOne<{
      id: string;
      invoice_no: string | null;
      status: string;
      customer_id: string;
      customer_name: string;
      customer_email: string | null;
      customer_phone: string | null;
      bill_address: string | null;
      ship_to_name: string | null;
      ship_to_address: string | null;
      customer_ship_address: string | null;
      warehouse_name: string | null;
      payment_terms_name: string | null;
      invoice_date: string;
      due_date: string;
      currency_code: string;
      customer_po: string | null;
      notes: string | null;
      subtotal: string;
      tax_total: string;
      total: string;
      outstanding: string;
      journal_entry_id: string | null;
      issued_at: string | null;
      paid_on: string | null;
    }>(
      `select i.id, i.invoice_no, i.status::text, i.customer_id, c.legal_name as customer_name,
              nullif(btrim(coalesce(i.bill_email, c.email)), '') as customer_email,
              c.phone as customer_phone,
              app.format_address(c.billing_address_id) as bill_address,
              i.ship_to_name, i.ship_to_address,
              app.format_address(c.shipping_address_id) as customer_ship_address,
              w.name as warehouse_name, pt.name as payment_terms_name,
              i.invoice_date::text, i.due_date::text, i.currency_code, i.customer_po, i.notes,
              i.subtotal::text, i.tax_total::text, i.total::text, b.outstanding::text,
              i.journal_entry_id,
              to_char(j.posted_at at time zone 'Africa/Nairobi', 'YYYY-MM-DD HH24:MI') as issued_at,
              (
                select max(r.receipt_date)::text
                  from sales.receipt_allocations a
                  join sales.receipts r on r.id = a.receipt_id
                 where a.invoice_id = i.id
                   and r.status = 'POSTED'
              ) as paid_on
         from sales.invoices i
         join app.customers c on c.id = i.customer_id
         join sales.v_invoice_balances b on b.id = i.id
         left join gl.journal_entry j on j.id = i.journal_entry_id
         left join inv.warehouses w on w.id = i.warehouse_id
         left join app.payment_terms pt on pt.id = i.payment_terms_id
        where i.entity_id = $1 and i.id = $2`,
      [context.entityId, invoiceId],
    );
    if (!invoice) return null;

    const lines = await tx.query<{
      line_no: number;
      description: string;
      quantity: string;
      unit_price: string;
      tax_amount: string;
      line_net: string;
      sku: string | null;
      tax_label: string;
    }>(
      `select l.line_no, l.description, l.quantity::text, l.unit_price::text, l.tax_amount::text,
              l.line_net::text, i.part_number as sku,
              case
                when t.id is null then 'No tax'
                when t.rate = 0 then t.code
                else t.code || ' ' || round(t.rate * 100, 2)::text || '%'
              end as tax_label
         from sales.invoice_lines l
         left join inv.items i on i.id = l.item_id
         left join app.tax_codes t on t.id = l.tax_code_id
        where l.invoice_id = $1
        order by l.line_no`,
      [invoiceId],
    );

    return { invoice, lines };
  });
}

export async function listOpenInvoicesForCustomer(context: RequestContext, customerId: string) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      invoice_no: string;
      invoice_date: string;
      due_date: string;
      total: string;
      outstanding: string;
      currency_code: string;
    }>(
      `select i.id, i.invoice_no, i.invoice_date::text, i.due_date::text,
              i.total::text, b.outstanding::text, i.currency_code
         from sales.invoices i
         join sales.v_invoice_balances b on b.id = i.id
        where i.entity_id = $1
          and i.customer_id = $2
          and i.status = 'ISSUED'
          and b.outstanding > 0
        order by i.invoice_date, i.invoice_no`,
      [context.entityId, customerId],
    ),
  );
}

export async function listCustomersForSelect(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      code: string;
      legal_name: string;
      currency_code: string;
      email: string | null;
      phone: string | null;
      payment_terms_id: string | null;
    }>(
      `select id, code, legal_name, currency_code, email, phone, payment_terms_id
         from app.customers
        where entity_id = $1 and is_active
        order by legal_name`,
      [context.entityId],
    ),
  );
}

export async function listTaxCodes(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{ id: string; code: string; name: string; rate: string }>(
      `select id, code, name, rate::text
         from app.tax_codes
        where entity_id = $1 and is_active
        order by code`,
      [context.entityId],
    ),
  );
}

export async function listBankAccounts(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{ id: string; code: string; name: string; currency_code: string | null }>(
      `select id, code, name, currency_code
         from gl.accounts
        where entity_id = $1
          and is_active
          and is_postable
          and control_type in ('BANK', 'CASH')
        order by code`,
      [context.entityId],
    ),
  );
}

export async function listPaymentTerms(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{ id: string; code: string; name: string; days_net: number }>(
      `select id, code, name, days_net
         from app.payment_terms
        where entity_id = $1 and is_active
        order by days_net, code`,
      [context.entityId],
    ),
  );
}

export async function listWarehousesForSelect(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{ id: string; code: string; name: string }>(
      `select id, code, name
         from inv.warehouses
        where entity_id = $1 and is_active and not is_consignment
        order by code`,
      [context.entityId],
    ),
  );
}

export async function listSellableItems(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      part_number: string;
      description: string;
      tracking_mode: string;
      is_stocked: boolean;
      sales_price: string | null;
      default_tax_code_id: string | null;
      qty_on_hand: string;
    }>(
      `select i.id, i.part_number, i.description, i.tracking_mode::text, i.is_stocked,
              i.sales_price::text, i.default_tax_code_id,
              coalesce((
                select sum(b.quantity_on_hand)
                  from inv.stock_balances b
                 where b.item_id = i.id
              ), 0)::text as qty_on_hand
         from inv.items i
        where i.entity_id = $1 and i.is_active and i.is_sellable
        order by i.part_number
        limit 500`,
      [context.entityId],
    ),
  );
}

export async function listOnHandUnits(context: RequestContext, warehouseId?: string) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      item_id: string;
      serial_number: string;
      warehouse_id: string;
      condition_code: string;
    }>(
      `select id, item_id, serial_number, warehouse_id, condition_code
         from inv.stock_units
        where entity_id = $1
          and status = 'ON_HAND'
          and ($2::uuid is null or warehouse_id = $2)
        order by serial_number
        limit 1000`,
      [context.entityId, warehouseId ?? null],
    ),
  );
}

export async function listOnHandLots(context: RequestContext, warehouseId?: string) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      item_id: string;
      lot_number: string;
      warehouse_id: string | null;
      quantity_on_hand: string;
    }>(
      `select l.id, l.item_id, l.lot_number,
              (
                select sl.warehouse_id
                  from inv.stock_ledger sl
                 where sl.stock_lot_id = l.id
                 order by sl.id desc
                 limit 1
              ) as warehouse_id,
              coalesce((
                select sum(sl.quantity)
                  from inv.stock_ledger sl
                 where sl.stock_lot_id = l.id
              ), 0)::text as quantity_on_hand
         from inv.stock_lots l
        where l.entity_id = $1
          and coalesce((
                select sum(sl.quantity)
                  from inv.stock_ledger sl
                 where sl.stock_lot_id = l.id
              ), 0) > 0
          and (
            $2::uuid is null
            or exists (
              select 1 from inv.stock_ledger sl
               where sl.stock_lot_id = l.id and sl.warehouse_id = $2
            )
          )
        order by l.lot_number
        limit 1000`,
      [context.entityId, warehouseId ?? null],
    ),
  );
}

export async function saveQuotation(context: RequestContext, input: SaveQuotationInput) {
  return withTransaction(context, async (tx) => {
    const quotationId = await tx.scalar<string>(`select sales.save_quotation($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        quotation_id: input.quotationId ?? null,
        customer_id: input.customerId,
        quotation_date: input.quotationDate,
        valid_until: input.validUntil ?? null,
        currency_code: input.currencyCode ?? null,
        warehouse_id: input.warehouseId ?? null,
        notes: input.notes ?? null,
        lines: input.lines.map((line) => ({
          item_id: line.itemId ?? null,
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          tax_code_id: line.taxCodeId ?? null,
          revenue_account_id: line.revenueAccountId ?? null,
        })),
      }),
    ]);

    let quotationNo: string | null = null;
    if (input.send) {
      quotationNo = await tx.scalar<string>(`select sales.send_quotation($1)`, [quotationId]);
    }
    return { quotationId, quotationNo };
  });
}

export async function convertQuotationToInvoice(context: RequestContext, quotationId: string) {
  return withTransaction(context, async (tx) => {
    const invoiceId = await tx.scalar<string>(`select sales.convert_quotation_to_invoice($1)`, [
      quotationId,
    ]);
    return { invoiceId };
  });
}

export async function acceptQuotation(context: RequestContext, quotationId: string) {
  return withTransaction(context, async (tx) => {
    await tx.query(`select sales.accept_quotation($1)`, [quotationId]);
  });
}

export async function getQuotation(context: RequestContext, quotationId: string) {
  return withReadOnlyTransaction(context, async (tx) => {
    const header = await tx.maybeOne<{
      id: string;
      quotation_no: string | null;
      status: string;
      quotation_date: string;
      valid_until: string | null;
      customer_id: string;
      customer_name: string;
      customer_email: string | null;
      customer_phone: string | null;
      bill_address: string | null;
      ship_address: string | null;
      warehouse_name: string | null;
      notes: string | null;
      currency_code: string;
      subtotal: string;
      tax_total: string;
      total: string;
      converted_invoice_id: string | null;
    }>(
      `select q.id, q.quotation_no, q.status::text, q.quotation_date::text, q.valid_until::text,
              q.customer_id, c.legal_name as customer_name, c.email as customer_email,
              c.phone as customer_phone, app.format_address(c.billing_address_id) as bill_address,
              app.format_address(c.shipping_address_id) as ship_address, w.name as warehouse_name,
              q.notes, q.currency_code, q.subtotal::text, q.tax_total::text, q.total::text,
              q.converted_invoice_id
         from sales.quotations q
         join app.customers c on c.id = q.customer_id
         left join inv.warehouses w on w.id = q.warehouse_id
        where q.id = $1 and q.entity_id = $2`,
      [quotationId, context.entityId],
    );
    if (!header) return null;
    const lines = await tx.query<{
      item_id: string | null;
      description: string;
      quantity: string;
      unit_price: string;
      tax_code_id: string | null;
      sku: string | null;
      tax_amount: string;
      line_net: string;
      tax_label: string;
    }>(
      `select l.item_id, l.description, l.quantity::text, l.unit_price::text, l.tax_code_id,
              i.part_number as sku, l.tax_amount::text, l.line_net::text,
              case
                when t.id is null then 'No tax'
                when t.rate = 0 then t.code
                else t.code || ' ' || round(t.rate * 100, 2)::text || '%'
              end as tax_label
         from sales.quotation_lines l
         left join inv.items i on i.id = l.item_id
         left join app.tax_codes t on t.id = l.tax_code_id
        where l.quotation_id = $1
        order by l.line_no`,
      [quotationId],
    );
    return { ...header, lines };
  });
}

export async function listQuotations(
  context: RequestContext,
  input: { status?: string | null; from?: string | null; to?: string | null } = {},
) {
  return withReadOnlyTransaction(context, async (tx) => {
    const { has_any: hasAny } = await tx.one<{ has_any: boolean }>(
      `select exists(select 1 from sales.quotations where entity_id = $1) as has_any`,
      [context.entityId],
    );
    const rows = await tx.query<{
      id: string;
      quotation_no: string | null;
      status: string;
      quotation_date: string;
      updated_on: string;
      converted_invoice_id: string | null;
      customer_name: string;
      currency_code: string;
      total: string;
    }>(
      `select q.id, q.quotation_no, q.status::text, q.quotation_date::text,
              q.updated_at::date::text as updated_on, q.converted_invoice_id,
              c.legal_name as customer_name, q.currency_code, q.total::text
         from sales.quotations q
         join app.customers c on c.id = q.customer_id
        where q.entity_id = $1
          and ($2::text is null or q.status::text = $2)
          and ($3::date is null or q.quotation_date >= $3)
          and ($4::date is null or q.quotation_date <= $4)
        order by q.quotation_date desc, q.created_at desc
        limit 200`,
      [context.entityId, input.status ?? null, input.from ?? null, input.to ?? null],
    );
    return { rows, hasAny };
  });
}

export async function saveSalesOrder(context: RequestContext, input: SaveSalesOrderInput) {
  return withTransaction(context, async (tx) => {
    const salesOrderId = await tx.scalar<string>(`select sales.save_sales_order($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        sales_order_id: input.salesOrderId ?? null,
        customer_id: input.customerId,
        order_date: input.orderDate,
        currency_code: input.currencyCode ?? null,
        warehouse_id: input.warehouseId ?? null,
        customer_po: input.customerPo ?? null,
        notes: input.notes ?? null,
        lines: input.lines.map((line) => ({
          item_id: line.itemId ?? null,
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          tax_code_id: line.taxCodeId ?? null,
          revenue_account_id: line.revenueAccountId ?? null,
        })),
      }),
    ]);

    let orderNo: string | null = null;
    if (input.confirm) {
      orderNo = await tx.scalar<string>(`select sales.confirm_sales_order($1)`, [salesOrderId]);
    }
    return { salesOrderId, orderNo };
  });
}

export async function convertOrderToInvoice(context: RequestContext, salesOrderId: string) {
  return withTransaction(context, async (tx) => {
    const invoiceId = await tx.scalar<string>(`select sales.convert_order_to_invoice($1)`, [
      salesOrderId,
    ]);
    return { invoiceId };
  });
}

export async function listSalesOrders(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      order_no: string | null;
      status: string;
      order_date: string;
      customer_name: string;
      currency_code: string;
      total: string;
    }>(
      `select o.id, o.order_no, o.status::text, o.order_date::text,
              c.legal_name as customer_name, o.currency_code, o.total::text
         from sales.sales_orders o
         join app.customers c on c.id = o.customer_id
        where o.entity_id = $1
        order by o.order_date desc, o.created_at desc
        limit 200`,
      [context.entityId],
    ),
  );
}

export async function saveCreditNote(context: RequestContext, input: SaveCreditNoteInput) {
  return withTransaction(context, async (tx) => {
    const creditNoteId = await tx.scalar<string>(`select sales.save_credit_note($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        credit_note_id: input.creditNoteId ?? null,
        customer_id: input.customerId,
        credit_date: input.creditDate,
        currency_code: input.currencyCode ?? null,
        warehouse_id: input.warehouseId ?? null,
        invoice_id: input.invoiceId ?? null,
        notes: input.notes ?? null,
        restock: input.restock,
        lines: input.lines.map((line) => ({
          item_id: line.itemId ?? null,
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          tax_code_id: line.taxCodeId ?? null,
          revenue_account_id: line.revenueAccountId ?? null,
          stock_unit_id: line.stockUnitId ?? null,
          unit_cost_base: line.unitCostBase ?? null,
        })),
        allocations: input.allocations.map((a) => ({
          invoice_id: a.invoiceId,
          amount: a.amount,
        })),
      }),
    ]);

    let entryId: string | null = null;
    let creditNo: string | null = null;
    if (input.post) {
      entryId = await tx.scalar<string>(`select sales.post_credit_note($1, $2)`, [
        creditNoteId,
        input.idempotencyKey ?? null,
      ]);
      const row = await tx.one<{ credit_no: string }>(
        `select credit_no from sales.credit_notes where id = $1`,
        [creditNoteId],
      );
      creditNo = row.credit_no;
    }
    return { creditNoteId, entryId, creditNo };
  });
}

export async function listCreditNotes(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      credit_no: string | null;
      status: string;
      credit_date: string;
      customer_name: string;
      currency_code: string;
      total: string;
    }>(
      `select cn.id, cn.credit_no, cn.status::text, cn.credit_date::text,
              c.legal_name as customer_name, cn.currency_code, cn.total::text
         from sales.credit_notes cn
         join app.customers c on c.id = cn.customer_id
        where cn.entity_id = $1
        order by cn.credit_date desc, cn.created_at desc
        limit 200`,
      [context.entityId],
    ),
  );
}

export async function saveDebitNote(context: RequestContext, input: SaveDebitNoteInput) {
  return withTransaction(context, async (tx) => {
    const debitNoteId = await tx.scalar<string>(`select sales.save_debit_note($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        debit_note_id: input.debitNoteId ?? null,
        customer_id: input.customerId,
        debit_date: input.debitDate,
        currency_code: input.currencyCode ?? null,
        notes: input.notes ?? null,
        lines: input.lines.map((line) => ({
          item_id: line.itemId ?? null,
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          tax_code_id: line.taxCodeId ?? null,
          revenue_account_id: line.revenueAccountId ?? null,
        })),
      }),
    ]);

    let entryId: string | null = null;
    let debitNo: string | null = null;
    if (input.post) {
      entryId = await tx.scalar<string>(`select sales.post_debit_note($1, $2)`, [
        debitNoteId,
        input.idempotencyKey ?? null,
      ]);
      const row = await tx.one<{ debit_no: string }>(
        `select debit_no from sales.debit_notes where id = $1`,
        [debitNoteId],
      );
      debitNo = row.debit_no;
    }
    return { debitNoteId, entryId, debitNo };
  });
}

export async function listDebitNotes(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      debit_no: string | null;
      status: string;
      debit_date: string;
      customer_name: string;
      currency_code: string;
      total: string;
    }>(
      `select dn.id, dn.debit_no, dn.status::text, dn.debit_date::text,
              c.legal_name as customer_name, dn.currency_code, dn.total::text
         from sales.debit_notes dn
         join app.customers c on c.id = dn.customer_id
        where dn.entity_id = $1
        order by dn.debit_date desc, dn.created_at desc
        limit 200`,
      [context.entityId],
    ),
  );
}

export async function saveRefund(context: RequestContext, input: SaveRefundInput) {
  return withTransaction(context, async (tx) => {
    const refundId = await tx.scalar<string>(`select sales.save_refund($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        refund_id: input.refundId ?? null,
        customer_id: input.customerId,
        refund_date: input.refundDate,
        amount: input.amount,
        bank_account_id: input.bankAccountId,
        currency_code: input.currencyCode ?? null,
        memo: input.memo ?? null,
        allocations: input.allocations.map((a) => ({
          invoice_id: a.invoiceId,
          amount: a.amount,
        })),
      }),
    ]);

    let entryId: string | null = null;
    let refundNo: string | null = null;
    if (input.post) {
      entryId = await tx.scalar<string>(`select sales.post_refund($1, $2)`, [
        refundId,
        input.idempotencyKey ?? null,
      ]);
      const row = await tx.one<{ refund_no: string }>(
        `select refund_no from sales.refunds where id = $1`,
        [refundId],
      );
      refundNo = row.refund_no;
    }
    return { refundId, entryId, refundNo };
  });
}

export async function listRefunds(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      refund_no: string | null;
      status: string;
      refund_date: string;
      customer_name: string;
      currency_code: string;
      amount: string;
    }>(
      `select r.id, r.refund_no, r.status::text, r.refund_date::text,
              c.legal_name as customer_name, r.currency_code, r.amount::text
         from sales.refunds r
         join app.customers c on c.id = r.customer_id
        where r.entity_id = $1
        order by r.refund_date desc, r.created_at desc
        limit 200`,
      [context.entityId],
    ),
  );
}

export async function saveSalesReceipt(context: RequestContext, input: SaveSalesReceiptInput) {
  return withTransaction(context, async (tx) => {
    const salesReceiptId = await tx.scalar<string>(
      `select sales.save_sales_receipt($1, $2::jsonb)`,
      [
        context.entityId,
        JSON.stringify({
          sales_receipt_id: input.salesReceiptId ?? null,
          customer_id: input.customerId,
          receipt_date: input.receiptDate,
          bank_account_id: input.bankAccountId,
          currency_code: input.currencyCode ?? null,
          payment_terms_id: input.paymentTermsId ?? null,
          warehouse_id: input.warehouseId ?? null,
          bill_email: input.billEmail || null,
          ship_to_name: input.shipToName ?? null,
          ship_to_address: input.shipToAddress ?? null,
          customer_po: input.customerPo ?? null,
          notes: input.notes ?? null,
          lines: input.lines.map((line) => ({
            item_id: line.itemId ?? null,
            description: line.description,
            service_date: line.serviceDate ?? null,
            quantity: line.quantity,
            unit_price: line.unitPrice,
            tax_code_id: line.taxCodeId ?? null,
            stock_unit_id: line.stockUnitId ?? null,
            stock_lot_id: line.stockLotId ?? null,
          })),
        }),
      ],
    );

    let entryId: string | null = null;
    let receiptNo: string | null = null;
    if (input.post) {
      entryId = await tx.scalar<string>(`select sales.post_sales_receipt($1, $2)`, [
        salesReceiptId,
        input.idempotencyKey ?? null,
      ]);
      const row = await tx.one<{ receipt_no: string }>(
        `select receipt_no from sales.sales_receipts where id = $1`,
        [salesReceiptId],
      );
      receiptNo = row.receipt_no;
    }
    return { salesReceiptId, entryId, receiptNo };
  });
}

export async function listSalesReceipts(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      receipt_no: string | null;
      status: string;
      receipt_date: string;
      customer_name: string;
      currency_code: string;
      total: string;
    }>(
      `select r.id, r.receipt_no, r.status::text, r.receipt_date::text,
              c.legal_name as customer_name, r.currency_code, r.total::text
         from sales.sales_receipts r
         join app.customers c on c.id = r.customer_id
        where r.entity_id = $1
        order by r.receipt_date desc, r.created_at desc
        limit 200`,
      [context.entityId],
    ),
  );
}

export async function getEntityDocumentContext(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
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
      has_logo: boolean;
      updated_at: string;
    }>(
      `select legal_name as name, trading_name, registration_number, tax_pin, address_line1,
              address_line2, city, postal_code, country_code, phone, email,
              (logo_bytes is not null) as has_logo, updated_at::text as updated_at
         from app.entities where id = $1`,
      [context.entityId],
    ),
  );
}

export async function getCustomerStatement(
  context: RequestContext,
  customerId: string,
  asOf?: string,
) {
  return withReadOnlyTransaction(context, async (tx) => {
    const customer = await tx.maybeOne<{
      legal_name: string;
      email: string | null;
      phone: string | null;
      currency_code: string;
      address: string | null;
    }>(
      `select legal_name, email, phone, currency_code,
              app.format_address(billing_address_id) as address
         from app.customers
        where entity_id = $1 and id = $2`,
      [context.entityId, customerId],
    );
    if (!customer) return null;

    const raw = await tx.scalar<string>(
      `select sales.customer_statement($1, $2, coalesce($3::date, current_date))::text`,
      [context.entityId, customerId, asOf ?? null],
    );
    const parsed = JSON.parse(raw) as {
      customer_id: string;
      as_of: string;
      open_invoices: Array<{
        invoice_id: string;
        invoice_no: string;
        invoice_date: string;
        due_date: string;
        total: string;
        outstanding: string;
        currency_code: string;
      }>;
      recent_activity: Array<{
        type: string;
        id: string;
        doc_no: string | null;
        doc_date: string;
        amount: string;
        status: string;
      }>;
    };
    return {
      ...parsed,
      customer_name: customer.legal_name,
      customer_email: customer.email,
      customer_phone: customer.phone,
      customer_address: customer.address,
      currency_code: customer.currency_code,
    };
  });
}

export async function getSalesOrder(context: RequestContext, salesOrderId: string) {
  return withReadOnlyTransaction(context, async (tx) => {
    const order = await tx.maybeOne<{
      id: string;
      order_no: string | null;
      status: string;
      order_date: string;
      customer_id: string;
      customer_name: string;
      customer_email: string | null;
      customer_phone: string | null;
      bill_address: string | null;
      ship_address: string | null;
      warehouse_name: string | null;
      customer_po: string | null;
      notes: string | null;
      currency_code: string;
      subtotal: string;
      tax_total: string;
      total: string;
    }>(
      `select o.id, o.order_no, o.status::text, o.order_date::text, o.customer_id,
              c.legal_name as customer_name, c.email as customer_email, c.phone as customer_phone,
              app.format_address(c.billing_address_id) as bill_address,
              app.format_address(c.shipping_address_id) as ship_address,
              w.name as warehouse_name, o.customer_po, o.notes, o.currency_code,
              o.subtotal::text, o.tax_total::text, o.total::text
         from sales.sales_orders o
         join app.customers c on c.id = o.customer_id
         left join inv.warehouses w on w.id = o.warehouse_id
        where o.entity_id = $1 and o.id = $2`,
      [context.entityId, salesOrderId],
    );
    if (!order) return null;
    const lines = await tx.query<{
      description: string;
      quantity: string;
      unit_price: string;
      tax_amount: string;
      line_net: string;
      sku: string | null;
      tax_label: string;
    }>(
      `select l.description, l.quantity::text, l.unit_price::text, l.tax_amount::text,
              l.line_net::text, i.part_number as sku,
              case
                when t.id is null then 'No tax'
                when t.rate = 0 then t.code
                else t.code || ' ' || round(t.rate * 100, 2)::text || '%'
              end as tax_label
         from sales.sales_order_lines l
         left join inv.items i on i.id = l.item_id
         left join app.tax_codes t on t.id = l.tax_code_id
        where l.sales_order_id = $1
        order by l.line_no`,
      [salesOrderId],
    );
    return { order, lines };
  });
}

export async function getCreditNote(context: RequestContext, creditNoteId: string) {
  return withReadOnlyTransaction(context, async (tx) => {
    const note = await tx.maybeOne<{
      id: string;
      credit_no: string | null;
      status: string;
      credit_date: string;
      customer_name: string;
      customer_email: string | null;
      bill_address: string | null;
      invoice_no: string | null;
      notes: string | null;
      currency_code: string;
      warehouse_name: string | null;
      subtotal: string;
      tax_total: string;
      total: string;
    }>(
      `select cn.id, cn.credit_no, cn.status::text, cn.credit_date::text,
              c.legal_name as customer_name, c.email as customer_email,
              app.format_address(c.billing_address_id) as bill_address,
              i.invoice_no, cn.notes, cn.currency_code, w.name as warehouse_name,
              cn.subtotal::text, cn.tax_total::text, cn.total::text
         from sales.credit_notes cn
         join app.customers c on c.id = cn.customer_id
         left join sales.invoices i on i.id = cn.invoice_id
         left join inv.warehouses w on w.id = cn.warehouse_id
        where cn.entity_id = $1 and cn.id = $2`,
      [context.entityId, creditNoteId],
    );
    if (!note) return null;
    const lines = await tx.query<{
      description: string;
      quantity: string;
      unit_price: string;
      tax_amount: string;
      line_net: string;
      sku: string | null;
      tax_label: string;
    }>(
      `select l.description, l.quantity::text, l.unit_price::text, l.tax_amount::text,
              l.line_net::text, i.part_number as sku,
              case
                when t.id is null then 'No tax'
                when t.rate = 0 then t.code
                else t.code || ' ' || round(t.rate * 100, 2)::text || '%'
              end as tax_label
         from sales.credit_note_lines l
         left join inv.items i on i.id = l.item_id
         left join app.tax_codes t on t.id = l.tax_code_id
        where l.credit_note_id = $1
        order by l.line_no`,
      [creditNoteId],
    );
    return { note, lines };
  });
}

export async function getDebitNote(context: RequestContext, debitNoteId: string) {
  return withReadOnlyTransaction(context, async (tx) => {
    const note = await tx.maybeOne<{
      id: string;
      debit_no: string | null;
      status: string;
      debit_date: string;
      customer_name: string;
      customer_email: string | null;
      bill_address: string | null;
      notes: string | null;
      currency_code: string;
      subtotal: string;
      tax_total: string;
      total: string;
    }>(
      `select dn.id, dn.debit_no, dn.status::text, dn.debit_date::text,
              c.legal_name as customer_name, c.email as customer_email,
              app.format_address(c.billing_address_id) as bill_address,
              dn.notes, dn.currency_code, dn.subtotal::text, dn.tax_total::text, dn.total::text
         from sales.debit_notes dn
         join app.customers c on c.id = dn.customer_id
        where dn.entity_id = $1 and dn.id = $2`,
      [context.entityId, debitNoteId],
    );
    if (!note) return null;
    const lines = await tx.query<{
      description: string;
      quantity: string;
      unit_price: string;
      tax_amount: string;
      line_net: string;
      sku: string | null;
      tax_label: string;
    }>(
      `select l.description, l.quantity::text, l.unit_price::text, l.tax_amount::text,
              l.line_net::text, i.part_number as sku,
              case
                when t.id is null then 'No tax'
                when t.rate = 0 then t.code
                else t.code || ' ' || round(t.rate * 100, 2)::text || '%'
              end as tax_label
         from sales.debit_note_lines l
         left join inv.items i on i.id = l.item_id
         left join app.tax_codes t on t.id = l.tax_code_id
        where l.debit_note_id = $1
        order by l.line_no`,
      [debitNoteId],
    );
    return { note, lines };
  });
}

export async function getSalesReceipt(context: RequestContext, salesReceiptId: string) {
  return withReadOnlyTransaction(context, async (tx) => {
    const receipt = await tx.maybeOne<{
      id: string;
      receipt_no: string | null;
      status: string;
      receipt_date: string;
      customer_name: string;
      customer_email: string | null;
      bill_address: string | null;
      ship_to_name: string | null;
      ship_to_address: string | null;
      warehouse_name: string | null;
      customer_po: string | null;
      notes: string | null;
      currency_code: string;
      subtotal: string;
      tax_total: string;
      total: string;
    }>(
      `select r.id, r.receipt_no, r.status::text, r.receipt_date::text,
              c.legal_name as customer_name,
              nullif(btrim(coalesce(r.bill_email, c.email)), '') as customer_email,
              app.format_address(c.billing_address_id) as bill_address,
              r.ship_to_name, r.ship_to_address, w.name as warehouse_name,
              r.customer_po, r.notes, r.currency_code,
              r.subtotal::text, r.tax_total::text, r.total::text
         from sales.sales_receipts r
         join app.customers c on c.id = r.customer_id
         left join inv.warehouses w on w.id = r.warehouse_id
        where r.entity_id = $1 and r.id = $2`,
      [context.entityId, salesReceiptId],
    );
    if (!receipt) return null;
    const lines = await tx.query<{
      description: string;
      quantity: string;
      unit_price: string;
      tax_amount: string;
      line_net: string;
      sku: string | null;
      tax_label: string;
    }>(
      `select l.description, l.quantity::text, l.unit_price::text, l.tax_amount::text,
              l.line_net::text, i.part_number as sku,
              case
                when t.id is null then 'No tax'
                when t.rate = 0 then t.code
                else t.code || ' ' || round(t.rate * 100, 2)::text || '%'
              end as tax_label
         from sales.sales_receipt_lines l
         left join inv.items i on i.id = l.item_id
         left join app.tax_codes t on t.id = l.tax_code_id
        where l.sales_receipt_id = $1
        order by l.line_no`,
      [salesReceiptId],
    );
    return { receipt, lines };
  });
}

export async function getArReceipt(context: RequestContext, receiptId: string) {
  return withReadOnlyTransaction(context, async (tx) => {
    const receipt = await tx.maybeOne<{
      id: string;
      receipt_no: string | null;
      status: string;
      receipt_date: string;
      customer_name: string;
      customer_email: string | null;
      bill_address: string | null;
      memo: string | null;
      currency_code: string;
      amount: string;
    }>(
      `select r.id, r.receipt_no, r.status::text, r.receipt_date::text,
              c.legal_name as customer_name, c.email as customer_email,
              app.format_address(c.billing_address_id) as bill_address,
              r.memo, r.currency_code, r.amount::text
         from sales.receipts r
         join app.customers c on c.id = r.customer_id
        where r.entity_id = $1 and r.id = $2`,
      [context.entityId, receiptId],
    );
    if (!receipt) return null;
    const allocations = await tx.query<{
      invoice_no: string | null;
      invoice_date: string;
      amount: string;
    }>(
      `select i.invoice_no, i.invoice_date::text, a.amount::text
         from sales.receipt_allocations a
         join sales.invoices i on i.id = a.invoice_id
        where a.receipt_id = $1
        order by i.invoice_date, i.invoice_no`,
      [receiptId],
    );
    return { receipt, allocations };
  });
}

export async function getRefund(context: RequestContext, refundId: string) {
  return withReadOnlyTransaction(context, async (tx) => {
    const refund = await tx.maybeOne<{
      id: string;
      refund_no: string | null;
      status: string;
      refund_date: string;
      customer_name: string;
      customer_email: string | null;
      bill_address: string | null;
      memo: string | null;
      currency_code: string;
      amount: string;
    }>(
      `select r.id, r.refund_no, r.status::text, r.refund_date::text,
              c.legal_name as customer_name, c.email as customer_email,
              app.format_address(c.billing_address_id) as bill_address,
              r.memo, r.currency_code, r.amount::text
         from sales.refunds r
         join app.customers c on c.id = r.customer_id
        where r.entity_id = $1 and r.id = $2`,
      [context.entityId, refundId],
    );
    if (!refund) return null;
    const allocations = await tx.query<{
      invoice_no: string | null;
      invoice_date: string;
      amount: string;
    }>(
      `select i.invoice_no, i.invoice_date::text, a.amount::text
         from sales.refund_allocations a
         join sales.invoices i on i.id = a.invoice_id
        where a.refund_id = $1
        order by i.invoice_date, i.invoice_no`,
      [refundId],
    );
    return { refund, allocations };
  });
}
