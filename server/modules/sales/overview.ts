import { withReadOnlyTransaction, type RequestContext } from '@/server/db/transaction';

export async function getSalesOverview(
  context: RequestContext,
  input: {
    incomeFrom: string;
    incomeTo: string;
    unpaidFrom: string;
    unpaidTo: string;
    paidFrom: string;
    paidTo: string;
    today: string;
    compareFrom?: string;
    compareTo?: string;
  },
) {
  return withReadOnlyTransaction(context, async (tx) => {
    const unpaid = await tx.one<{ overdue: string; not_due: string }>(
      `select coalesce(sum(b.outstanding) filter (where i.due_date < $2::date), 0)::text as overdue,
              coalesce(sum(b.outstanding) filter (where i.due_date >= $2::date), 0)::text as not_due
         from sales.invoices i
         join sales.v_invoice_balances b on b.id = i.id
        where i.entity_id = $1
          and i.status = 'ISSUED'
          and b.outstanding > 0
          and i.invoice_date between $3::date and $4::date`,
      [context.entityId, input.today, input.unpaidFrom, input.unpaidTo],
    );

    const paid = await tx.one<{ amount: string }>(
      `select coalesce(sum(paid.amount), 0)::text as amount
         from (
           select r.amount
             from sales.receipts r
            where r.entity_id = $1
              and r.status = 'POSTED'
              and r.receipt_date between $2::date and $3::date
           union all
           select sr.total
             from sales.sales_receipts sr
            where sr.entity_id = $1
              and sr.status = 'POSTED'
              and sr.receipt_date between $2::date and $3::date
         ) paid`,
      [context.entityId, input.paidFrom, input.paidTo],
    );

    const income = await tx.query<{ day: string; amount: string }>(
      `with days as (
         select generate_series($2::date, $3::date, interval '1 day')::date as day
       ),
       posted as (
         select i.invoice_date as day, i.total as amount
           from sales.invoices i
          where i.entity_id = $1
            and i.status = 'ISSUED'
            and i.invoice_date between $2::date and $3::date
         union all
         select sr.receipt_date, sr.total
           from sales.sales_receipts sr
          where sr.entity_id = $1
            and sr.status = 'POSTED'
            and sr.receipt_date between $2::date and $3::date
         union all
         select cn.credit_date, -cn.total
           from sales.credit_notes cn
          where cn.entity_id = $1
            and cn.status = 'POSTED'
            and cn.credit_date between $2::date and $3::date
       )
       select d.day::text, coalesce(sum(p.amount), 0)::text as amount
         from days d
         left join posted p on p.day = d.day
        group by d.day
        order by d.day`,
      [context.entityId, input.incomeFrom, input.incomeTo],
    );

    const prior =
      input.compareFrom && input.compareTo
        ? await tx.query<{ day: string; amount: string }>(
            `with days as (
               select generate_series($2::date, $3::date, interval '1 day')::date as day
             ),
             posted as (
               select i.invoice_date as day, i.total as amount
                 from sales.invoices i
                where i.entity_id = $1
                  and i.status = 'ISSUED'
                  and i.invoice_date between $2::date and $3::date
               union all
               select sr.receipt_date, sr.total
                 from sales.sales_receipts sr
                where sr.entity_id = $1
                  and sr.status = 'POSTED'
                  and sr.receipt_date between $2::date and $3::date
               union all
               select cn.credit_date, -cn.total
                 from sales.credit_notes cn
                where cn.entity_id = $1
                  and cn.status = 'POSTED'
                  and cn.credit_date between $2::date and $3::date
             )
             select d.day::text, coalesce(sum(p.amount), 0)::text as amount
               from days d
               left join posted p on p.day = d.day
              group by d.day
              order by d.day`,
            [context.entityId, input.compareFrom, input.compareTo],
          )
        : [];

    return { unpaid, paid, income, prior };
  });
}

/** Same unpaid 365-day / paid 30-day buckets as the Sales overview, without the income series. */
export async function getInvoiceListSummary(
  context: RequestContext,
  input: {
    unpaidFrom: string;
    unpaidTo: string;
    paidFrom: string;
    paidTo: string;
    today: string;
  },
) {
  return withReadOnlyTransaction(context, async (tx) => {
    const unpaid = await tx.one<{ overdue: string; not_due: string }>(
      `select coalesce(sum(b.outstanding) filter (where i.due_date < $2::date), 0)::text as overdue,
              coalesce(sum(b.outstanding) filter (where i.due_date >= $2::date), 0)::text as not_due
         from sales.invoices i
         join sales.v_invoice_balances b on b.id = i.id
        where i.entity_id = $1
          and i.status = 'ISSUED'
          and b.outstanding > 0
          and i.invoice_date between $3::date and $4::date`,
      [context.entityId, input.today, input.unpaidFrom, input.unpaidTo],
    );

    const paid = await tx.one<{ amount: string }>(
      `select coalesce(sum(paid.amount), 0)::text as amount
         from (
           select r.amount
             from sales.receipts r
            where r.entity_id = $1
              and r.status = 'POSTED'
              and r.receipt_date between $2::date and $3::date
           union all
           select sr.total
             from sales.sales_receipts sr
            where sr.entity_id = $1
              and sr.status = 'POSTED'
              and sr.receipt_date between $2::date and $3::date
         ) paid`,
      [context.entityId, input.paidFrom, input.paidTo],
    );

    return { unpaid, paid };
  });
}
