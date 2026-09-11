import {
  withReadOnlyTransaction,
  withTransaction,
  type RequestContext,
} from '@/server/db/transaction';
import type {
  SaveBillInput,
  SaveCreditInput,
  SaveExpenseInput,
  SaveGoodsReceiptInput,
  SavePaymentInput,
  SavePoInput,
} from './schemas';

export async function savePo(context: RequestContext, input: SavePoInput) {
  return withTransaction(context, async (tx) => {
    const poId = await tx.scalar<string>(`select purch.save_po($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        po_id: input.poId ?? null,
        supplier_id: input.supplierId,
        order_date: input.orderDate,
        expected_date: input.expectedDate ?? null,
        currency_code: input.currencyCode ?? null,
        payment_terms_id: input.paymentTermsId ?? null,
        warehouse_id: input.warehouseId ?? null,
        notes: input.notes ?? null,
        lines: input.lines.map((line) => ({
          item_id: line.itemId ?? null,
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          tax_code_id: line.taxCodeId ?? null,
        })),
      }),
    ]);

    let poNo: string | null = null;
    if (input.approve) {
      poNo = await tx.scalar<string>(`select purch.approve_po($1)`, [poId]);
    }

    return { poId, poNo };
  });
}

export async function approvePo(context: RequestContext, poId: string) {
  return withTransaction(context, async (tx) => {
    const poNo = await tx.scalar<string>(`select purch.approve_po($1)`, [poId]);
    return { poNo };
  });
}

export async function cancelPo(context: RequestContext, poId: string, reason: string) {
  return withTransaction(context, async (tx) => {
    await tx.query(`select purch.cancel_po($1, $2)`, [poId, reason]);
  });
}

export async function saveGoodsReceipt(context: RequestContext, input: SaveGoodsReceiptInput) {
  return withTransaction(context, async (tx) => {
    const goodsReceiptId = await tx.scalar<string>(
      `select purch.save_goods_receipt($1, $2::jsonb)`,
      [
        context.entityId,
        JSON.stringify({
          goods_receipt_id: input.goodsReceiptId ?? null,
          supplier_id: input.supplierId ?? null,
          po_id: input.poId ?? null,
          receipt_date: input.receiptDate,
          warehouse_id: input.warehouseId,
          notes: input.notes ?? null,
          lines: input.lines.map((line) => ({
            po_line_id: line.poLineId ?? null,
            item_id: line.itemId,
            description: line.description,
            quantity: line.quantity,
            unit_cost: line.unitCost,
            bin_id: line.binId ?? null,
            stock_unit_id: line.stockUnitId ?? null,
            serial_number: line.serialNumber ?? null,
            condition_code: line.conditionCode ?? null,
          })),
        }),
      ],
    );

    let grnNo: string | null = null;
    if (input.post) {
      grnNo = await tx.scalar<string>(`select purch.post_goods_receipt($1, $2)`, [
        goodsReceiptId,
        input.idempotencyKey ?? null,
      ]);
    }

    return { goodsReceiptId, grnNo };
  });
}

export async function saveBill(context: RequestContext, input: SaveBillInput) {
  return withTransaction(context, async (tx) => {
    const billId = await tx.scalar<string>(`select purch.save_bill($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        bill_id: input.billId ?? null,
        supplier_id: input.supplierId,
        bill_date: input.billDate,
        due_date: input.dueDate ?? null,
        currency_code: input.currencyCode ?? null,
        payment_terms_id: input.paymentTermsId ?? null,
        supplier_ref: input.supplierRef ?? null,
        notes: input.notes ?? null,
        lines: input.lines.map((line) => ({
          item_id: line.itemId ?? null,
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          tax_code_id: line.taxCodeId ?? null,
          expense_account_id: line.expenseAccountId ?? null,
          goods_receipt_line_id: line.goodsReceiptLineId ?? null,
        })),
        receipt_matches: input.receiptMatches.map((m) => ({
          goods_receipt_id: m.goodsReceiptId,
          amount: m.amount ?? null,
        })),
      }),
    ]);

    let entryId: string | null = null;
    let billNo: string | null = null;
    if (input.post) {
      entryId = await tx.scalar<string>(`select purch.post_bill($1, $2)`, [
        billId,
        input.idempotencyKey ?? null,
      ]);
      const row = await tx.one<{ bill_no: string }>(
        `select bill_no from purch.bills where id = $1`,
        [billId],
      );
      billNo = row.bill_no;
    }

    return { billId, entryId, billNo };
  });
}

export async function savePayment(context: RequestContext, input: SavePaymentInput) {
  return withTransaction(context, async (tx) => {
    const paymentId = await tx.scalar<string>(`select purch.save_payment($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        payment_id: input.paymentId ?? null,
        supplier_id: input.supplierId,
        payment_date: input.paymentDate,
        amount: input.amount,
        bank_account_id: input.bankAccountId,
        currency_code: input.currencyCode ?? null,
        memo: input.memo ?? null,
        allocations: input.allocations.map((a) => ({
          bill_id: a.billId,
          amount: a.amount,
        })),
      }),
    ]);

    let entryId: string | null = null;
    let paymentNo: string | null = null;
    if (input.post) {
      entryId = await tx.scalar<string>(`select purch.post_payment($1, $2)`, [
        paymentId,
        input.idempotencyKey ?? null,
      ]);
      const row = await tx.one<{ payment_no: string }>(
        `select payment_no from purch.supplier_payments where id = $1`,
        [paymentId],
      );
      paymentNo = row.payment_no;
    }

    return { paymentId, entryId, paymentNo };
  });
}

export async function reversePayment(context: RequestContext, paymentId: string, reason: string) {
  return withTransaction(context, async (tx) => {
    const entryId = await tx.scalar<string>(`select purch.reverse_payment($1, $2)`, [
      paymentId,
      reason,
    ]);
    return { entryId };
  });
}

export async function saveCredit(context: RequestContext, input: SaveCreditInput) {
  return withTransaction(context, async (tx) => {
    const creditId = await tx.scalar<string>(`select purch.save_credit($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        credit_id: input.creditId ?? null,
        supplier_id: input.supplierId,
        credit_date: input.creditDate,
        currency_code: input.currencyCode ?? null,
        notes: input.notes ?? null,
        lines: input.lines.map((line) => ({
          item_id: line.itemId ?? null,
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          tax_code_id: line.taxCodeId ?? null,
          expense_account_id: line.expenseAccountId ?? null,
          stock_unit_id: line.stockUnitId ?? null,
          warehouse_id: line.warehouseId ?? null,
        })),
      }),
    ]);

    let entryId: string | null = null;
    let creditNo: string | null = null;
    if (input.post) {
      entryId = await tx.scalar<string>(`select purch.post_credit($1, $2)`, [
        creditId,
        input.idempotencyKey ?? null,
      ]);
      const row = await tx.one<{ credit_no: string }>(
        `select credit_no from purch.supplier_credits where id = $1`,
        [creditId],
      );
      creditNo = row.credit_no;
    }

    return { creditId, entryId, creditNo };
  });
}

export async function saveExpense(context: RequestContext, input: SaveExpenseInput) {
  return withTransaction(context, async (tx) => {
    const billId = await tx.scalar<string>(`select purch.save_bill($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        supplier_id: input.supplierId,
        bill_date: input.expenseDate,
        due_date: input.expenseDate,
        currency_code: input.currencyCode ?? null,
        notes: input.notes ?? null,
        lines: input.lines.map((line) => ({
          description: line.description,
          quantity: '1',
          unit_price: line.amount,
          tax_code_id: line.taxCodeId ?? null,
          expense_account_id: line.expenseAccountId ?? null,
        })),
        receipt_matches: [],
      }),
    ]);

    const entryId = await tx.scalar<string>(`select purch.post_bill($1, $2)`, [
      billId,
      input.idempotencyKey ?? null,
    ]);
    const bill = await tx.one<{ bill_no: string; outstanding: string; currency_code: string }>(
      `select b.bill_no, bal.outstanding::text, b.currency_code
         from purch.bills b
         join purch.v_bill_balances bal on bal.id = b.id
        where b.id = $1`,
      [billId],
    );

    const paymentId = await tx.scalar<string>(`select purch.save_payment($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        supplier_id: input.supplierId,
        payment_date: input.expenseDate,
        amount: bill.outstanding,
        bank_account_id: input.bankAccountId,
        currency_code: bill.currency_code,
        memo: input.notes ?? 'Expense',
        allocations: [{ bill_id: billId, amount: bill.outstanding }],
      }),
    ]);

    const paymentEntryId = await tx.scalar<string>(`select purch.post_payment($1, $2)`, [
      paymentId,
      input.paymentIdempotencyKey ?? null,
    ]);
    const payment = await tx.one<{ payment_no: string }>(
      `select payment_no from purch.supplier_payments where id = $1`,
      [paymentId],
    );

    return {
      billId,
      billNo: bill.bill_no,
      paymentId,
      paymentNo: payment.payment_no,
      entryId,
      paymentEntryId,
    };
  });
}

export async function listPurchaseOrders(
  context: RequestContext,
  input: {
    from: string | null;
    to: string | null;
    supplierId?: string;
    sort: 'date' | 'supplier' | 'no' | 'amount';
    dir: 'asc' | 'desc';
    limit: number;
    offset: number;
  },
) {
  return withReadOnlyTransaction(context, async (tx) => {
    const all = await tx.one<{ n: string }>(
      `select count(*)::text as n
         from purch.purchase_orders
        where entity_id = $1`,
      [context.entityId],
    );
    const counted = await tx.one<{ n: string }>(
      `select count(*)::text as n
         from purch.purchase_orders p
        where p.entity_id = $1
          and ($2::date is null or p.order_date >= $2)
          and ($3::date is null or p.order_date <= $3)
          and ($4::uuid is null or p.supplier_id = $4)`,
      [context.entityId, input.from, input.to, input.supplierId ?? null],
    );
    const rows = await tx.query<{
      id: string;
      po_no: string | null;
      status: string;
      order_date: string;
      expected_date: string | null;
      notes: string | null;
      supplier_id: string;
      supplier_name: string;
      supplier_email: string | null;
      currency_code: string;
      subtotal: string;
      tax_total: string;
      total: string;
      location: string | null;
      category: string | null;
      attachments: string;
    }>(
      `select p.id, p.po_no, p.status::text, p.order_date::text, p.expected_date::text,
              p.notes, p.supplier_id, s.legal_name as supplier_name, s.email as supplier_email,
              p.currency_code, p.subtotal::text, p.tax_total::text, p.total::text,
              w.name as location,
              coalesce(
                (
                  select a.name
                    from purch.purchase_order_lines l
                    join inv.items i on i.id = l.item_id
                    join gl.accounts a on a.id = i.cogs_account_id
                   where l.po_id = p.id
                   order by l.line_no
                   limit 1
                ),
                (
                  select c.name
                    from purch.purchase_order_lines l
                    join inv.items i on i.id = l.item_id
                    join inv.item_categories c on c.id = i.category_id
                   where l.po_id = p.id
                   order by l.line_no
                   limit 1
                ),
                (
                  select l.description
                    from purch.purchase_order_lines l
                   where l.po_id = p.id
                   order by l.line_no
                   limit 1
                )
              ) as category,
              (
                select count(*)::text
                  from app.attachment_links al
                 where al.record_schema = 'purch'
                   and al.record_table = 'purchase_orders'
                   and al.record_id = p.id
              ) as attachments
         from purch.purchase_orders p
         join app.suppliers s on s.id = p.supplier_id
         left join inv.warehouses w on w.id = p.warehouse_id
        where p.entity_id = $1
          and ($2::date is null or p.order_date >= $2)
          and ($3::date is null or p.order_date <= $3)
          and ($4::uuid is null or p.supplier_id = $4)
        order by
          case when $5 = 'supplier' and $6 = 'asc' then s.legal_name end asc nulls last,
          case when $5 = 'supplier' and $6 = 'desc' then s.legal_name end desc nulls last,
          case when $5 = 'no' and $6 = 'asc' then p.po_no end asc nulls last,
          case when $5 = 'no' and $6 = 'desc' then p.po_no end desc nulls last,
          case when $5 = 'amount' and $6 = 'asc' then p.total end asc nulls last,
          case when $5 = 'amount' and $6 = 'desc' then p.total end desc nulls last,
          case when $5 = 'date' and $6 = 'asc' then p.order_date end asc nulls last,
          case when $5 = 'date' and $6 = 'desc' then p.order_date end desc nulls last,
          p.created_at desc
        limit $7 offset $8`,
      [
        context.entityId,
        input.from,
        input.to,
        input.supplierId ?? null,
        input.sort,
        input.dir,
        input.limit,
        input.offset,
      ],
    );
    return { hasAny: all.n !== '0', total: Number(counted.n), rows };
  });
}

export async function getPurchaseOrder(context: RequestContext, poId: string) {
  return withReadOnlyTransaction(context, async (tx) => {
    const po = await tx.maybeOne<{
      id: string;
      po_no: string | null;
      status: string;
      supplier_id: string;
      supplier_name: string;
      supplier_email: string | null;
      mailing_address: string | null;
      order_date: string;
      expected_date: string | null;
      currency_code: string;
      warehouse_id: string | null;
      warehouse_name: string | null;
      payment_terms_id: string | null;
      notes: string | null;
      subtotal: string;
      tax_total: string;
      total: string;
    }>(
      `select p.id, p.po_no, p.status::text, p.supplier_id, s.legal_name as supplier_name,
              s.email as supplier_email, app.format_address(s.remit_to_address_id) as mailing_address,
              p.order_date::text, p.expected_date::text, p.currency_code, p.warehouse_id,
              w.name as warehouse_name, p.payment_terms_id, p.notes, p.subtotal::text,
              p.tax_total::text, p.total::text
         from purch.purchase_orders p
         join app.suppliers s on s.id = p.supplier_id
         left join inv.warehouses w on w.id = p.warehouse_id
        where p.entity_id = $1 and p.id = $2`,
      [context.entityId, poId],
    );
    if (!po) return null;

    const lines = await tx.query<{
      id: string;
      line_no: number;
      item_id: string | null;
      description: string;
      quantity: string;
      unit_price: string;
      tax_code_id: string | null;
      tax_amount: string;
      line_net: string;
      part_number: string | null;
      category_name: string | null;
      received_qty: string;
      tax_label: string;
    }>(
      `select l.id, l.line_no, l.item_id, l.description, l.quantity::text, l.unit_price::text,
              l.tax_code_id, l.tax_amount::text, l.line_net::text, i.part_number,
              c.name as category_name,
              coalesce((
                select sum(g.quantity)
                  from purch.goods_receipt_lines g
                  join purch.goods_receipts r on r.id = g.goods_receipt_id
                 where g.po_line_id = l.id
                   and r.status = 'POSTED'
              ), 0)::text as received_qty,
              case
                when t.id is null then 'No tax'
                when t.rate = 0 then t.code
                else t.code || ' ' || round(t.rate * 100, 2)::text || '%'
              end as tax_label
         from purch.purchase_order_lines l
         left join inv.items i on i.id = l.item_id
         left join inv.item_categories c on c.id = i.category_id
         left join app.tax_codes t on t.id = l.tax_code_id
        where l.po_id = $1
        order by l.line_no`,
      [poId],
    );

    return { po, lines };
  });
}

export async function listGoodsReceipts(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      grn_no: string | null;
      status: string;
      receipt_date: string;
      supplier_name: string;
      warehouse_name: string;
    }>(
      `select g.id, g.grn_no, g.status::text, g.receipt_date::text,
              s.legal_name as supplier_name, w.name as warehouse_name
         from purch.goods_receipts g
         join app.suppliers s on s.id = g.supplier_id
         join inv.warehouses w on w.id = g.warehouse_id
        where g.entity_id = $1
        order by g.receipt_date desc, g.created_at desc
        limit 200`,
      [context.entityId],
    ),
  );
}

export async function listBills(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      bill_no: string | null;
      status: string;
      bill_date: string;
      due_date: string;
      supplier_name: string;
      currency_code: string;
      total: string;
      outstanding: string;
    }>(
      `select b.id, b.bill_no, b.status::text, b.bill_date::text, b.due_date::text,
              s.legal_name as supplier_name, b.currency_code, b.total::text,
              coalesce(bal.outstanding, b.total)::text as outstanding
         from purch.bills b
         join app.suppliers s on s.id = b.supplier_id
         left join purch.v_bill_balances bal on bal.id = b.id
        where b.entity_id = $1
        order by b.bill_date desc, b.created_at desc
        limit 200`,
      [context.entityId],
    ),
  );
}

export async function listOpenBillsForSupplier(context: RequestContext, supplierId: string) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      bill_no: string;
      bill_date: string;
      due_date: string;
      total: string;
      outstanding: string;
      currency_code: string;
    }>(
      `select b.id, b.bill_no, b.bill_date::text, b.due_date::text,
              b.total::text, bal.outstanding::text, b.currency_code
         from purch.bills b
         join purch.v_bill_balances bal on bal.id = b.id
        where b.entity_id = $1
          and b.supplier_id = $2
          and b.status = 'POSTED'
          and bal.outstanding > 0
        order by b.bill_date, b.bill_no`,
      [context.entityId, supplierId],
    ),
  );
}

export async function listApprovedPosForSelect(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      po_no: string;
      supplier_id: string;
      supplier_name: string;
      warehouse_id: string | null;
      order_date: string;
      total: string;
      remaining: string;
      currency_code: string;
    }>(
      `select p.id,
              p.po_no,
              p.supplier_id,
              s.legal_name as supplier_name,
              p.warehouse_id,
              p.order_date::text,
              p.total::text,
              p.currency_code,
              coalesce((
                select sum(
                  greatest(
                    l.quantity - coalesce((
                      select sum(g.quantity)
                        from purch.goods_receipt_lines g
                        join purch.goods_receipts h on h.id = g.goods_receipt_id
                       where g.po_line_id = l.id
                         and h.status = 'POSTED'
                    ), 0),
                    0
                  ) * l.unit_price
                )
                  from purch.purchase_order_lines l
                 where l.po_id = p.id
                   and l.item_id is not null
              ), 0)::text as remaining
         from purch.purchase_orders p
         join app.suppliers s on s.id = p.supplier_id
        where p.entity_id = $1 and p.status = 'APPROVED'
        order by p.order_date desc
        limit 100`,
      [context.entityId],
    ),
  );
}

export async function listPoLines(context: RequestContext, poId: string) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      line_no: number;
      item_id: string | null;
      description: string;
      quantity: string;
      unit_price: string;
      tracking_mode: string | null;
      part_number: string | null;
      category_name: string | null;
      received_qty: string;
    }>(
      `select l.id,
              l.line_no,
              l.item_id,
              l.description,
              l.quantity::text,
              l.unit_price::text,
              i.tracking_mode::text,
              i.part_number,
              c.name as category_name,
              coalesce((
                select sum(g.quantity)
                  from purch.goods_receipt_lines g
                  join purch.goods_receipts h on h.id = g.goods_receipt_id
                 where g.po_line_id = l.id
                   and h.status = 'POSTED'
              ), 0)::text as received_qty
         from purch.purchase_order_lines l
         left join inv.items i on i.id = l.item_id
         left join inv.item_categories c on c.id = i.category_id
        where l.po_id = $1 and l.entity_id = $2
        order by l.line_no`,
      [poId, context.entityId],
    ),
  );
}

export async function listSuppliersForSelect(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      code: string;
      legal_name: string;
      currency_code: string;
      approval_status: string;
      email: string | null;
      mailing_address: string | null;
    }>(
      `select s.id, s.code, s.legal_name, s.currency_code, s.approval_status, s.email,
              nullif(concat_ws(', ',
                nullif(btrim(a.line1), ''),
                nullif(btrim(a.line2), ''),
                nullif(btrim(concat_ws(' ', nullif(btrim(a.city), ''), nullif(btrim(a.postal_code), ''))), ''),
                nullif(btrim(a.region), ''),
                case a.country_code
                  when 'KE' then 'Kenya'
                  else nullif(btrim(a.country_code), '')
                end
              ), '') as mailing_address
         from app.suppliers s
         left join app.addresses a on a.id = s.remit_to_address_id
        where s.entity_id = $1 and s.is_active
        order by s.legal_name`,
      [context.entityId],
    ),
  );
}

export async function listShipToCustomers(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      legal_name: string;
      shipping_address: string | null;
    }>(
      `select c.id, c.legal_name,
              nullif(concat_ws(', ',
                nullif(btrim(a.line1), ''),
                nullif(btrim(a.line2), ''),
                nullif(btrim(concat_ws(' ', nullif(btrim(a.city), ''), nullif(btrim(a.postal_code), ''))), ''),
                nullif(btrim(a.region), ''),
                case a.country_code
                  when 'KE' then 'Kenya'
                  else nullif(btrim(a.country_code), '')
                end
              ), '') as shipping_address
         from app.customers c
         left join app.addresses a on a.id = coalesce(c.shipping_address_id, c.billing_address_id)
        where c.entity_id = $1 and c.is_active
        order by c.legal_name`,
      [context.entityId],
    ),
  );
}

export async function listPurchasableItems(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      part_number: string;
      description: string;
      tracking_mode: string;
      is_stocked: boolean;
      purchase_cost: string | null;
      default_tax_code_id: string | null;
      category_name: string | null;
    }>(
      `select i.id, i.part_number, i.description, i.tracking_mode::text, i.is_stocked,
              i.purchase_cost::text, i.default_tax_code_id, c.name as category_name
         from inv.items i
         left join inv.item_categories c on c.id = i.category_id
        where i.entity_id = $1 and i.is_active and i.is_purchasable
        order by i.part_number
        limit 500`,
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

export async function listExpenseAccounts(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{ id: string; code: string; name: string }>(
      `select id, code, name
         from gl.accounts
        where entity_id = $1
          and is_active
          and is_postable
          and account_type = 'EXPENSE'
        order by code
        limit 300`,
      [context.entityId],
    ),
  );
}

export async function getGoodsReceipt(context: RequestContext, goodsReceiptId: string) {
  return withReadOnlyTransaction(context, async (tx) => {
    const receipt = await tx.maybeOne<{
      id: string;
      grn_no: string | null;
      status: string;
      receipt_date: string;
      supplier_name: string;
      supplier_email: string | null;
      mailing_address: string | null;
      warehouse_name: string | null;
      po_no: string | null;
      notes: string | null;
    }>(
      `select g.id, g.grn_no, g.status::text, g.receipt_date::text, s.legal_name as supplier_name,
              s.email as supplier_email, app.format_address(s.remit_to_address_id) as mailing_address,
              w.name as warehouse_name, p.po_no, g.notes
         from purch.goods_receipts g
         join app.suppliers s on s.id = g.supplier_id
         join inv.warehouses w on w.id = g.warehouse_id
         left join purch.purchase_orders p on p.id = g.po_id
        where g.entity_id = $1 and g.id = $2`,
      [context.entityId, goodsReceiptId],
    );
    if (!receipt) return null;
    const lines = await tx.query<{
      description: string;
      quantity: string;
      unit_cost: string;
      sku: string | null;
      extra: string | null;
    }>(
      `select l.description, l.quantity::text, l.unit_cost::text, i.part_number as sku,
              coalesce(b.code, w.name) as extra
         from purch.goods_receipt_lines l
         join purch.goods_receipts g on g.id = l.goods_receipt_id
         join inv.warehouses w on w.id = g.warehouse_id
         left join inv.items i on i.id = l.item_id
         left join inv.bins b on b.id = l.bin_id
        where l.goods_receipt_id = $1
        order by l.line_no`,
      [goodsReceiptId],
    );
    return { receipt, lines };
  });
}

export async function getBill(context: RequestContext, billId: string) {
  return withReadOnlyTransaction(context, async (tx) => {
    const bill = await tx.maybeOne<{
      id: string;
      bill_no: string | null;
      status: string;
      bill_date: string;
      due_date: string;
      supplier_name: string;
      supplier_email: string | null;
      mailing_address: string | null;
      supplier_ref: string | null;
      notes: string | null;
      currency_code: string;
      subtotal: string;
      tax_total: string;
      total: string;
      outstanding: string;
    }>(
      `select b.id, b.bill_no, b.status::text, b.bill_date::text, b.due_date::text,
              s.legal_name as supplier_name, s.email as supplier_email,
              app.format_address(s.remit_to_address_id) as mailing_address,
              b.supplier_ref, b.notes, b.currency_code, b.subtotal::text, b.tax_total::text,
              b.total::text, coalesce(bal.outstanding, b.total)::text as outstanding
         from purch.bills b
         join app.suppliers s on s.id = b.supplier_id
         left join purch.v_bill_balances bal on bal.id = b.id
        where b.entity_id = $1 and b.id = $2`,
      [context.entityId, billId],
    );
    if (!bill) return null;
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
         from purch.bill_lines l
         left join inv.items i on i.id = l.item_id
         left join app.tax_codes t on t.id = l.tax_code_id
        where l.bill_id = $1
        order by l.line_no`,
      [billId],
    );
    return { bill, lines };
  });
}

export async function getSupplierPayment(context: RequestContext, paymentId: string) {
  return withReadOnlyTransaction(context, async (tx) => {
    const payment = await tx.maybeOne<{
      id: string;
      payment_no: string | null;
      status: string;
      payment_date: string;
      supplier_name: string;
      supplier_email: string | null;
      mailing_address: string | null;
      memo: string | null;
      currency_code: string;
      amount: string;
    }>(
      `select p.id, p.payment_no, p.status::text, p.payment_date::text,
              s.legal_name as supplier_name, s.email as supplier_email,
              app.format_address(s.remit_to_address_id) as mailing_address,
              p.memo, p.currency_code, p.amount::text
         from purch.supplier_payments p
         join app.suppliers s on s.id = p.supplier_id
        where p.entity_id = $1 and p.id = $2`,
      [context.entityId, paymentId],
    );
    if (!payment) return null;
    const allocations = await tx.query<{
      bill_no: string | null;
      bill_date: string;
      amount: string;
    }>(
      `select b.bill_no, b.bill_date::text, a.amount::text
         from purch.supplier_payment_allocations a
         join purch.bills b on b.id = a.bill_id
        where a.payment_id = $1
        order by b.bill_date, b.bill_no`,
      [paymentId],
    );
    return { payment, allocations };
  });
}

export async function getSupplierCredit(context: RequestContext, creditId: string) {
  return withReadOnlyTransaction(context, async (tx) => {
    const credit = await tx.maybeOne<{
      id: string;
      credit_no: string | null;
      status: string;
      credit_date: string;
      supplier_name: string;
      supplier_email: string | null;
      mailing_address: string | null;
      notes: string | null;
      currency_code: string;
      subtotal: string;
      tax_total: string;
      total: string;
    }>(
      `select c.id, c.credit_no, c.status::text, c.credit_date::text,
              s.legal_name as supplier_name, s.email as supplier_email,
              app.format_address(s.remit_to_address_id) as mailing_address,
              c.notes, c.currency_code, c.subtotal::text, c.tax_total::text, c.total::text
         from purch.supplier_credits c
         join app.suppliers s on s.id = c.supplier_id
        where c.entity_id = $1 and c.id = $2`,
      [context.entityId, creditId],
    );
    if (!credit) return null;
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
         from purch.supplier_credit_lines l
         left join inv.items i on i.id = l.item_id
         left join app.tax_codes t on t.id = l.tax_code_id
        where l.credit_id = $1
        order by l.line_no`,
      [creditId],
    );
    return { credit, lines };
  });
}

export async function getSupplierStatement(
  context: RequestContext,
  supplierId: string,
  asOf?: string,
) {
  return withReadOnlyTransaction(context, async (tx) => {
    const supplier = await tx.maybeOne<{
      legal_name: string;
      email: string | null;
      phone: string | null;
      currency_code: string;
      address: string | null;
    }>(
      `select legal_name, email, phone, currency_code,
              app.format_address(remit_to_address_id) as address
         from app.suppliers
        where entity_id = $1 and id = $2`,
      [context.entityId, supplierId],
    );
    if (!supplier) return null;
    const raw = await tx.scalar<string>(
      `select purch.supplier_statement($1, $2, coalesce($3::date, current_date))::text`,
      [context.entityId, supplierId, asOf ?? null],
    );
    const parsed = JSON.parse(raw) as {
      supplier_id: string;
      as_of: string;
      open_bills: Array<{
        bill_id: string;
        bill_no: string;
        bill_date: string;
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
      supplier_name: supplier.legal_name,
      supplier_email: supplier.email,
      supplier_phone: supplier.phone,
      supplier_address: supplier.address,
      currency_code: supplier.currency_code,
    };
  });
}
