import { Money } from '@/lib/money';
import { addDays, nairobiToday } from '@/lib/payables';
import { withReadOnlyTransaction, type RequestContext } from '@/server/db/transaction';

export async function listCustomerDirectory(context: RequestContext, query?: string) {
  const needle = query?.trim() ? `%${query.trim()}%` : null;
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      legal_name: string;
      trading_name: string | null;
      phone: string | null;
      mobile: string | null;
      email: string | null;
      address: string | null;
      attachments: string;
      currency_code: string;
      open_balance: string;
    }>(
      `select c.id, c.legal_name, c.trading_name, c.phone, ct.phone as mobile, c.email,
              c.currency_code,
              nullif(concat_ws(', ',
                nullif(btrim(a.line1), ''),
                nullif(btrim(a.line2), ''),
                nullif(btrim(a.city), ''),
                nullif(btrim(a.region), ''),
                nullif(btrim(a.postal_code), '')
              ), '') as address,
              (
                select count(*)::text
                  from app.attachment_links l
                 where l.record_schema = 'app'
                   and l.record_table = 'customers'
                   and l.record_id = c.id
              ) as attachments,
              coalesce((
                select sum(b.outstanding)
                  from sales.v_invoice_balances b
                  join sales.invoices i on i.id = b.id
                 where i.customer_id = c.id and i.status = 'ISSUED'
              ), 0)::text as open_balance
         from app.customers c
         left join app.addresses a on a.id = c.billing_address_id
         left join app.contacts ct on ct.id = c.primary_contact_id
        where c.entity_id = $1
          and (
            $2::text is null
            or c.legal_name ilike $2
            or coalesce(c.trading_name, '') ilike $2
            or coalesce(c.email, '') ilike $2
            or coalesce(c.phone, '') ilike $2
            or c.code ilike $2
          )
        order by c.legal_name`,
      [context.entityId, needle],
    ),
  );
}

export async function listCustomerGlance(context: RequestContext) {
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
    const unbilled = await tx.one<{ amount: string; count: string }>(
      `select coalesce(sum(o.total), 0)::text as amount, count(*)::text as count
         from sales.sales_orders o
        where o.entity_id = $1
          and o.status = 'CONFIRMED'
          and o.converted_invoice_id is null`,
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

    const openCount = String(Number(openInvoices.count) + Number(openCredits.count));
    return {
      estimates,
      unbilled,
      overdue,
      open: {
        amount: Money.from(openInvoices.amount).plus(openCredits.amount).toDatabase(),
        count: openCount,
      },
      paid,
    };
  });
}

export async function listCustomerHubOverview(
  context: RequestContext,
  input: { from: string; to: string; today: string },
) {
  return withReadOnlyTransaction(context, async (tx) => {
    const funnelEstimates = await tx.one<{ count: string }>(
      `select count(*)::text as count
         from sales.quotations q
        where q.entity_id = $1
          and q.status in ('DRAFT', 'SENT')
          and q.quotation_date between $2::date and $3::date`,
      [context.entityId, input.from, input.to],
    );
    const funnelUnpaid = await tx.one<{ count: string }>(
      `select count(*)::text as count
         from sales.invoices i
         join sales.v_invoice_balances b on b.id = i.id
        where i.entity_id = $1
          and i.status = 'ISSUED'
          and b.outstanding > 0
          and i.invoice_date between $2::date and $3::date`,
      [context.entityId, input.from, input.to],
    );
    const overdue = await tx.one<{ amount: string; count: string }>(
      `select coalesce(sum(b.outstanding), 0)::text as amount, count(*)::text as count
         from sales.invoices i
         join sales.v_invoice_balances b on b.id = i.id
        where i.entity_id = $1
          and i.status = 'ISSUED'
          and b.outstanding > 0
          and i.due_date < $2::date`,
      [context.entityId, input.today],
    );
    const openEstimates = await tx.one<{ amount: string; count: string }>(
      `select coalesce(sum(q.total), 0)::text as amount, count(*)::text as count
         from sales.quotations q
        where q.entity_id = $1
          and q.status in ('DRAFT', 'SENT')`,
      [context.entityId],
    );
    const openEstimateRows = await tx.query<{
      id: string;
      quotation_date: string;
      total: string;
      currency_code: string;
      customer_name: string;
    }>(
      `select q.id, q.quotation_date::text, q.total::text, q.currency_code,
              c.legal_name as customer_name
         from sales.quotations q
         join app.customers c on c.id = q.customer_id
        where q.entity_id = $1
          and q.status in ('DRAFT', 'SENT')
        order by q.quotation_date desc, q.created_at desc
        limit 8`,
      [context.entityId],
    );
    const funnelReviews = await tx.one<{ count: string }>(
      `select count(*)::text as count
         from sales.customer_reviews r
        where r.entity_id = $1
          and r.submitted_at::date between $2::date and $3::date`,
      [context.entityId, input.from, input.to],
    );

    return {
      funnel: {
        opportunities: '0',
        estimates: funnelEstimates.count,
        contracts: '0',
        projects: '0',
        unpaidInvoices: funnelUnpaid.count,
        reviews: funnelReviews.count,
      },
      overdue,
      openEstimates: {
        amount: openEstimates.amount,
        count: openEstimates.count,
        rows: openEstimateRows,
      },
    };
  });
}

export async function listCustomerReviews(context: RequestContext) {
  return withReadOnlyTransaction(context, (tx) =>
    tx.query<{
      id: string;
      rating: number;
      comment: string | null;
      submitted_on: string;
      customer_name: string;
      invoice_no: string | null;
    }>(
      `select r.id,
              r.rating,
              r.comment,
              r.submitted_at::date::text as submitted_on,
              c.legal_name as customer_name,
              i.invoice_no
         from sales.customer_reviews r
         join app.customers c on c.id = r.customer_id
         left join sales.invoices i on i.id = r.invoice_id
        where r.entity_id = $1
        order by r.submitted_at desc, r.created_at desc`,
      [context.entityId],
    ),
  );
}
