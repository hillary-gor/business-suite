import { Money } from '@/lib/money';
import { addDays, nairobiToday } from '@/lib/payables';
import type { SalesTxnStatusFilter, SalesTxnTypeFilter } from '@/lib/sales-transactions';
import { withReadOnlyTransaction, type RequestContext } from '@/server/db/transaction';

export type SalesTransactionRow = {
  id: string;
  kind: string;
  doc_date: string;
  doc_no: string | null;
  customer_id: string;
  customer_name: string;
  method: string | null;
  memo: string | null;
  due_date: string | null;
  balance: string;
  amount: string;
  currency_code: string;
  doc_status: string;
  email: string | null;
  converted_invoice_id: string | null;
};

const TX_SELECT = `
  select i.id,
         'invoice'::text as kind,
         i.invoice_date as doc_date,
         i.invoice_no as doc_no,
         i.customer_id,
         c.legal_name as customer_name,
         null::text as method,
         i.notes as memo,
         i.due_date::text as due_date,
         b.outstanding::text as balance,
         i.total::text as amount,
         i.currency_code,
         i.status::text as doc_status,
         i.bill_email as email,
         null::uuid as converted_invoice_id
    from sales.invoices i
    join app.customers c on c.id = i.customer_id
    join sales.v_invoice_balances b on b.id = i.id
   where i.entity_id = $1
  union all
  select q.id,
         'estimate',
         q.quotation_date,
         q.quotation_no,
         q.customer_id,
         c.legal_name,
         null,
         q.notes,
         q.valid_until::text,
         '0'::text,
         q.total::text,
         q.currency_code,
         q.status::text,
         null,
         q.converted_invoice_id
    from sales.quotations q
    join app.customers c on c.id = q.customer_id
   where q.entity_id = $1
  union all
  select r.id,
         'payment',
         r.receipt_date,
         r.receipt_no,
         r.customer_id,
         c.legal_name,
         null,
         r.memo,
         null,
         '0'::text,
         r.amount::text,
         r.currency_code,
         r.status::text,
         null,
         null
    from sales.receipts r
    join app.customers c on c.id = r.customer_id
   where r.entity_id = $1
  union all
  select sr.id,
         'sales_receipt',
         sr.receipt_date,
         sr.receipt_no,
         sr.customer_id,
         c.legal_name,
         null,
         sr.notes,
         null,
         '0'::text,
         sr.total::text,
         sr.currency_code,
         sr.status::text,
         sr.bill_email,
         null
    from sales.sales_receipts sr
    join app.customers c on c.id = sr.customer_id
   where sr.entity_id = $1
  union all
  select cn.id,
         'credit_note',
         cn.credit_date,
         cn.credit_no,
         cn.customer_id,
         c.legal_name,
         null,
         cn.notes,
         null,
         (cn.total - coalesce(a.allocated, 0))::text,
         cn.total::text,
         cn.currency_code,
         cn.status::text,
         null,
         null
    from sales.credit_notes cn
    join app.customers c on c.id = cn.customer_id
    left join (
      select credit_note_id, sum(amount) as allocated
        from sales.credit_note_allocations
       group by credit_note_id
    ) a on a.credit_note_id = cn.id
   where cn.entity_id = $1
  union all
  select rf.id,
         'refund',
         rf.refund_date,
         rf.refund_no,
         rf.customer_id,
         c.legal_name,
         null,
         rf.memo,
         null,
         '0'::text,
         rf.amount::text,
         rf.currency_code,
         rf.status::text,
         null,
         null
    from sales.refunds rf
    join app.customers c on c.id = rf.customer_id
   where rf.entity_id = $1
  union all
  select o.id,
         'sales_order',
         o.order_date,
         o.order_no,
         o.customer_id,
         c.legal_name,
         null,
         o.notes,
         null,
         '0'::text,
         o.total::text,
         o.currency_code,
         o.status::text,
         null,
         o.converted_invoice_id
    from sales.sales_orders o
    join app.customers c on c.id = o.customer_id
   where o.entity_id = $1
  union all
  select dn.id,
         'debit_note',
         dn.debit_date,
         dn.debit_no,
         dn.customer_id,
         c.legal_name,
         null,
         dn.notes,
         null,
         '0'::text,
         dn.total::text,
         dn.currency_code,
         dn.status::text,
         null,
         null
    from sales.debit_notes dn
    join app.customers c on c.id = dn.customer_id
   where dn.entity_id = $1
`;

const STATUS_PREDICATE = `
    (
      $6::text is null or $6 = 'all'
      or ($6 = 'draft' and doc_status = 'DRAFT')
      or ($6 = 'pending' and kind = 'estimate' and doc_status = 'SENT')
      or (
        $6 = 'overdue'
        and kind = 'invoice'
        and doc_status = 'ISSUED'
        and balance::numeric > 0
        and due_date::date < $7::date
      )
      or (
        $6 = 'paid'
        and (
          (kind = 'invoice' and doc_status = 'ISSUED' and balance::numeric = 0)
          or (kind in ('payment', 'sales_receipt', 'refund') and doc_status = 'POSTED')
        )
      )
      or (
        $6 = 'open'
        and (
          (kind = 'invoice' and doc_status = 'ISSUED' and balance::numeric > 0)
          or (kind = 'credit_note' and doc_status = 'POSTED' and balance::numeric > 0)
          or (kind = 'estimate' and doc_status in ('DRAFT', 'SENT'))
          or (kind = 'sales_order' and doc_status = 'CONFIRMED' and converted_invoice_id is null)
        )
      )
    )
  `;

export async function listSalesTransactions(
  context: RequestContext,
  input: {
    kind: SalesTxnTypeFilter;
    from: string | null;
    to: string | null;
    search: string | null;
    status: SalesTxnStatusFilter;
    today: string;
    limit: number;
    offset: number;
  },
) {
  const needle = input.search ? `%${input.search}%` : null;
  const kind = input.kind === 'all' ? null : input.kind;
  const status = input.status === 'all' ? 'all' : input.status;

  return withReadOnlyTransaction(context, async (tx) => {
    const summary = await tx.one<{ total: string; balance: string; amount: string }>(
      `with tx as (${TX_SELECT}),
            filtered as (
              select * from tx
               where ($2::text is null or kind = $2)
                 and ($3::date is null or doc_date >= $3)
                 and ($4::date is null or doc_date <= $4)
                 and (
                   $5::text is null
                   or customer_name ilike $5
                   or coalesce(doc_no, '') ilike $5
                   or coalesce(memo, '') ilike $5
                 )
                 and ${STATUS_PREDICATE}
            )
       select count(*)::text as total,
              coalesce(sum(balance::numeric), 0)::text as balance,
              coalesce(sum(amount::numeric), 0)::text as amount
         from filtered`,
      [context.entityId, kind, input.from, input.to, needle, status, input.today],
    );

    const total = Number(summary.total);
    const lastPage = Math.max(1, Math.ceil(total / Math.max(1, input.limit)));
    const requestedPage = Math.floor(input.offset / Math.max(1, input.limit)) + 1;
    const page = Math.min(Math.max(1, requestedPage), lastPage);
    const offset = (page - 1) * input.limit;

    const rows = await tx.query<SalesTransactionRow>(
      `with tx as (${TX_SELECT}),
            filtered as (
              select * from tx
               where ($2::text is null or kind = $2)
                 and ($3::date is null or doc_date >= $3)
                 and ($4::date is null or doc_date <= $4)
                 and (
                   $5::text is null
                   or customer_name ilike $5
                   or coalesce(doc_no, '') ilike $5
                   or coalesce(memo, '') ilike $5
                 )
                 and ${STATUS_PREDICATE}
            )
       select id, kind, doc_date::text as doc_date, doc_no, customer_id, customer_name,
              method, memo, due_date, balance, amount, currency_code, doc_status, email,
              converted_invoice_id::text as converted_invoice_id
         from filtered
        order by doc_date desc, id desc
        limit $8 offset $9`,
      [
        context.entityId,
        kind,
        input.from,
        input.to,
        needle,
        status,
        input.today,
        input.limit,
        offset,
      ],
    );

    return {
      rows,
      total,
      page,
      totals: { balance: summary.balance, amount: summary.amount },
    };
  });
}

export async function getSalesTransactionRibbon(context: RequestContext) {
  const today = nairobiToday();
  const paidFrom = addDays(today, -30);

  return withReadOnlyTransaction(context, async (tx) => {
    const estimates = await tx.one<{ amount: string; count: string }>(
      `select coalesce(sum(q.total), 0)::text as amount, count(*)::text as count
         from sales.quotations q
        where q.entity_id = $1
          and q.status in ('DRAFT', 'SENT')`,
      [context.entityId],
    );
    const overdue = await tx.one<{ amount: string; count: string }>(
      `select coalesce(sum(b.outstanding), 0)::text as amount, count(*)::text as count
         from sales.invoices i
         join sales.v_invoice_balances b on b.id = i.id
        where i.entity_id = $1
          and i.status = 'ISSUED'
          and b.outstanding > 0
          and i.due_date < $2::date`,
      [context.entityId, today],
    );
    const openInvoices = await tx.one<{ amount: string; count: string }>(
      `select coalesce(sum(b.outstanding), 0)::text as amount, count(*)::text as count
         from sales.invoices i
         join sales.v_invoice_balances b on b.id = i.id
        where i.entity_id = $1
          and i.status = 'ISSUED'
          and b.outstanding > 0
          and i.due_date >= $2::date`,
      [context.entityId, today],
    );
    const openCredits = await tx.one<{ amount: string; count: string }>(
      `select coalesce(sum(cn.total - coalesce(a.allocated, 0)), 0)::text as amount,
              count(*)::text as count
         from sales.credit_notes cn
         left join (
           select credit_note_id, sum(amount) as allocated
             from sales.credit_note_allocations
            group by credit_note_id
         ) a on a.credit_note_id = cn.id
        where cn.entity_id = $1
          and cn.status = 'POSTED'
          and cn.total - coalesce(a.allocated, 0) > 0`,
      [context.entityId],
    );
    const paid = await tx.one<{ amount: string; count: string }>(
      `select coalesce(sum(r.amount), 0)::text as amount, count(*)::text as count
         from sales.receipts r
        where r.entity_id = $1
          and r.status = 'POSTED'
          and r.receipt_date >= $2::date`,
      [context.entityId, paidFrom],
    );

    return {
      estimates,
      unbilled: { amount: '0', count: '0' },
      overdue,
      open: {
        amount: Money.from(openInvoices.amount).plus(openCredits.amount).toDatabase(),
        count: String(Number(openInvoices.count) + Number(openCredits.count)),
      },
      paid,
    };
  });
}
