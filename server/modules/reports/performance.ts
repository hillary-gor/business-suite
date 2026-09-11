/**
 * Performance centre reads — monthly P&L, cash movement, ratios and ageing.
 *
 * Amounts stay strings. Classification of cost of sales matches the P&L report.
 */
import { withReadOnlyTransaction, type RequestContext } from '@/server/db/transaction';
import { Money } from '@/lib/money';
import { nairobiToday } from '@/lib/payables';
import { splitPnl } from '@/lib/report-books';
import {
  AGING_BUCKETS,
  monthsInRange,
  type AgingSlice,
  type CashMonthTotals,
  type PerformancePayload,
  type PnlMonthTotals,
  type RatioMonthTotals,
} from '@/lib/performance-centre';

export async function getPerformancePayload(
  context: RequestContext,
  asAt = nairobiToday(),
): Promise<PerformancePayload> {
  const year = Number(asAt.slice(0, 4));
  const from = `${year - 1}-01-01`;
  const [pnlRows, cashRows, ratioRows, arRows, apRows] = await Promise.all([
    monthlyPnl(context, from, asAt),
    monthlyCash(context, from, asAt),
    monthlyRatios(context, from, asAt),
    agingReceivables(context, asAt),
    agingPayables(context, asAt),
  ]);

  const pnlByMonth: Record<string, PnlMonthTotals> = {};
  for (const month of monthsInRange(from, asAt)) {
    pnlByMonth[month] = pnlRows.get(month) ?? emptyPnl();
  }
  const cashByMonth: Record<string, CashMonthTotals> = {};
  for (const month of monthsInRange(from, asAt)) {
    cashByMonth[month] = cashRows.get(month) ?? emptyCash();
  }
  const ratioByMonth: Record<string, RatioMonthTotals> = {};
  for (const month of monthsInRange(from, asAt)) {
    ratioByMonth[month] = ratioRows.get(month) ?? { current: null, quick: null };
  }

  return {
    asAt,
    pnlByMonth,
    cashByMonth,
    ratioByMonth,
    arAging: arRows,
    apAging: apRows,
  };
}

function emptyPnl(): PnlMonthTotals {
  return { revenue: '0', expenses: '0', cogs: '0', gross: '0', net: '0' };
}

function emptyCash(): CashMonthTotals {
  return { operating: '0', investing: '0', financing: '0', net: '0' };
}

async function monthlyPnl(context: RequestContext, from: string, to: string) {
  const rows = await withReadOnlyTransaction(context, (tx) =>
    tx.query<{ month: string; account_type: string; code: string; amount: string }>(
      `select to_char(date_trunc('month', l.entry_date), 'YYYY-MM') as month,
              a.account_type::text as account_type,
              a.code,
              case a.account_type
                when 'REVENUE' then sum(l.credit_base - l.debit_base)
                else sum(l.debit_base - l.credit_base)
              end::text as amount
         from gl.journal_entry_line l
         join gl.accounts a on a.id = l.account_id
        where l.entity_id = $1
          and l.entry_date between $2::date and $3::date
          and a.account_type in ('REVENUE', 'EXPENSE')
        group by to_char(date_trunc('month', l.entry_date), 'YYYY-MM'), a.account_type, a.code`,
      [context.entityId, from, to],
    ),
  );
  const byMonth = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byMonth.get(row.month) ?? [];
    list.push(row);
    byMonth.set(row.month, list);
  }
  const out = new Map<string, PnlMonthTotals>();
  for (const [month, items] of byMonth) {
    const split = splitPnl(items);
    out.set(month, {
      revenue: split.incomeTotal.toDecimal().toString(),
      expenses: split.expenseTotal.toDecimal().toString(),
      cogs: split.cosTotal.toDecimal().toString(),
      gross: split.gross.toDecimal().toString(),
      net: split.net.toDecimal().toString(),
    });
  }
  return out;
}

async function monthlyCash(context: RequestContext, from: string, to: string) {
  const rows = await withReadOnlyTransaction(context, (tx) =>
    tx.query<{ month: string; kind: string; amount: string }>(
      `select to_char(date_trunc('month', l.entry_date), 'YYYY-MM') as month,
              coalesce((
                select case
                         when oa.code like '15%' then 'investing'
                         when oa.code like '22%' or oa.account_type = 'EQUITY' then 'financing'
                         else 'operating'
                       end
                  from gl.journal_entry_line o
                  join gl.accounts oa on oa.id = o.account_id
                 where o.entry_id = l.entry_id
                   and oa.control_type is distinct from 'BANK'
                   and oa.control_type is distinct from 'CASH'
                 order by o.line_no
                 limit 1
              ), 'operating') as kind,
              sum(l.debit_base - l.credit_base)::text as amount
         from gl.journal_entry_line l
         join gl.accounts a on a.id = l.account_id
        where l.entity_id = $1
          and l.entry_date between $2::date and $3::date
          and a.control_type in ('BANK', 'CASH')
        group by 1, 2`,
      [context.entityId, from, to],
    ),
  );
  const out = new Map<string, CashMonthTotals>();
  for (const row of rows) {
    const current = out.get(row.month) ?? emptyCash();
    if (row.kind === 'investing') current.investing = row.amount;
    else if (row.kind === 'financing') current.financing = row.amount;
    else current.operating = row.amount;
    current.net = Money.from(current.operating)
      .plus(current.investing)
      .plus(current.financing)
      .toDecimal()
      .toString();
    out.set(row.month, current);
  }
  return out;
}

async function monthlyRatios(context: RequestContext, from: string, to: string) {
  const rows = await withReadOnlyTransaction(context, (tx) =>
    tx.query<{
      month: string;
      current_assets: string;
      inventory: string;
      current_liabilities: string;
    }>(
      `with monthly as (
         select date_trunc('month', l.entry_date)::date as month_start,
                coalesce(sum(case
                  when a.account_type = 'ASSET' and a.code < '1500'
                  then l.debit_base - l.credit_base else 0 end), 0) as current_assets,
                coalesce(sum(case
                  when a.account_type = 'ASSET' and a.code >= '1200' and a.code < '1300'
                  then l.debit_base - l.credit_base else 0 end), 0) as inventory,
                coalesce(sum(case
                  when a.account_type = 'LIABILITY' and a.code < '2200'
                  then l.credit_base - l.debit_base else 0 end), 0) as current_liabilities
           from gl.journal_entry_line l
           join gl.accounts a on a.id = l.account_id
          where l.entity_id = $1
            and l.entry_date <= $3::date
          group by 1
       ),
       running as (
         select month_start,
                sum(current_assets) over (order by month_start) as current_assets,
                sum(inventory) over (order by month_start) as inventory,
                sum(current_liabilities) over (order by month_start) as current_liabilities
           from monthly
       ),
       months as (
         select generate_series(
                  date_trunc('month', $2::date),
                  $3::date,
                  interval '1 month'
                )::date as month_start
       )
       select to_char(m.month_start, 'YYYY-MM') as month,
              coalesce(r.current_assets, 0)::text as current_assets,
              coalesce(r.inventory, 0)::text as inventory,
              coalesce(r.current_liabilities, 0)::text as current_liabilities
         from months m
         left join lateral (
           select current_assets, inventory, current_liabilities
             from running r
            where r.month_start <= m.month_start
            order by r.month_start desc
            limit 1
         ) r on true
        order by 1`,
      [context.entityId, from, to],
    ),
  );
  const out = new Map<string, RatioMonthTotals>();
  for (const row of rows) {
    out.set(row.month, {
      current: ratio(row.current_assets, row.current_liabilities),
      quick: ratio(
        Money.from(row.current_assets).minus(row.inventory).toDecimal().toString(),
        row.current_liabilities,
      ),
    });
  }
  return out;
}

function ratio(assets: string, liabilities: string): string | null {
  const denom = Money.from(liabilities);
  if (denom.isZero()) return null;
  return Money.from(assets).dividedBy(denom).round(2).toDecimal().toFixed(2);
}

async function agingReceivables(context: RequestContext, asAt: string): Promise<AgingSlice[]> {
  const rows = await withReadOnlyTransaction(context, (tx) =>
    tx.query<{ bucket: string; amount: string }>(
      `with open_invoices as (
         select i.due_date,
                (i.total - coalesce((
                  select sum(a.amount)
                    from sales.receipt_allocations a
                    join sales.receipts r on r.id = a.receipt_id
                   where a.invoice_id = i.id
                     and r.status = 'POSTED'
                     and r.receipt_date <= $2::date
                ), 0)) as outstanding
           from sales.invoices i
          where i.entity_id = $1
            and i.status = 'ISSUED'
            and i.invoice_date <= $2::date
       )
       select case
                when due_date >= $2::date then 'current'
                when ($2::date - due_date) between 1 and 7 then '1-7'
                when ($2::date - due_date) between 8 and 14 then '8-14'
                when ($2::date - due_date) between 15 and 21 then '15-21'
                when ($2::date - due_date) between 22 and 28 then '22-28'
                when ($2::date - due_date) between 29 and 60 then '29-60'
                when ($2::date - due_date) between 61 and 180 then '61-180'
                else '181+'
              end as bucket,
              sum(outstanding)::text as amount
         from open_invoices
        where outstanding > 0
        group by 1`,
      [context.entityId, asAt],
    ),
  );
  return assembleAging(rows);
}

async function agingPayables(context: RequestContext, asAt: string): Promise<AgingSlice[]> {
  const rows = await withReadOnlyTransaction(context, (tx) =>
    tx.query<{ bucket: string; amount: string }>(
      `with open_bills as (
         select b.due_date,
                (b.total - coalesce((
                  select sum(a.amount)
                    from purch.supplier_payment_allocations a
                    join purch.supplier_payments p on p.id = a.payment_id
                   where a.bill_id = b.id
                     and p.status = 'POSTED'
                     and p.payment_date <= $2::date
                ), 0)) as outstanding
           from purch.bills b
          where b.entity_id = $1
            and b.status = 'POSTED'
            and b.bill_date <= $2::date
       )
       select case
                when due_date >= $2::date then 'current'
                when ($2::date - due_date) between 1 and 7 then '1-7'
                when ($2::date - due_date) between 8 and 14 then '8-14'
                when ($2::date - due_date) between 15 and 21 then '15-21'
                when ($2::date - due_date) between 22 and 28 then '22-28'
                when ($2::date - due_date) between 29 and 60 then '29-60'
                when ($2::date - due_date) between 61 and 180 then '61-180'
                else '181+'
              end as bucket,
              sum(outstanding)::text as amount
         from open_bills
        where outstanding > 0
        group by 1`,
      [context.entityId, asAt],
    ),
  );
  return assembleAging(rows);
}

function assembleAging(rows: readonly { bucket: string; amount: string }[]): AgingSlice[] {
  const byBucket = new Map(rows.map((row) => [row.bucket, row.amount]));
  return AGING_BUCKETS.map((bucket) => ({
    bucket: bucket.id,
    label: bucket.label,
    amount: byBucket.get(bucket.id) ?? '0',
  }));
}
