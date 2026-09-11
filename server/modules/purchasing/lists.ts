import { withReadOnlyTransaction, type RequestContext } from '@/server/db/transaction';
import type { BillTab, ExpenseKind } from '@/lib/payables';

export async function listExpenseTransactions(
  context: RequestContext,
  input: {
    from: string | null;
    to: string | null;
    kind: ExpenseKind;
    baseCurrency: string;
    supplierId?: string;
  },
) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      kind: Exclude<ExpenseKind, 'all'>;
      doc_date: string;
      doc_no: string | null;
      payee: string;
      category: string | null;
      subtotal: string;
      tax_total: string;
      total: string;
      currency_code: string;
      href: string | null;
      approval: string | null;
    }>(
      `with expense_bills as (
         select b.id
           from purch.bills b
           join purch.v_bill_balances bal on bal.id = b.id
          where b.entity_id = $1
            and b.status = 'POSTED'
            and b.due_date = b.bill_date
            and bal.outstanding = 0
            and not exists (
              select 1
                from purch.bill_lines l
               where l.bill_id = b.id
                 and l.goods_receipt_line_id is not null
            )
       ),
       rows as (
         select p.id,
                'purchase_order'::text as kind,
                p.order_date as doc_date,
                p.po_no as doc_no,
                s.legal_name as payee,
                (
                  select l.description
                    from purch.purchase_order_lines l
                   where l.po_id = p.id
                   order by l.line_no
                   limit 1
                ) as category,
                p.subtotal::text,
                p.tax_total::text,
                p.total::text,
                p.currency_code,
                '/purchasing/orders/' || p.id as href,
                p.status::text as approval,
                p.supplier_id
           from purch.purchase_orders p
           join app.suppliers s on s.id = p.supplier_id
          where p.entity_id = $1
            and p.status <> 'CANCELLED'
         union all
         select g.id,
                'item_receipt',
                g.receipt_date,
                g.grn_no,
                s.legal_name,
                w.name,
                coalesce((
                  select sum(l.quantity * l.unit_cost)
                    from purch.goods_receipt_lines l
                   where l.goods_receipt_id = g.id
                ), 0)::text,
                '0',
                coalesce((
                  select sum(l.quantity * l.unit_cost)
                    from purch.goods_receipt_lines l
                   where l.goods_receipt_id = g.id
                ), 0)::text,
                $4,
                '/purchasing/receipts',
                g.status::text,
                g.supplier_id
           from purch.goods_receipts g
           join app.suppliers s on s.id = g.supplier_id
           join inv.warehouses w on w.id = g.warehouse_id
          where g.entity_id = $1
         union all
         select b.id,
                case when e.id is not null then 'expense' else 'bill' end,
                b.bill_date,
                b.bill_no,
                s.legal_name,
                coalesce((
                  select a.name
                    from purch.bill_lines l
                    left join gl.accounts a on a.id = l.expense_account_id
                   where l.bill_id = b.id
                   order by l.line_no
                   limit 1
                ), (
                  select l.description
                    from purch.bill_lines l
                   where l.bill_id = b.id
                   order by l.line_no
                   limit 1
                )),
                b.subtotal::text,
                b.tax_total::text,
                b.total::text,
                b.currency_code,
                '/purchasing/bills',
                b.status::text,
                b.supplier_id
           from purch.bills b
           join app.suppliers s on s.id = b.supplier_id
           left join expense_bills e on e.id = b.id
          where b.entity_id = $1
            and b.status <> 'VOIDED'
         union all
         select p.id,
                'payment',
                p.payment_date,
                p.payment_no,
                s.legal_name,
                p.memo,
                p.amount::text,
                '0',
                p.amount::text,
                p.currency_code,
                '/purchasing/payments/new',
                p.status::text,
                p.supplier_id
           from purch.supplier_payments p
           join app.suppliers s on s.id = p.supplier_id
          where p.entity_id = $1
            and p.status <> 'REVERSED'
            and not exists (
              select 1
                from purch.supplier_payment_allocations a
               where a.payment_id = p.id
                 and a.bill_id in (select id from expense_bills)
            )
         union all
         select c.id,
                'credit',
                c.credit_date,
                c.credit_no,
                s.legal_name,
                (
                  select l.description
                    from purch.supplier_credit_lines l
                   where l.credit_id = c.id
                   order by l.line_no
                   limit 1
                ),
                c.subtotal::text,
                c.tax_total::text,
                c.total::text,
                c.currency_code,
                '/purchasing/credits/new',
                c.status::text,
                c.supplier_id
           from purch.supplier_credits c
           join app.suppliers s on s.id = c.supplier_id
          where c.entity_id = $1
       )
       select id, kind, doc_date::text, doc_no, payee, category, subtotal, tax_total, total,
              currency_code, href, approval
         from rows
        where ($2::date is null or doc_date >= $2)
          and ($3::date is null or doc_date <= $3)
          and ($5 = 'all' or kind = $5)
          and ($6::uuid is null or supplier_id = $6)
        order by doc_date desc, doc_no desc nulls last
        limit 500`,
      [
        context.entityId,
        input.from,
        input.to,
        input.baseCurrency,
        input.kind,
        input.supplierId ?? null,
      ],
    ),
  );
}

export async function listBillsRegister(
  context: RequestContext,
  input: { tab: BillTab; from: string; to: string; supplierId?: string },
) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      bill_no: string | null;
      status: string;
      bill_date: string;
      due_date: string;
      supplier_id: string;
      supplier_name: string;
      currency_code: string;
      total: string;
      outstanding: string;
    }>(
      `select b.id, b.bill_no, b.status::text, b.bill_date::text, b.due_date::text,
              b.supplier_id, s.legal_name as supplier_name, b.currency_code, b.total::text,
              coalesce(bal.outstanding, b.total)::text as outstanding
         from purch.bills b
         join app.suppliers s on s.id = b.supplier_id
         left join purch.v_bill_balances bal on bal.id = b.id
        where b.entity_id = $1
          and b.bill_date between $2::date and $3::date
          and ($4::uuid is null or b.supplier_id = $4)
          and (
            ($5 = 'review' and b.status = 'DRAFT')
            or ($5 = 'unpaid' and b.status = 'POSTED' and coalesce(bal.outstanding, b.total) > 0)
            or ($5 = 'paid' and b.status = 'POSTED' and coalesce(bal.outstanding, 0) <= 0)
          )
        order by b.due_date asc nulls last, b.bill_date desc
        limit 500`,
      [context.entityId, input.from, input.to, input.supplierId ?? null, input.tab],
    ),
  );
}

export async function listSupplierDirectory(context: RequestContext, query?: string) {
  const needle = query?.trim() ? `%${query.trim()}%` : null;
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      legal_name: string;
      trading_name: string | null;
      phone: string | null;
      email: string | null;
      currency_code: string;
      open_balance: string;
    }>(
      `select s.id, s.legal_name, s.trading_name, s.phone, s.email, s.currency_code,
              coalesce((
                select sum(bal.outstanding)
                  from purch.bills b
                  join purch.v_bill_balances bal on bal.id = b.id
                 where b.supplier_id = s.id
                   and b.status = 'POSTED'
              ), 0)::text as open_balance
         from app.suppliers s
        where s.entity_id = $1
          and (
            $2::text is null
            or s.legal_name ilike $2
            or coalesce(s.trading_name, '') ilike $2
            or coalesce(s.email, '') ilike $2
            or coalesce(s.phone, '') ilike $2
            or s.code ilike $2
          )
        order by s.legal_name`,
      [context.entityId, needle],
    ),
  );
}

export async function listSupplierGlance(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) => {
    const unbilled = await tx.one<{ amount: string; count: string }>(
      `select coalesce(sum(p.total), 0)::text as amount, count(*)::text as count
         from purch.purchase_orders p
        where p.entity_id = $1
          and p.status = 'APPROVED'
          and p.order_date >= (current_date - 365)
          and not exists (
            select 1
              from purch.goods_receipts g
             where g.po_id = p.id
               and g.status = 'POSTED'
          )`,
      [context.entityId],
    );
    const overdue = await tx.one<{ amount: string; count: string }>(
      `select coalesce(sum(bal.outstanding), 0)::text as amount, count(*)::text as count
         from purch.bills b
         join purch.v_bill_balances bal on bal.id = b.id
        where b.entity_id = $1
          and b.status = 'POSTED'
          and bal.outstanding > 0
          and b.due_date < current_date
          and b.bill_date >= (current_date - 365)`,
      [context.entityId],
    );
    const open = await tx.one<{ amount: string; count: string }>(
      `select coalesce(sum(bal.outstanding), 0)::text as amount, count(*)::text as count
         from purch.bills b
         join purch.v_bill_balances bal on bal.id = b.id
        where b.entity_id = $1
          and b.status = 'POSTED'
          and bal.outstanding > 0
          and (b.due_date is null or b.due_date >= current_date)
          and b.bill_date >= (current_date - 365)`,
      [context.entityId],
    );
    const paid = await tx.one<{ amount: string; count: string }>(
      `select coalesce(sum(p.amount), 0)::text as amount, count(*)::text as count
         from purch.supplier_payments p
        where p.entity_id = $1
          and p.status = 'POSTED'
          and p.payment_date >= (current_date - 30)`,
      [context.entityId],
    );
    return { unbilled, overdue, open, paid };
  });
}

export async function getSupplier(context: RequestContext, supplierId: string) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.maybeOne<{
      id: string;
      code: string;
      legal_name: string;
      trading_name: string | null;
      tax_pin: string | null;
      currency_code: string;
      payment_terms_id: string | null;
      payment_terms_name: string | null;
      email: string | null;
      phone: string | null;
      notes: string | null;
      approval_status: string;
      is_active: boolean;
      billing_address: string | null;
      open_balance: string;
      overdue_balance: string;
    }>(
      `select s.id, s.code, s.legal_name, s.trading_name, s.tax_pin, s.currency_code,
              s.payment_terms_id, pt.name as payment_terms_name, s.email, s.phone, s.notes,
              s.approval_status, s.is_active,
              nullif(concat_ws(', ',
                nullif(btrim(a.line1), ''),
                nullif(btrim(a.line2), ''),
                nullif(btrim(concat_ws(' ', nullif(btrim(a.city), ''), nullif(btrim(a.postal_code), ''))), ''),
                nullif(btrim(a.region), ''),
                case a.country_code
                  when 'KE' then 'Kenya'
                  else nullif(btrim(a.country_code), '')
                end
              ), '') as billing_address,
              coalesce((
                select sum(bal.outstanding)
                  from purch.bills b
                  join purch.v_bill_balances bal on bal.id = b.id
                 where b.supplier_id = s.id
                   and b.status = 'POSTED'
              ), 0)::text as open_balance,
              coalesce((
                select sum(bal.outstanding)
                  from purch.bills b
                  join purch.v_bill_balances bal on bal.id = b.id
                 where b.supplier_id = s.id
                   and b.status = 'POSTED'
                   and bal.outstanding > 0
                   and b.due_date < current_date
              ), 0)::text as overdue_balance
         from app.suppliers s
         left join app.addresses a on a.id = s.remit_to_address_id
         left join app.payment_terms pt on pt.id = s.payment_terms_id
        where s.entity_id = $1
          and s.id = $2`,
      [context.entityId, supplierId],
    ),
  );
}
