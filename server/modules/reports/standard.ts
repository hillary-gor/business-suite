/**
 * Runs a Standard Report from posted books.
 *
 * Amounts stay strings. Date windows come from the report chrome, not from JS.
 */
import { withReadOnlyTransaction, type RequestContext } from '@/server/db/transaction';
import { addDays } from '@/lib/payables';
import { Money } from '@/lib/money';
import {
  NET_INCOME_ROW_ID,
  UNCLOSED_EARNINGS_FROM,
  equityRollforward,
  pnlNetIncome,
  sheetSectionTotals,
  splitPnl,
  withNetIncomeEquity,
  type LedgerReportRow,
} from '@/lib/report-books';
import {
  getAgedReceivables,
  getBalanceSheet,
  getProfitAndLoss,
} from '@/server/modules/reports/queries';
import { getStandardReport, type ReportDateMode } from '@/lib/standard-reports';
import {
  moneyColumn,
  qtyColumn,
  textColumn,
  type ReportColumn,
  type ReportModel,
  type ReportRow,
} from '@/lib/report-view';

export type ReportQuery = { from: string; to: string; basis: 'ACCRUAL' | 'CASH' };

function model(
  title: string,
  dateMode: ReportDateMode,
  columns: ReportColumn[],
  rows: ReportRow[],
  empty: string,
  unavailable?: string,
): ReportModel {
  return { title, dateMode, columns, rows, empty, unavailable };
}

function unavailable(title: string, help: string, dateMode: ReportDateMode): ReportModel {
  return model(title, dateMode, [textColumn('name', 'Name')], [], help, help);
}

function shiftYear(iso: string, years: number): string {
  const year = Number(iso.slice(0, 4)) + years;
  return `${String(year).padStart(4, '0')}${iso.slice(4)}`;
}

async function unclosedEarnings(context: RequestContext, asAt: string) {
  const rows = await getProfitAndLoss(context, UNCLOSED_EARNINGS_FROM, asAt);
  return pnlNetIncome(rows);
}

async function sheetWithEarnings(context: RequestContext, asAt: string): Promise<LedgerReportRow[]> {
  const [rows, earnings] = await Promise.all([
    getBalanceSheet(context, asAt),
    unclosedEarnings(context, asAt),
  ]);
  return withNetIncomeEquity(rows, earnings);
}

function amountRow(
  key: string,
  name: string,
  amount: string,
  extras: Partial<ReportRow> = {},
): ReportRow {
  return {
    key,
    values: { name, total: amount, amount },
    role: extras.role ?? 'line',
    ...extras,
  };
}

export async function runStandardReport(
  context: RequestContext,
  id: string,
  query: ReportQuery,
): Promise<ReportModel> {
  const report = getStandardReport(id);
  if (!report) {
    return unavailable('Report', 'This report was not found.', 'none');
  }
  if (report.unavailable) {
    return unavailable(report.title, report.help, report.dateMode);
  }

  switch (id) {
    case 'profit-and-loss':
    case 'profit-and-loss-detail':
      return runPnl(context, query, report.title, id === 'profit-and-loss-detail');
    case 'profit-and-loss-pct-income':
      return runPnl(context, query, report.title, false, 'percent');
    case 'profit-and-loss-comparison':
      return runPnlComparison(context, query, report.title, false);
    case 'profit-and-loss-ytd-comparison':
      return runPnlComparison(context, query, report.title, true);
    case 'profit-and-loss-by-month':
      return runPnlByMonth(context, query, report.title);
    case 'quarterly-profit-and-loss':
      return runPnlByQuarter(context, query, report.title);
    case 'profit-and-loss-by-customer':
      return runIncomeByCustomer(context, query, report.title, true);
    case 'balance-sheet':
    case 'balance-sheet-detail':
      return runBalanceSheet(context, query, report.title, id === 'balance-sheet-detail');
    case 'balance-sheet-summary':
      return runBalanceSheet(context, query, report.title, false, true);
    case 'balance-sheet-comparison':
      return runBalanceSheetComparison(context, query, report.title);
    case 'trial-balance':
    case 'adjusted-trial-balance':
      return runTrialBalance(context, query, report.title);
    case 'aged-receivables':
      return runAgedReceivables(context, query, report.title, false);
    case 'aged-receivables-summary':
      return runAgedReceivables(context, query, report.title, true);
    case 'collections-report':
      return runCollections(context, query, report.title);
    case 'business-snapshot':
      return runSnapshot(context, query, report.title);
    case 'statement-of-changes-in-equity':
      return runEquityChanges(context, query, report.title);
    case 'statement-of-cash-flows':
      return runCashFlow(context, query, report.title);
    default:
      return runTableReport(context, id, query, report.title, report.dateMode, report.help);
  }
}

async function runPnl(
  context: RequestContext,
  query: ReportQuery,
  title: string,
  detail: boolean,
  mode: 'plain' | 'percent' = 'plain',
): Promise<ReportModel> {
  const rows = await getProfitAndLoss(context, query.from, query.to);
  const details = detail ? await pnlDetailLines(context, query) : new Map<string, ReportRow[]>();
  const { income, cos, expenses, incomeTotal, cosTotal, expenseTotal, gross, net } = splitPnl(rows);
  const denom = incomeTotal.isZero() ? null : incomeTotal;

  function cell(amount: Money): string {
    if (mode === 'percent') {
      if (!denom) return '';
      return denom.isZero()
        ? ''
        : amount.dividedBy(denom).times(100).roundToCurrency(2).toDecimal().toFixed(1);
    }
    return amount.toDecimal().toString();
  }

  const out: ReportRow[] = [];
  function addSection(
    group: string,
    label: string,
    items: typeof income,
    totalLabel: string,
    total: Money,
  ) {
    out.push(amountRow(`h-${group}`, label, '', { role: 'group', group }));
    for (const item of items) {
      out.push(
        amountRow(item.account_id, item.name, cell(Money.from(item.amount)), {
          group,
          href: `/accounting/ledger/${item.account_id}?from=${query.from}&to=${query.to}`,
        }),
      );
      for (const line of details.get(item.account_id) ?? []) out.push(line);
    }
    out.push(amountRow(`t-${group}`, totalLabel, cell(total), { role: 'total', group }));
  }

  addSection('income', 'Income', income, 'Total for Income', incomeTotal);
  addSection('cos', 'Cost of Sales', cos, 'Total for Cost of Sales', cosTotal);
  out.push(amountRow('gross', 'Gross Profit', cell(gross), { role: 'grand' }));
  addSection('exp', 'Expenses', expenses, 'Total for Expenses', expenseTotal);
  out.push(amountRow('net', 'Net Earnings', cell(net), { role: 'grand' }));

  const columns =
    mode === 'percent'
      ? [
          textColumn('name', ''),
          {
            key: 'total',
            label: '% of income',
            align: 'right' as const,
            format: 'percent' as const,
          },
        ]
      : [textColumn('name', ''), moneyColumn('total', 'Total')];

  return model(title, 'range', columns, out, 'No income or expense movement in this period.');
}

async function pnlDetailLines(context: RequestContext, query: ReportQuery) {
  const rows = await withReadOnlyTransaction(context, (tx) =>
    tx.query<{
      account_id: string;
      id: string;
      entry_id: string;
      entry_date: string;
      entry_no: string;
      memo: string;
      amount: string;
    }>(
      `select l.account_id,
              l.id,
              e.id as entry_id,
              l.entry_date::text,
              e.entry_no,
              coalesce(nullif(btrim(l.memo), ''), e.description) as memo,
              case a.account_type
                when 'REVENUE' then (l.credit_base - l.debit_base)
                else (l.debit_base - l.credit_base)
              end::text as amount
         from gl.journal_entry_line l
         join gl.journal_entry e on e.id = l.entry_id
         join gl.accounts a on a.id = l.account_id
        where l.entity_id = $1
          and l.entry_date between $2::date and $3::date
          and a.account_type in ('REVENUE', 'EXPENSE')
        order by l.entry_date, e.entry_no, l.line_no`,
      [context.entityId, query.from, query.to],
    ),
  );
  const grouped = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.account_id) ?? [];
    list.push({
      key: row.id,
      values: { name: `${row.entry_date} · ${row.entry_no} · ${row.memo}`, total: row.amount },
      role: 'line',
      group: row.account_id,
      indent: 1,
      href: `/accounting/journals/${row.entry_id}`,
    });
    grouped.set(row.account_id, list);
  }
  return grouped;
}

async function runPnlComparison(
  context: RequestContext,
  query: ReportQuery,
  title: string,
  ytd: boolean,
): Promise<ReportModel> {
  const currentFrom = ytd ? `${query.to.slice(0, 4)}-01-01` : query.from;
  const currentTo = query.to;
  const priorFrom = shiftYear(currentFrom, -1);
  const priorTo = shiftYear(currentTo, -1);
  const [current, prior] = await Promise.all([
    getProfitAndLoss(context, currentFrom, currentTo),
    getProfitAndLoss(context, priorFrom, priorTo),
  ]);
  const priorMap = new Map(prior.map((row) => [row.account_id, row.amount]));
  const ids = new Map(current.concat(prior).map((row) => [row.account_id, row]));
  const lines: ReportRow[] = [];
  for (const row of ids.values()) {
    const now = Money.from(
      current.find((item) => item.account_id === row.account_id)?.amount ?? '0',
    );
    const then = Money.from(priorMap.get(row.account_id) ?? '0');
    lines.push({
      key: row.account_id,
      values: {
        name: row.name,
        total: now.toDecimal().toString(),
        prior: then.toDecimal().toString(),
        change: now.minus(then).toDecimal().toString(),
      },
      role: 'line',
    });
  }
  return model(
    title,
    'range',
    [
      textColumn('name', ''),
      moneyColumn('total', 'This period'),
      moneyColumn('prior', 'Last year'),
      moneyColumn('change', 'Change'),
    ],
    lines,
    'No income or expense movement to compare.',
  );
}

async function runPnlByMonth(
  context: RequestContext,
  query: ReportQuery,
  title: string,
): Promise<ReportModel> {
  const rows = await withReadOnlyTransaction(context, (tx) =>
    tx.query<{ month: string; account_type: string; code: string; name: string; amount: string }>(
      `select to_char(date_trunc('month', l.entry_date), 'YYYY-MM') as month,
              a.account_type::text,
              a.code,
              a.name,
              case a.account_type
                when 'REVENUE' then sum(l.credit_base - l.debit_base)
                else sum(l.debit_base - l.credit_base)
              end::text as amount
         from gl.journal_entry_line l
         join gl.accounts a on a.id = l.account_id
        where l.entity_id = $1
          and l.entry_date between $2::date and $3::date
          and a.account_type in ('REVENUE', 'EXPENSE')
        group by 1, 2, 3, 4
        order by 3, 1`,
      [context.entityId, query.from, query.to],
    ),
  );
  const months = [...new Set(rows.map((row) => row.month))].sort();
  const byName = new Map<string, { name: string; amounts: Record<string, Money> }>();
  for (const row of rows) {
    const current = byName.get(row.code) ?? { name: row.name, amounts: {} };
    current.amounts[row.month] = Money.from(row.amount);
    byName.set(row.code, current);
  }
  const columns: ReportColumn[] = [
    textColumn('name', ''),
    ...months.map((month) => moneyColumn(month, month)),
    moneyColumn('total', 'Total'),
  ];
  const lines: ReportRow[] = [...byName.entries()].map(([code, row]) => {
    const values: Record<string, string> = { name: row.name };
    let total = Money.from('0');
    for (const month of months) {
      const amount = row.amounts[month] ?? Money.from('0');
      values[month] = amount.toDecimal().toString();
      total = total.plus(amount);
    }
    values.total = total.toDecimal().toString();
    return { key: code, values, role: 'line' };
  });
  return model(title, 'range', columns, lines, 'No income or expense movement in this period.');
}

async function runPnlByQuarter(
  context: RequestContext,
  query: ReportQuery,
  title: string,
): Promise<ReportModel> {
  const year = query.to.slice(0, 4);
  const quarters = [
    { key: 'q1', label: 'Q1', from: `${year}-01-01`, to: `${year}-03-31` },
    { key: 'q2', label: 'Q2', from: `${year}-04-01`, to: `${year}-06-30` },
    { key: 'q3', label: 'Q3', from: `${year}-07-01`, to: `${year}-09-30` },
    { key: 'q4', label: 'Q4', from: `${year}-10-01`, to: `${year}-12-31` },
  ];
  const results = await Promise.all(
    quarters.map(async (quarter) => ({
      ...quarter,
      rows: await getProfitAndLoss(context, quarter.from, quarter.to),
    })),
  );
  const lines: ReportRow[] = [
    'Income',
    'Cost of Sales',
    'Gross Profit',
    'Expenses',
    'Net Earnings',
  ].map((name) => {
    const values: Record<string, string> = { name };
    let total = Money.from('0');
    for (const quarter of results) {
      const { incomeTotal, cosTotal, expenseTotal, gross, net } = splitPnl(quarter.rows);
      const amount =
        name === 'Income'
          ? incomeTotal
          : name === 'Cost of Sales'
            ? cosTotal
            : name === 'Gross Profit'
              ? gross
              : name === 'Expenses'
                ? expenseTotal
                : net;
      values[quarter.key] = amount.toDecimal().toString();
      total = total.plus(amount);
    }
    values.total = total.toDecimal().toString();
    return {
      key: name,
      values,
      role: name === 'Net Earnings' || name === 'Gross Profit' ? 'grand' : 'line',
    };
  });
  return model(
    title,
    'range',
    [
      textColumn('name', ''),
      ...quarters.map((quarter) => moneyColumn(quarter.key, quarter.label)),
      moneyColumn('total', 'Total'),
    ],
    lines,
    'No profit and loss movement in this year.',
  );
}

async function runBalanceSheet(
  context: RequestContext,
  query: ReportQuery,
  title: string,
  detail: boolean,
  summary = false,
): Promise<ReportModel> {
  const rows = await sheetWithEarnings(context, query.to);
  const details = detail ? await bsDetailLines(context, query) : new Map<string, ReportRow[]>();
  const groups = [
    { id: 'ASSET', label: 'Assets' },
    { id: 'LIABILITY', label: 'Liabilities' },
    { id: 'EQUITY', label: 'Equity' },
  ] as const;
  const out: ReportRow[] = [];
  for (const group of groups) {
    const items = rows.filter((row) => row.account_type === group.id);
    const total = Money.sum(items.map((row) => row.amount));
    out.push(amountRow(`h-${group.id}`, group.label, '', { role: 'group', group: group.id }));
    if (!summary) {
      for (const item of items) {
        out.push(
          amountRow(item.account_id, item.name, item.amount, {
            group: group.id,
            href:
              item.account_id === NET_INCOME_ROW_ID
                ? '/reports/profit-and-loss'
                : `/accounting/ledger/${item.account_id}?to=${query.to}`,
          }),
        );
        for (const line of details.get(item.account_id) ?? []) out.push(line);
      }
    }
    out.push(
      amountRow(`t-${group.id}`, `Total ${group.label}`, total.toDecimal().toString(), {
        role: 'total',
        group: group.id,
      }),
    );
  }
  const { assets, financing } = sheetSectionTotals(rows);
  out.push(amountRow('assets', 'Assets', assets.toDecimal().toString(), { role: 'grand' }));
  out.push(
    amountRow('financing', 'Liabilities and equity', financing.toDecimal().toString(), {
      role: 'grand',
    }),
  );
  return model(
    title,
    'asOf',
    [textColumn('name', ''), moneyColumn('total', 'Total')],
    out,
    'No balances as at this date.',
  );
}

async function bsDetailLines(context: RequestContext, query: ReportQuery) {
  const rows = await withReadOnlyTransaction(context, (tx) =>
    tx.query<{
      account_id: string;
      id: string;
      entry_date: string;
      entry_no: string;
      memo: string;
      amount: string;
    }>(
      `select l.account_id, l.id, l.entry_date::text, e.entry_no,
              coalesce(nullif(btrim(l.memo), ''), e.description) as memo,
              case a.account_type
                when 'ASSET' then (l.debit_base - l.credit_base)
                else (l.credit_base - l.debit_base)
              end::text as amount
         from gl.journal_entry_line l
         join gl.journal_entry e on e.id = l.entry_id
         join gl.accounts a on a.id = l.account_id
        where l.entity_id = $1
          and l.entry_date <= $2::date
          and a.account_type in ('ASSET', 'LIABILITY', 'EQUITY')
        order by l.entry_date, e.entry_no
        limit 2000`,
      [context.entityId, query.to],
    ),
  );
  const grouped = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.account_id) ?? [];
    list.push({
      key: row.id,
      values: { name: `${row.entry_date} · ${row.entry_no} · ${row.memo}`, total: row.amount },
      indent: 1,
    });
    grouped.set(row.account_id, list);
  }
  return grouped;
}

async function runBalanceSheetComparison(
  context: RequestContext,
  query: ReportQuery,
  title: string,
): Promise<ReportModel> {
  const prior = shiftYear(query.to, -1);
  const [current, last] = await Promise.all([
    sheetWithEarnings(context, query.to),
    sheetWithEarnings(context, prior),
  ]);
  const lastMap = new Map(last.map((row) => [row.account_id, row.amount]));
  const lines = current.map((row) => {
    const now = Money.from(row.amount);
    const then = Money.from(lastMap.get(row.account_id) ?? '0');
    return {
      key: row.account_id,
      values: {
        name: row.name,
        total: now.toDecimal().toString(),
        prior: then.toDecimal().toString(),
        change: now.minus(then).toDecimal().toString(),
      },
      role: 'line' as const,
    };
  });
  return model(
    title,
    'asOf',
    [
      textColumn('name', ''),
      moneyColumn('total', query.to),
      moneyColumn('prior', prior),
      moneyColumn('change', 'Change'),
    ],
    lines,
    'No balances as at this date.',
  );
}

async function runTrialBalance(
  context: RequestContext,
  query: ReportQuery,
  title: string,
): Promise<ReportModel> {
  const rows = await withReadOnlyTransaction(context, (tx) =>
    tx.query<{
      account_id: string;
      code: string;
      name: string;
      opening: string;
      debit: string;
      credit: string;
      closing: string;
    }>(
      `select a.id as account_id, a.code, a.name,
              coalesce(sum(case when l.entry_date < $2::date then l.debit_base - l.credit_base else 0 end), 0)::text as opening,
              coalesce(sum(case when l.entry_date between $2::date and $3::date then l.debit_base else 0 end), 0)::text as debit,
              coalesce(sum(case when l.entry_date between $2::date and $3::date then l.credit_base else 0 end), 0)::text as credit,
              coalesce(sum(case when l.entry_date <= $3::date then l.debit_base - l.credit_base else 0 end), 0)::text as closing
         from gl.accounts a
         left join gl.journal_entry_line l
           on l.account_id = a.id and l.entity_id = a.entity_id and l.entry_date <= $3::date
        where a.entity_id = $1 and a.is_postable
        group by a.id, a.code, a.name
       having coalesce(sum(l.debit_base), 0) <> 0 or coalesce(sum(l.credit_base), 0) <> 0
        order by a.code`,
      [context.entityId, query.from, query.to],
    ),
  );
  const lines: ReportRow[] = rows.map((row) => ({
    key: row.account_id,
    values: {
      name: `${row.code}  ${row.name}`,
      opening: row.opening,
      debit: row.debit,
      credit: row.credit,
      closing: row.closing,
    },
    href: `/accounting/ledger/${row.account_id}?from=${query.from}&to=${query.to}`,
    role: 'line',
  }));
  const debit = Money.sum(rows.map((row) => row.debit));
  const credit = Money.sum(rows.map((row) => row.credit));
  lines.push({
    key: 'totals',
    values: {
      name: 'Total',
      opening: '',
      debit: debit.toDecimal().toString(),
      credit: credit.toDecimal().toString(),
      closing: '',
    },
    role: 'grand',
  });
  return model(
    title,
    'range',
    [
      textColumn('name', 'Account'),
      moneyColumn('opening', 'Opening'),
      moneyColumn('debit', 'Debit'),
      moneyColumn('credit', 'Credit'),
      moneyColumn('closing', 'Closing'),
    ],
    lines,
    'No trial balance movement in this period.',
  );
}

async function runAgedReceivables(
  context: RequestContext,
  query: ReportQuery,
  title: string,
  summary: boolean,
): Promise<ReportModel> {
  const rows = await getAgedReceivables(context, query.to);
  const buckets = ['current', '1-30', '31-60', '61-90', '90+'] as const;
  if (summary) {
    const byCustomer = new Map<string, { name: string; amounts: Record<string, Money> }>();
    for (const row of rows) {
      const current = byCustomer.get(row.customer_id) ?? { name: row.customer_name, amounts: {} };
      current.amounts[row.bucket] = (current.amounts[row.bucket] ?? Money.from('0')).plus(
        row.outstanding,
      );
      byCustomer.set(row.customer_id, current);
    }
    const lines = [...byCustomer.entries()].map(([id, row]) => {
      const values: Record<string, string> = { name: row.name };
      let total = Money.from('0');
      for (const bucket of buckets) {
        const amount = row.amounts[bucket] ?? Money.from('0');
        values[bucket] = amount.toDecimal().toString();
        total = total.plus(amount);
      }
      values.total = total.toDecimal().toString();
      return { key: id, values, role: 'line' as const };
    });
    return model(
      title,
      'asOf',
      [
        textColumn('name', 'Customer'),
        ...buckets.map((bucket) => moneyColumn(bucket, bucket)),
        moneyColumn('total', 'Total'),
      ],
      lines,
      'No open receivables as at this date.',
    );
  }
  const lines = rows.map((row) => ({
    key: row.invoice_id,
    values: {
      customer: row.customer_name,
      invoice: row.invoice_no,
      date: row.invoice_date,
      due: row.due_date,
      bucket: row.bucket,
      total: row.total,
      outstanding: row.outstanding,
    },
    href: `/sales/invoices/${row.invoice_id}`,
    role: 'line' as const,
  }));
  return model(
    title,
    'asOf',
    [
      textColumn('customer', 'Customer'),
      textColumn('invoice', 'Invoice'),
      textColumn('date', 'Date'),
      textColumn('due', 'Due'),
      textColumn('bucket', 'Bucket'),
      moneyColumn('total', 'Total'),
      moneyColumn('outstanding', 'Outstanding'),
    ],
    lines,
    'No open receivables as at this date.',
  );
}

async function runCollections(
  context: RequestContext,
  query: ReportQuery,
  title: string,
): Promise<ReportModel> {
  const base = await runAgedReceivables(context, query, title, false);
  return {
    ...base,
    rows: base.rows.filter((row) => row.values.bucket && row.values.bucket !== 'current'),
  };
}

async function runSnapshot(
  context: RequestContext,
  query: ReportQuery,
  title: string,
): Promise<ReportModel> {
  const [pnl, sheet, ar] = await Promise.all([
    getProfitAndLoss(context, `${query.to.slice(0, 4)}-01-01`, query.to),
    getBalanceSheet(context, query.to),
    getAgedReceivables(context, query.to),
  ]);
  const income = Money.sum(
    pnl.filter((row) => row.account_type === 'REVENUE').map((row) => row.amount),
  );
  const expenses = Money.sum(
    pnl.filter((row) => row.account_type === 'EXPENSE').map((row) => row.amount),
  );
  const assets = Money.sum(
    sheet.filter((row) => row.account_type === 'ASSET').map((row) => row.amount),
  );
  const liabilities = Money.sum(
    sheet.filter((row) => row.account_type === 'LIABILITY').map((row) => row.amount),
  );
  const arTotal = Money.sum(ar.map((row) => row.outstanding));
  const lines = [
    amountRow('income', 'Income year to date', income.toDecimal().toString()),
    amountRow('expenses', 'Expenses year to date', expenses.toDecimal().toString()),
    amountRow('net', 'Net earnings year to date', income.minus(expenses).toDecimal().toString(), {
      role: 'grand',
    }),
    amountRow('assets', 'Assets', assets.toDecimal().toString()),
    amountRow('liabilities', 'Liabilities', liabilities.toDecimal().toString()),
    amountRow('ar', 'Open receivables', arTotal.toDecimal().toString()),
  ];
  return model(
    title,
    'asOf',
    [textColumn('name', ''), moneyColumn('total', 'Total')],
    lines,
    'No snapshot figures yet.',
  );
}

async function runEquityChanges(
  context: RequestContext,
  query: ReportQuery,
  title: string,
): Promise<ReportModel> {
  const openingAsAt = addDays(query.from, -1);
  const [opening, closing, pnl, openingEarnings, closingEarnings] = await Promise.all([
    getBalanceSheet(context, openingAsAt),
    getBalanceSheet(context, query.to),
    getProfitAndLoss(context, query.from, query.to),
    unclosedEarnings(context, openingAsAt),
    unclosedEarnings(context, query.to),
  ]);
  const openEq = Money.sum(
    opening.filter((row) => row.account_type === 'EQUITY').map((row) => row.amount),
  );
  const closeEq = Money.sum(
    closing.filter((row) => row.account_type === 'EQUITY').map((row) => row.amount),
  );
  const profit = pnlNetIncome(pnl);
  const rolled = equityRollforward({
    openingPostedEquity: openEq,
    closingPostedEquity: closeEq,
    openingEarnings,
    closingEarnings,
    periodProfit: profit,
  });
  const lines = [
    amountRow('open', 'Opening equity', rolled.opening.toDecimal().toString(), {
      alwaysShow: true,
    }),
    amountRow('profit', 'Profit for the period', profit.toDecimal().toString()),
  ];
  if (!rolled.otherMovements.isZero()) {
    lines.push(
      amountRow('other', 'Other equity movements', rolled.otherMovements.toDecimal().toString()),
    );
  }
  lines.push(
    amountRow('close', 'Closing equity', rolled.closing.toDecimal().toString(), { role: 'grand' }),
  );
  return model(
    title,
    'range',
    [textColumn('name', ''), moneyColumn('total', 'Total')],
    lines,
    'No equity balances.',
  );
}

async function runCashFlow(
  context: RequestContext,
  query: ReportQuery,
  title: string,
): Promise<ReportModel> {
  const rows = await withReadOnlyTransaction(context, (tx) =>
    tx.query<{ kind: string; amount: string }>(
      `select 'Customer receipts' as kind, coalesce(sum(amount), 0)::text as amount
         from sales.receipts
        where entity_id = $1 and status = 'POSTED' and receipt_date between $2::date and $3::date
        union all
       select 'Supplier payments', coalesce(sum(amount), 0)::text
         from purch.supplier_payments
        where entity_id = $1 and status = 'POSTED' and payment_date between $2::date and $3::date
        union all
       select 'Other bank movements', coalesce(sum(l.debit_base - l.credit_base), 0)::text
         from gl.journal_entry_line l
         join gl.accounts a on a.id = l.account_id
        where l.entity_id = $1
          and l.entry_date between $2::date and $3::date
          and a.control_type in ('BANK', 'CASH')
          and l.entry_id not in (
                select journal_entry_id from sales.receipts where entity_id = $1 and journal_entry_id is not null
                union
                select journal_entry_id from purch.supplier_payments where entity_id = $1 and journal_entry_id is not null
              )`,
      [context.entityId, query.from, query.to],
    ),
  );
  const lines = rows.map((row) => amountRow(row.kind, row.kind, row.amount));
  const net = Money.sum(
    rows.map((row) =>
      row.kind === 'Supplier payments' ? Money.from(row.amount).times(-1) : row.amount,
    ),
  );
  lines.push(amountRow('net', 'Net cash movement', net.toDecimal().toString(), { role: 'grand' }));
  return model(
    title,
    'range',
    [textColumn('name', ''), moneyColumn('total', 'Total')],
    lines,
    'No cash movements in this period.',
  );
}

async function runIncomeByCustomer(
  context: RequestContext,
  query: ReportQuery,
  title: string,
  withCost: boolean,
): Promise<ReportModel> {
  const rows = await withReadOnlyTransaction(context, (tx) =>
    tx.query<{ customer_id: string; customer_name: string; amount: string; cos: string }>(
      `with lines as (
         select i.customer_id,
                i.subtotal as amount,
                coalesce((
                  select sum(-sl.value_base)
                    from inv.stock_ledger sl
                   where sl.source_type = 'SALES_INVOICE'
                     and sl.source_id = i.id
                ), 0) as cos
           from sales.invoices i
          where i.entity_id = $1
            and i.status = 'ISSUED'
            and i.invoice_date between $2::date and $3::date
         union all
         select r.customer_id,
                r.subtotal,
                coalesce((
                  select sum(-sl.value_base)
                    from inv.stock_ledger sl
                   where sl.source_type = 'SALES_RECEIPT'
                     and sl.source_id = r.id
                ), 0)
           from sales.sales_receipts r
          where r.entity_id = $1
            and r.status = 'POSTED'
            and r.receipt_date between $2::date and $3::date
         union all
         select n.customer_id,
                -n.subtotal,
                coalesce((
                  select sum(-sl.value_base)
                    from inv.stock_ledger sl
                   where sl.source_type = 'SALES_CREDIT_NOTE'
                     and sl.source_id = n.id
                ), 0)
           from sales.credit_notes n
          where n.entity_id = $1
            and n.status = 'POSTED'
            and n.credit_date between $2::date and $3::date
       )
       select c.id as customer_id, c.legal_name as customer_name,
              coalesce(sum(l.amount), 0)::text as amount,
              coalesce(sum(l.cos), 0)::text as cos
         from lines l
         join app.customers c on c.id = l.customer_id
        group by c.id, c.legal_name
        order by c.legal_name`,
      [context.entityId, query.from, query.to],
    ),
  );
  const lines = rows.map((row) => {
    const amount = Money.from(row.amount);
    const cos = Money.from(row.cos);
    return {
      key: row.customer_id,
      values: {
        name: row.customer_name,
        amount: amount.toDecimal().toString(),
        cos: cos.toDecimal().toString(),
        margin: amount.minus(cos).toDecimal().toString(),
      },
      role: 'line' as const,
    };
  });
  const columns = withCost
    ? [
        textColumn('name', 'Customer'),
        moneyColumn('amount', 'Income'),
        moneyColumn('cos', 'Cost of sales'),
        moneyColumn('margin', 'Gross profit'),
      ]
    : [textColumn('name', 'Customer'), moneyColumn('amount', 'Amount')];
  return model(title, 'range', columns, lines, 'No customer sales in this period.');
}

/**
 * Postgres counts placeholders by the highest $n in the statement and rejects
 * extra binds. List reports that ignore the date window only name $1.
 */
function valuesForSql(text: string, values: readonly string[]): string[] {
  let highest = 0;
  for (const match of text.matchAll(/\$(\d+)\b/g)) {
    highest = Math.max(highest, Number(match[1]));
  }
  return values.slice(0, highest);
}

async function runTableReport(
  context: RequestContext,
  id: string,
  query: ReportQuery,
  title: string,
  dateMode: ReportDateMode,
  help: string,
): Promise<ReportModel> {
  return withReadOnlyTransaction(context, async (tx) => {
    const sql = TABLE_SQL[id];
    if (!sql) return unavailable(title, help, dateMode);
    const rows = await tx.query<Record<string, string | null>>(
      sql.text,
      valuesForSql(sql.text, [context.entityId, query.from, query.to]),
    );
    const lines: ReportRow[] = rows.map((row, index) => ({
      key: String(row.id ?? index),
      values: Object.fromEntries(
        sql.columns.map((column) => [column.key, row[column.key] ?? '']),
      ) as Record<string, string>,
      href: row.href ?? undefined,
      role: 'line',
    }));
    return model(title, dateMode, sql.columns, lines, sql.empty);
  });
}

type TableSql = {
  text: string;
  columns: ReportColumn[];
  empty: string;
};

const TABLE_SQL: Record<string, TableSql> = {
  'account-list': {
    empty: 'No accounts on the chart.',
    columns: [
      textColumn('code', 'Code'),
      textColumn('name', 'Account'),
      textColumn('account_type', 'Type'),
      textColumn('status', 'Status'),
    ],
    text: `select id, code, name, account_type::text,
                  case when is_postable then 'Postable' else 'Summary' end as status,
                  null::text as href
             from gl.accounts
            where entity_id = $1
            order by code`,
  },
  'audit-log': {
    empty: 'No audit rows yet.',
    columns: [
      textColumn('occurred_at', 'When'),
      textColumn('actor_name', 'Who'),
      textColumn('operation', 'Action'),
      textColumn('table_name', 'Table'),
    ],
    text: `select l.id::text as id, l.occurred_at::text as occurred_at,
                  coalesce(u.full_name, 'System') as actor_name,
                  l.operation, l.table_name, null::text as href
             from audit.log l
             left join app.users u on u.id = l.actor_user_id
            where l.entity_id = $1
            order by l.occurred_at desc
            limit 200`,
  },
  journal: {
    empty: 'No journal entries in this period.',
    columns: [
      textColumn('entry_date', 'Date'),
      textColumn('entry_no', 'Number'),
      textColumn('description', 'Memo'),
      textColumn('source_type', 'Source'),
      moneyColumn('total_base', 'Amount'),
    ],
    text: `select id, entry_date::text, entry_no, description, source_type::text,
                  total_debit_base::text as total_base,
                  '/accounting/journals/' || id as href
             from gl.journal_entry
            where entity_id = $1 and entry_date between $2::date and $3::date
            order by entry_date, entry_no`,
  },
  'recent-transactions': {
    empty: 'No journal entries yet.',
    columns: [
      textColumn('entry_date', 'Date'),
      textColumn('entry_no', 'Number'),
      textColumn('description', 'Memo'),
      textColumn('source_type', 'Source'),
      moneyColumn('total_base', 'Amount'),
    ],
    text: `select id, entry_date::text, entry_no, description, source_type::text,
                  total_debit_base::text as total_base,
                  '/accounting/journals/' || id as href
             from gl.journal_entry
            where entity_id = $1
            order by posted_at desc
            limit 100`,
  },
  'invalid-journals': {
    empty: 'No invalid journals. Every posted entry balances.',
    columns: [textColumn('entry_no', 'Number'), textColumn('description', 'Memo')],
    text: `select id, entry_no, description, null::text as href
             from gl.journal_entry
            where entity_id = $1
              and total_debit_base <> total_credit_base`,
  },
  'transaction-list-by-date': {
    empty: 'No transactions in this period.',
    columns: [
      textColumn('entry_date', 'Date'),
      textColumn('entry_no', 'Number'),
      textColumn('description', 'Memo'),
      textColumn('source_type', 'Source'),
      moneyColumn('total_base', 'Amount'),
    ],
    text: `select id, entry_date::text, entry_no, description, source_type::text,
                  total_debit_base::text as total_base,
                  '/accounting/journals/' || id as href
             from gl.journal_entry
            where entity_id = $1 and entry_date between $2::date and $3::date
            order by entry_date, entry_no`,
  },
  'transaction-list-with-splits': {
    empty: 'No transactions in this period.',
    columns: [
      textColumn('entry_date', 'Date'),
      textColumn('entry_no', 'Number'),
      textColumn('account', 'Account'),
      textColumn('memo', 'Memo'),
      moneyColumn('debit_base', 'Debit'),
      moneyColumn('credit_base', 'Credit'),
    ],
    text: `select l.id, e.entry_date::text, e.entry_no,
                  a.code || ' ' || a.name as account,
                  coalesce(nullif(btrim(l.memo), ''), e.description) as memo,
                  l.debit_base::text, l.credit_base::text,
                  '/accounting/journals/' || e.id as href
             from gl.journal_entry_line l
             join gl.journal_entry e on e.id = l.entry_id
             join gl.accounts a on a.id = l.account_id
            where l.entity_id = $1 and l.entry_date between $2::date and $3::date
            order by e.entry_date, e.entry_no, l.line_no`,
  },
  'transaction-detail-by-account': {
    empty: 'No postings in this period.',
    columns: [
      textColumn('account', 'Account'),
      textColumn('entry_date', 'Date'),
      textColumn('entry_no', 'Number'),
      textColumn('memo', 'Memo'),
      moneyColumn('debit_base', 'Debit'),
      moneyColumn('credit_base', 'Credit'),
    ],
    text: `select l.id, a.code || ' ' || a.name as account, e.entry_date::text, e.entry_no,
                  coalesce(nullif(btrim(l.memo), ''), e.description) as memo,
                  l.debit_base::text, l.credit_base::text,
                  '/accounting/ledger/' || a.id as href
             from gl.journal_entry_line l
             join gl.journal_entry e on e.id = l.entry_id
             join gl.accounts a on a.id = l.account_id
            where l.entity_id = $1 and l.entry_date between $2::date and $3::date
            order by a.code, e.entry_date, e.entry_no`,
  },
  'general-ledger': {
    empty: 'No general ledger movement in this period.',
    columns: [
      textColumn('account', 'Account'),
      textColumn('entry_date', 'Date'),
      textColumn('entry_no', 'Number'),
      textColumn('memo', 'Memo'),
      moneyColumn('debit_base', 'Debit'),
      moneyColumn('credit_base', 'Credit'),
    ],
    text: `select l.id, a.code || ' ' || a.name as account, e.entry_date::text, e.entry_no,
                  coalesce(nullif(btrim(l.memo), ''), e.description) as memo,
                  l.debit_base::text, l.credit_base::text,
                  '/accounting/ledger/' || a.id as href
             from gl.journal_entry_line l
             join gl.journal_entry e on e.id = l.entry_id
             join gl.accounts a on a.id = l.account_id
            where l.entity_id = $1 and l.entry_date between $2::date and $3::date
            order by a.code, e.entry_date, l.line_no`,
  },
  'general-ledger-list': {
    empty: 'No account balances.',
    columns: [
      textColumn('code', 'Code'),
      textColumn('name', 'Account'),
      moneyColumn('debit', 'Debit'),
      moneyColumn('credit', 'Credit'),
    ],
    text: `select a.id, a.code, a.name,
                  coalesce(sum(l.debit_base), 0)::text as debit,
                  coalesce(sum(l.credit_base), 0)::text as credit,
                  '/accounting/ledger/' || a.id as href
             from gl.accounts a
             left join gl.journal_entry_line l
               on l.account_id = a.id and l.entity_id = a.entity_id
              and l.entry_date between $2::date and $3::date
            where a.entity_id = $1 and a.is_postable
            group by a.id, a.code, a.name
            order by a.code`,
  },
  'customer-contact-list': {
    empty: 'No customers yet.',
    columns: [
      textColumn('legal_name', 'Customer'),
      textColumn('email', 'Email'),
      textColumn('phone', 'Phone'),
      textColumn('customer_type', 'Type'),
    ],
    text: `select id, legal_name, coalesce(email, '') as email, coalesce(phone, '') as phone,
                  customer_type, '/sales/customers/' || id as href
             from app.customers
            where entity_id = $1 and is_active
            order by legal_name`,
  },
  'customer-phone-list': {
    empty: 'No customers yet.',
    columns: [textColumn('legal_name', 'Customer'), textColumn('phone', 'Phone')],
    text: `select id, legal_name, coalesce(phone, '') as phone, '/sales/customers/' || id as href
             from app.customers
            where entity_id = $1 and is_active
            order by legal_name`,
  },
  'supplier-contact-list': {
    empty: 'No suppliers yet.',
    columns: [
      textColumn('legal_name', 'Supplier'),
      textColumn('email', 'Email'),
      textColumn('phone', 'Phone'),
    ],
    text: `select id, legal_name, coalesce(email, '') as email, coalesce(phone, '') as phone,
                  '/purchasing/vendors/' || id as href
             from app.suppliers
            where entity_id = $1 and is_active
            order by legal_name`,
  },
  'supplier-phone-list': {
    empty: 'No suppliers yet.',
    columns: [textColumn('legal_name', 'Supplier'), textColumn('phone', 'Phone')],
    text: `select id, legal_name, coalesce(phone, '') as phone, '/purchasing/vendors/' || id as href
             from app.suppliers
            where entity_id = $1 and is_active
            order by legal_name`,
  },
  'employee-contact-list': {
    empty: 'No employees yet.',
    columns: [
      textColumn('display_name', 'Name'),
      textColumn('job_title', 'Title'),
      textColumn('email', 'Email'),
      textColumn('phone', 'Phone'),
    ],
    text: `select id, display_name, coalesce(job_title, '') as job_title,
                  coalesce(email, '') as email, coalesce(phone, '') as phone,
                  '/team/employees/' || id as href
             from app.employees
            where entity_id = $1
            order by display_name`,
  },
  'terms-list': {
    empty: 'No payment terms yet.',
    columns: [
      textColumn('code', 'Code'),
      textColumn('name', 'Name'),
      textColumn('days_net', 'Days'),
    ],
    text: `select id, code, name, days_net::text, null::text as href
             from app.payment_terms
            where entity_id = $1 and is_active
            order by code`,
  },
  'invoice-list': {
    empty: 'No invoices in this period.',
    columns: [
      textColumn('invoice_date', 'Date'),
      textColumn('invoice_no', 'Number'),
      textColumn('customer_name', 'Customer'),
      textColumn('status', 'Status'),
      moneyColumn('total', 'Amount'),
    ],
    text: `select i.id, i.invoice_date::text, coalesce(i.invoice_no, 'Draft') as invoice_no,
                  c.legal_name as customer_name, i.status::text, i.total::text,
                  '/sales/invoices/' || i.id as href
             from sales.invoices i
             join app.customers c on c.id = i.customer_id
            where i.entity_id = $1 and i.invoice_date between $2::date and $3::date
            order by i.invoice_date, i.invoice_no`,
  },
  'open-invoices': {
    empty: 'No open invoices.',
    columns: [
      textColumn('invoice_date', 'Date'),
      textColumn('invoice_no', 'Number'),
      textColumn('customer_name', 'Customer'),
      moneyColumn('outstanding', 'Outstanding'),
    ],
    text: `select i.id, i.invoice_date::text, i.invoice_no, c.legal_name as customer_name,
                  bal.outstanding::text, '/sales/invoices/' || i.id as href
             from sales.invoices i
             join sales.v_invoice_balances bal on bal.id = i.id
             join app.customers c on c.id = i.customer_id
            where i.entity_id = $1 and i.status = 'ISSUED' and i.invoice_date <= $3::date
              and bal.outstanding > 0
            order by i.due_date, i.invoice_no`,
  },
  'customer-balance-summary': {
    empty: 'No customer balances.',
    columns: [
      textColumn('customer_name', 'Customer'),
      moneyColumn('invoiced', 'Invoiced'),
      moneyColumn('outstanding', 'Outstanding'),
    ],
    text: `select c.id, c.legal_name as customer_name,
                  coalesce(sum(i.total), 0)::text as invoiced,
                  coalesce(sum(bal.outstanding), 0)::text as outstanding,
                  '/sales/customers/' || c.id as href
             from app.customers c
             left join sales.invoices i on i.customer_id = c.id and i.status = 'ISSUED' and i.invoice_date <= $3::date
             left join sales.v_invoice_balances bal on bal.id = i.id
            where c.entity_id = $1
            group by c.id, c.legal_name
           having coalesce(sum(i.total), 0) <> 0 or coalesce(sum(bal.outstanding), 0) <> 0
            order by c.legal_name`,
  },
  'customer-balance-detail': {
    empty: 'No open customer invoices.',
    columns: [
      textColumn('customer_name', 'Customer'),
      textColumn('invoice_no', 'Invoice'),
      textColumn('due_date', 'Due'),
      moneyColumn('outstanding', 'Outstanding'),
    ],
    text: `select i.id, c.legal_name as customer_name, i.invoice_no, i.due_date::text,
                  bal.outstanding::text, '/sales/invoices/' || i.id as href
             from sales.invoices i
             join sales.v_invoice_balances bal on bal.id = i.id
             join app.customers c on c.id = i.customer_id
            where i.entity_id = $1 and i.status = 'ISSUED' and i.invoice_date <= $3::date
              and bal.outstanding > 0
            order by c.legal_name, i.due_date`,
  },
  'statement-list': {
    empty: 'No customers with a balance.',
    columns: [textColumn('customer_name', 'Customer'), moneyColumn('outstanding', 'Outstanding')],
    text: `select c.id, c.legal_name as customer_name,
                  coalesce(sum(bal.outstanding), 0)::text as outstanding,
                  '/sales/statements?customerId=' || c.id as href
             from app.customers c
             join sales.invoices i on i.customer_id = c.id and i.status = 'ISSUED'
             join sales.v_invoice_balances bal on bal.id = i.id
            where c.entity_id = $1
            group by c.id, c.legal_name
           having coalesce(sum(bal.outstanding), 0) > 0
            order by c.legal_name`,
  },
  'income-by-customer': {
    empty: 'No issued invoices in this period.',
    columns: [textColumn('customer_name', 'Customer'), moneyColumn('amount', 'Amount')],
    text: `select c.id, c.legal_name as customer_name, coalesce(sum(i.subtotal), 0)::text as amount,
                  '/sales/customers/' || c.id as href
             from sales.invoices i
             join app.customers c on c.id = i.customer_id
            where i.entity_id = $1 and i.status = 'ISSUED'
              and i.invoice_date between $2::date and $3::date
            group by c.id, c.legal_name
            order by c.legal_name`,
  },
  'sales-by-customer-summary': {
    empty: 'No sales in this period.',
    columns: [
      textColumn('customer_name', 'Customer'),
      qtyColumn('quantity', 'Qty'),
      moneyColumn('amount', 'Amount'),
    ],
    text: `select c.id, c.legal_name as customer_name,
                  coalesce(sum(l.quantity), 0)::text as quantity,
                  coalesce(sum(l.line_net), 0)::text as amount,
                  '/sales/customers/' || c.id as href
             from sales.invoices i
             join sales.invoice_lines l on l.invoice_id = i.id
             join app.customers c on c.id = i.customer_id
            where i.entity_id = $1 and i.status = 'ISSUED'
              and i.invoice_date between $2::date and $3::date
            group by c.id, c.legal_name
            order by c.legal_name`,
  },
  'sales-by-customer-detail': {
    empty: 'No sales in this period.',
    columns: [
      textColumn('customer_name', 'Customer'),
      textColumn('invoice_no', 'Invoice'),
      textColumn('description', 'Item'),
      qtyColumn('quantity', 'Qty'),
      moneyColumn('line_net', 'Amount'),
    ],
    text: `select l.id, c.legal_name as customer_name, i.invoice_no, l.description,
                  l.quantity::text, l.line_net::text,
                  '/sales/invoices/' || i.id as href
             from sales.invoices i
             join sales.invoice_lines l on l.invoice_id = i.id
             join app.customers c on c.id = i.customer_id
            where i.entity_id = $1 and i.status = 'ISSUED'
              and i.invoice_date between $2::date and $3::date
            order by c.legal_name, i.invoice_date, l.line_no`,
  },
  'sales-by-customer-type': {
    empty: 'No sales in this period.',
    columns: [textColumn('customer_type', 'Type'), moneyColumn('amount', 'Amount')],
    text: `select c.customer_type as id, c.customer_type, coalesce(sum(i.subtotal), 0)::text as amount,
                  null::text as href
             from sales.invoices i
             join app.customers c on c.id = i.customer_id
            where i.entity_id = $1 and i.status = 'ISSUED'
              and i.invoice_date between $2::date and $3::date
            group by c.customer_type
            order by c.customer_type`,
  },
  'sales-by-product-detail': {
    empty: 'No product sales in this period.',
    columns: [
      textColumn('product_name', 'Product'),
      textColumn('invoice_no', 'Invoice'),
      qtyColumn('quantity', 'Qty'),
      moneyColumn('line_net', 'Amount'),
    ],
    text: `select l.id, coalesce(i2.description, l.description) as product_name, i.invoice_no,
                  l.quantity::text, l.line_net::text,
                  '/sales/invoices/' || i.id as href
             from sales.invoices i
             join sales.invoice_lines l on l.invoice_id = i.id
             left join inv.items i2 on i2.id = l.item_id
            where i.entity_id = $1 and i.status = 'ISSUED'
              and i.invoice_date between $2::date and $3::date
            order by coalesce(i2.part_number, l.description), i.invoice_date`,
  },
  'item-profitability-by-customer': {
    empty: 'No product sales in this period.',
    columns: [
      textColumn('customer_name', 'Customer'),
      textColumn('product_name', 'Product'),
      moneyColumn('amount', 'Amount'),
      qtyColumn('quantity', 'Qty'),
    ],
    text: `select min(l.id::text) as id, c.legal_name as customer_name,
                  coalesce(it.description, l.description) as product_name,
                  sum(l.line_net)::text as amount, sum(l.quantity)::text as quantity,
                  null::text as href
             from sales.invoices i
             join sales.invoice_lines l on l.invoice_id = i.id
             join app.customers c on c.id = i.customer_id
             left join inv.items it on it.id = l.item_id
            where i.entity_id = $1 and i.status = 'ISSUED'
              and i.invoice_date between $2::date and $3::date
            group by c.legal_name, coalesce(it.description, l.description)
            order by c.legal_name, 3`,
  },
  'invoice-approval-status': {
    empty: 'No invoices.',
    columns: [
      textColumn('status', 'Status'),
      textColumn('count', 'Count'),
      moneyColumn('total', 'Amount'),
    ],
    text: `select status::text as id, status::text, count(*)::text as count,
                  coalesce(sum(total), 0)::text as total, null::text as href
             from sales.invoices
            where entity_id = $1
            group by status
            order by status`,
  },
  'bill-approval-status': {
    empty: 'No bills.',
    columns: [
      textColumn('status', 'Status'),
      textColumn('count', 'Count'),
      moneyColumn('total', 'Amount'),
    ],
    text: `select status::text as id, status::text, count(*)::text as count,
                  coalesce(sum(total), 0)::text as total, null::text as href
             from purch.bills
            where entity_id = $1
            group by status
            order by status`,
  },
  'product-service-list': {
    empty: 'No products yet.',
    columns: [
      textColumn('part_number', 'SKU'),
      textColumn('description', 'Product'),
      textColumn('kind', 'Type'),
      moneyColumn('sales_price', 'Price'),
    ],
    text: `select id, part_number, description,
                  case when is_stocked then 'Inventory' when is_purchasable then 'Non-inventory' else 'Service' end as kind,
                  coalesce(sales_price, 0)::text as sales_price,
                  '/inventory/items/' || id || '/edit' as href
             from inv.items
            where entity_id = $1
            order by part_number`,
  },
  'payment-method-list': {
    empty: 'No bank or cash accounts.',
    columns: [
      textColumn('code', 'Code'),
      textColumn('name', 'Account'),
      textColumn('control_type', 'Type'),
    ],
    text: `select id, code, name, control_type::text, '/accounting/ledger/' || id as href
             from gl.accounts
            where entity_id = $1 and control_type in ('BANK', 'CASH') and is_active
            order by code`,
  },
  'deposit-detail': {
    empty: 'No customer receipts in this period.',
    columns: [
      textColumn('receipt_date', 'Date'),
      textColumn('receipt_no', 'Number'),
      textColumn('customer_name', 'Customer'),
      moneyColumn('amount', 'Amount'),
    ],
    text: `select r.id, r.receipt_date::text, r.receipt_no, c.legal_name as customer_name, r.amount::text,
                  '/sales/receipts/' || r.id as href
             from sales.receipts r
             join app.customers c on c.id = r.customer_id
            where r.entity_id = $1 and r.status = 'POSTED'
              and r.receipt_date between $2::date and $3::date
            order by r.receipt_date, r.receipt_no`,
  },
  'cashflow-payment-transactions': {
    empty: 'No customer receipts in this period.',
    columns: [
      textColumn('receipt_date', 'Date'),
      textColumn('receipt_no', 'Number'),
      textColumn('customer_name', 'Customer'),
      moneyColumn('amount', 'Amount'),
    ],
    text: `select r.id, r.receipt_date::text, r.receipt_no, c.legal_name as customer_name, r.amount::text,
                  '/sales/receipts/' || r.id as href
             from sales.receipts r
             join app.customers c on c.id = r.customer_id
            where r.entity_id = $1 and r.status = 'POSTED'
              and r.receipt_date between $2::date and $3::date
            order by r.receipt_date`,
  },
  'invoices-and-payments': {
    empty: 'No invoices in this period.',
    columns: [
      textColumn('invoice_no', 'Invoice'),
      textColumn('customer_name', 'Customer'),
      moneyColumn('total', 'Invoiced'),
      moneyColumn('received', 'Received'),
    ],
    text: `select i.id, i.invoice_no, c.legal_name as customer_name, i.total::text,
                  (i.total - bal.outstanding)::text as received,
                  '/sales/invoices/' || i.id as href
             from sales.invoices i
             join sales.v_invoice_balances bal on bal.id = i.id
             join app.customers c on c.id = i.customer_id
            where i.entity_id = $1 and i.status = 'ISSUED'
              and i.invoice_date between $2::date and $3::date
            order by i.invoice_date`,
  },
  'estimates-by-customer': {
    empty: 'No estimates in this period.',
    columns: [
      textColumn('customer_name', 'Customer'),
      textColumn('quotation_no', 'Estimate'),
      textColumn('status', 'Status'),
      moneyColumn('total', 'Amount'),
    ],
    text: `select q.id, c.legal_name as customer_name, coalesce(q.quotation_no, 'Draft') as quotation_no,
                  q.status::text, q.total::text, '/sales/estimates/' || q.id as href
             from sales.quotations q
             join app.customers c on c.id = q.customer_id
            where q.entity_id = $1 and q.quotation_date between $2::date and $3::date
            order by c.legal_name, q.quotation_date`,
  },
  'unbilled-charges': {
    empty: 'No unbilled sales orders.',
    columns: [
      textColumn('order_date', 'Date'),
      textColumn('order_no', 'Order'),
      textColumn('customer_name', 'Customer'),
      moneyColumn('total', 'Amount'),
    ],
    text: `select o.id, o.order_date::text, o.order_no, c.legal_name as customer_name, o.total::text,
                  '/sales/orders/' || o.id as href
             from sales.sales_orders o
             join app.customers c on c.id = o.customer_id
            where o.entity_id = $1 and o.status = 'CONFIRMED' and o.converted_invoice_id is null
              and o.order_date <= $3::date
            order by o.order_date`,
  },
  'transaction-list-by-customer': {
    empty: 'No customer transactions in this period.',
    columns: [
      textColumn('doc_date', 'Date'),
      textColumn('kind', 'Type'),
      textColumn('customer_name', 'Customer'),
      textColumn('doc_no', 'Number'),
      moneyColumn('total', 'Amount'),
    ],
    text: `select i.id, i.invoice_date::text as doc_date, 'Invoice' as kind, c.legal_name as customer_name,
                  i.invoice_no as doc_no, i.total::text, '/sales/invoices/' || i.id as href
             from sales.invoices i
             join app.customers c on c.id = i.customer_id
            where i.entity_id = $1 and i.status = 'ISSUED' and i.invoice_date between $2::date and $3::date
            union all
           select r.id, r.receipt_date::text, 'Receipt', c.legal_name, r.receipt_no, r.amount::text,
                  '/sales/receipts/' || r.id
             from sales.receipts r
             join app.customers c on c.id = r.customer_id
            where r.entity_id = $1 and r.status = 'POSTED' and r.receipt_date between $2::date and $3::date
            order by 2, 3`,
  },
  'unpaid-bills': {
    empty: 'No unpaid bills.',
    columns: [
      textColumn('bill_date', 'Date'),
      textColumn('bill_no', 'Number'),
      textColumn('supplier_name', 'Supplier'),
      moneyColumn('outstanding', 'Outstanding'),
    ],
    text: `select b.id, b.bill_date::text, b.bill_no, s.legal_name as supplier_name, bal.outstanding::text,
                  '/purchasing/bills/' || b.id as href
             from purch.bills b
             join purch.v_bill_balances bal on bal.id = b.id
             join app.suppliers s on s.id = b.supplier_id
            where b.entity_id = $1 and b.status = 'POSTED' and b.bill_date <= $3::date
              and bal.outstanding > 0
            order by b.due_date`,
  },
  'aged-payables-detail': {
    empty: 'No unpaid bills.',
    columns: [
      textColumn('supplier_name', 'Supplier'),
      textColumn('bill_no', 'Bill'),
      textColumn('due_date', 'Due'),
      textColumn('bucket', 'Bucket'),
      moneyColumn('outstanding', 'Outstanding'),
    ],
    text: `select b.id, s.legal_name as supplier_name, b.bill_no, b.due_date::text,
                  case
                    when b.due_date >= $3::date then 'current'
                    when ($3::date - b.due_date) between 1 and 30 then '1-30'
                    when ($3::date - b.due_date) between 31 and 60 then '31-60'
                    when ($3::date - b.due_date) between 61 and 90 then '61-90'
                    else '90+'
                  end as bucket,
                  bal.outstanding::text, '/purchasing/bills/' || b.id as href
             from purch.bills b
             join purch.v_bill_balances bal on bal.id = b.id
             join app.suppliers s on s.id = b.supplier_id
            where b.entity_id = $1 and b.status = 'POSTED' and b.bill_date <= $3::date
              and bal.outstanding > 0
            order by s.legal_name, b.due_date`,
  },
  'aged-payables-summary': {
    empty: 'No unpaid bills.',
    columns: [textColumn('supplier_name', 'Supplier'), moneyColumn('outstanding', 'Outstanding')],
    text: `select s.id, s.legal_name as supplier_name, coalesce(sum(bal.outstanding), 0)::text as outstanding,
                  '/purchasing/vendors/' || s.id as href
             from app.suppliers s
             join purch.bills b on b.supplier_id = s.id and b.status = 'POSTED' and b.bill_date <= $3::date
             join purch.v_bill_balances bal on bal.id = b.id
            where s.entity_id = $1
            group by s.id, s.legal_name
           having coalesce(sum(bal.outstanding), 0) > 0
            order by s.legal_name`,
  },
  'supplier-balance-summary': {
    empty: 'No supplier balances.',
    columns: [
      textColumn('supplier_name', 'Supplier'),
      moneyColumn('billed', 'Billed'),
      moneyColumn('outstanding', 'Outstanding'),
    ],
    text: `select s.id, s.legal_name as supplier_name,
                  coalesce(sum(b.total), 0)::text as billed,
                  coalesce(sum(bal.outstanding), 0)::text as outstanding,
                  '/purchasing/vendors/' || s.id as href
             from app.suppliers s
             left join purch.bills b on b.supplier_id = s.id and b.status = 'POSTED' and b.bill_date <= $3::date
             left join purch.v_bill_balances bal on bal.id = b.id
            where s.entity_id = $1
            group by s.id, s.legal_name
           having coalesce(sum(b.total), 0) <> 0
            order by s.legal_name`,
  },
  'supplier-balance-detail': {
    empty: 'No unpaid bills.',
    columns: [
      textColumn('supplier_name', 'Supplier'),
      textColumn('bill_no', 'Bill'),
      moneyColumn('outstanding', 'Outstanding'),
    ],
    text: `select b.id, s.legal_name as supplier_name, b.bill_no, bal.outstanding::text,
                  '/purchasing/bills/' || b.id as href
             from purch.bills b
             join purch.v_bill_balances bal on bal.id = b.id
             join app.suppliers s on s.id = b.supplier_id
            where b.entity_id = $1 and b.status = 'POSTED' and bal.outstanding > 0
              and b.bill_date <= $3::date
            order by s.legal_name, b.due_date`,
  },
  'bill-payment-list': {
    empty: 'No supplier payments in this period.',
    columns: [
      textColumn('payment_date', 'Date'),
      textColumn('payment_no', 'Number'),
      textColumn('supplier_name', 'Supplier'),
      moneyColumn('amount', 'Amount'),
    ],
    text: `select p.id, p.payment_date::text, p.payment_no, s.legal_name as supplier_name, p.amount::text,
                  '/purchasing/payments/' || p.id as href
             from purch.supplier_payments p
             join app.suppliers s on s.id = p.supplier_id
            where p.entity_id = $1 and p.status = 'POSTED'
              and p.payment_date between $2::date and $3::date
            order by p.payment_date`,
  },
  'cheque-detail': {
    empty: 'No supplier payments in this period.',
    columns: [
      textColumn('payment_date', 'Date'),
      textColumn('payment_no', 'Number'),
      textColumn('supplier_name', 'Supplier'),
      textColumn('bank', 'Bank'),
      moneyColumn('amount', 'Amount'),
    ],
    text: `select p.id, p.payment_date::text, p.payment_no, s.legal_name as supplier_name,
                  a.name as bank, p.amount::text,
                  '/purchasing/payments/' || p.id as href
             from purch.supplier_payments p
             join app.suppliers s on s.id = p.supplier_id
             join gl.accounts a on a.id = p.bank_account_id
            where p.entity_id = $1 and p.status = 'POSTED'
              and p.payment_date between $2::date and $3::date
            order by p.payment_date`,
  },
  'bills-and-payments': {
    empty: 'No bills in this period.',
    columns: [
      textColumn('bill_no', 'Bill'),
      textColumn('supplier_name', 'Supplier'),
      moneyColumn('total', 'Billed'),
      moneyColumn('paid', 'Paid'),
    ],
    text: `select b.id, b.bill_no, s.legal_name as supplier_name, b.total::text,
                  (b.total - bal.outstanding)::text as paid,
                  '/purchasing/bills/' || b.id as href
             from purch.bills b
             join purch.v_bill_balances bal on bal.id = b.id
             join app.suppliers s on s.id = b.supplier_id
            where b.entity_id = $1 and b.status = 'POSTED'
              and b.bill_date between $2::date and $3::date
            order by b.bill_date`,
  },
  'expenses-by-supplier': {
    empty: 'No supplier bills in this period.',
    columns: [textColumn('supplier_name', 'Supplier'), moneyColumn('amount', 'Amount')],
    text: `select s.id, s.legal_name as supplier_name, coalesce(sum(b.total), 0)::text as amount,
                  '/purchasing/vendors/' || s.id as href
             from purch.bills b
             join app.suppliers s on s.id = b.supplier_id
            where b.entity_id = $1 and b.status = 'POSTED'
              and b.bill_date between $2::date and $3::date
            group by s.id, s.legal_name
            order by s.legal_name`,
  },
  'purchases-by-supplier-detail': {
    empty: 'No bill lines in this period.',
    columns: [
      textColumn('supplier_name', 'Supplier'),
      textColumn('bill_no', 'Bill'),
      textColumn('description', 'Item'),
      moneyColumn('line_net', 'Amount'),
    ],
    text: `select l.id, s.legal_name as supplier_name, b.bill_no, l.description, l.line_net::text,
                  '/purchasing/bills/' || b.id as href
             from purch.bills b
             join purch.bill_lines l on l.bill_id = b.id
             join app.suppliers s on s.id = b.supplier_id
            where b.entity_id = $1 and b.status = 'POSTED'
              and b.bill_date between $2::date and $3::date
            order by s.legal_name, b.bill_date, l.line_no`,
  },
  'purchases-by-product-detail': {
    empty: 'No purchase lines in this period.',
    columns: [
      textColumn('product_name', 'Product'),
      textColumn('doc_no', 'Document'),
      qtyColumn('quantity', 'Qty'),
      moneyColumn('line_net', 'Amount'),
    ],
    text: `select l.id, coalesce(i.description, l.description) as product_name, b.bill_no as doc_no,
                  l.quantity::text, l.line_net::text, '/purchasing/bills/' || b.id as href
             from purch.bills b
             join purch.bill_lines l on l.bill_id = b.id
             left join inv.items i on i.id = l.item_id
            where b.entity_id = $1 and b.status = 'POSTED'
              and b.bill_date between $2::date and $3::date
            order by 2, b.bill_date`,
  },
  'purchase-list': {
    empty: 'No purchasing documents in this period.',
    columns: [
      textColumn('doc_date', 'Date'),
      textColumn('kind', 'Type'),
      textColumn('doc_no', 'Number'),
      textColumn('payee', 'Supplier'),
      moneyColumn('total', 'Amount'),
    ],
    text: `select p.id, p.order_date::text as doc_date, 'Purchase order' as kind, p.po_no as doc_no,
                  s.legal_name as payee, p.total::text, '/purchasing/orders/' || p.id as href
             from purch.purchase_orders p
             join app.suppliers s on s.id = p.supplier_id
            where p.entity_id = $1 and p.status <> 'CANCELLED'
              and p.order_date between $2::date and $3::date
            union all
           select b.id, b.bill_date::text, 'Bill', b.bill_no, s.legal_name, b.total::text,
                  '/purchasing/bills/' || b.id
             from purch.bills b
             join app.suppliers s on s.id = b.supplier_id
            where b.entity_id = $1 and b.status = 'POSTED'
              and b.bill_date between $2::date and $3::date
            order by 2, 3`,
  },
  'transaction-list-by-supplier': {
    empty: 'No supplier transactions in this period.',
    columns: [
      textColumn('doc_date', 'Date'),
      textColumn('kind', 'Type'),
      textColumn('payee', 'Supplier'),
      textColumn('doc_no', 'Number'),
      moneyColumn('total', 'Amount'),
    ],
    text: `select b.id, b.bill_date::text as doc_date, 'Bill' as kind, s.legal_name as payee,
                  b.bill_no as doc_no, b.total::text, '/purchasing/bills/' || b.id as href
             from purch.bills b
             join app.suppliers s on s.id = b.supplier_id
            where b.entity_id = $1 and b.status = 'POSTED' and b.bill_date between $2::date and $3::date
            union all
           select p.id, p.payment_date::text, 'Payment', s.legal_name, p.payment_no, p.amount::text,
                  '/purchasing/payments/' || p.id
             from purch.supplier_payments p
             join app.suppliers s on s.id = p.supplier_id
            where p.entity_id = $1 and p.status = 'POSTED' and p.payment_date between $2::date and $3::date
            order by 2`,
  },
  'tax-liability': {
    empty: 'No tax in this period.',
    columns: [
      textColumn('code', 'Tax code'),
      moneyColumn('output', 'Output VAT'),
      moneyColumn('input', 'Input VAT'),
    ],
    text: `select t.id, t.code,
                  coalesce((
                    select sum(l.tax_amount) from sales.invoice_lines l
                      join sales.invoices i on i.id = l.invoice_id
                     where i.entity_id = $1 and i.status = 'ISSUED'
                       and i.invoice_date between $2::date and $3::date
                       and l.tax_code_id = t.id
                  ), 0)::text as output,
                  coalesce((
                    select sum(l.tax_amount) from purch.bill_lines l
                      join purch.bills b on b.id = l.bill_id
                     where b.entity_id = $1 and b.status = 'POSTED'
                       and b.bill_date between $2::date and $3::date
                       and l.tax_code_id = t.id
                  ), 0)::text as input,
                  null::text as href
             from app.tax_codes t
            where t.entity_id = $1 and t.is_active
            order by t.code`,
  },
  'inventory-status': {
    empty: 'No stocked items.',
    columns: [
      textColumn('part_number', 'SKU'),
      textColumn('description', 'Item'),
      qtyColumn('qty_on_hand', 'On hand'),
      qtyColumn('qty_on_po', 'On PO'),
      qtyColumn('qty_on_so', 'On SO'),
    ],
    text: `select i.id, i.part_number, i.description,
                  coalesce((select sum(quantity_on_hand) from inv.stock_balances b where b.item_id = i.id), 0)::text as qty_on_hand,
                  coalesce((
                    select sum(greatest(l.quantity - coalesce((
                      select sum(g.quantity) from purch.goods_receipt_lines g
                        join purch.goods_receipts h on h.id = g.goods_receipt_id
                       where g.po_line_id = l.id and h.status = 'POSTED'
                    ), 0), 0))
                      from purch.purchase_order_lines l
                      join purch.purchase_orders p on p.id = l.po_id
                     where l.item_id = i.id and p.status = 'APPROVED'
                  ), 0)::text as qty_on_po,
                  coalesce((
                    select sum(l.quantity)
                      from sales.sales_order_lines l
                      join sales.sales_orders o on o.id = l.sales_order_id
                     where l.item_id = i.id and o.status = 'CONFIRMED' and o.converted_invoice_id is null
                  ), 0)::text as qty_on_so,
                  '/inventory/items/' || i.id || '/edit' as href
             from inv.items i
            where i.entity_id = $1 and i.is_stocked
            order by i.part_number`,
  },
  'inventory-valuation-summary': {
    empty: 'No stock on hand.',
    columns: [
      textColumn('part_number', 'SKU'),
      textColumn('description', 'Item'),
      qtyColumn('quantity_on_hand', 'Qty'),
      moneyColumn('value_base', 'Value'),
    ],
    text: `select i.id, i.part_number, i.description,
                  b.quantity_on_hand::text, b.value_base::text,
                  '/inventory/stock' as href
             from inv.stock_balances b
             join inv.items i on i.id = b.item_id
            where b.entity_id = $1 and b.quantity_on_hand <> 0
            order by i.part_number`,
  },
  'inventory-valuation-detail': {
    empty: 'No stock movements in this period.',
    columns: [
      textColumn('movement_date', 'Date'),
      textColumn('part_number', 'SKU'),
      textColumn('movement_type', 'Type'),
      qtyColumn('quantity', 'Qty'),
      moneyColumn('value_base', 'Value'),
    ],
    text: `select sl.id::text as id, sl.movement_date::text, i.part_number, sl.movement_type::text,
                  sl.quantity::text, sl.value_base::text, '/inventory/ledger' as href
             from inv.stock_ledger sl
             join inv.items i on i.id = sl.item_id
            where sl.entity_id = $1 and sl.movement_date between $2::date and $3::date
            order by sl.movement_date, sl.id`,
  },
  'stock-take-worksheet': {
    empty: 'No stocked items.',
    columns: [
      textColumn('part_number', 'SKU'),
      textColumn('description', 'Item'),
      textColumn('warehouse', 'Warehouse'),
      qtyColumn('quantity_on_hand', 'System qty'),
      textColumn('count', 'Physical count'),
    ],
    text: `select i.id || ':' || w.id as id, i.part_number, i.description, w.name as warehouse,
                  coalesce(b.quantity_on_hand, 0)::text as quantity_on_hand, '' as count,
                  null::text as href
             from inv.items i
             cross join inv.warehouses w
             left join inv.stock_balances b
               on b.item_id = i.id and b.warehouse_id = w.id and b.entity_id = i.entity_id
            where i.entity_id = $1 and i.is_stocked and w.entity_id = $1 and w.is_active
            order by i.part_number, w.code`,
  },
  'open-po-list': {
    empty: 'No open purchase orders.',
    columns: [
      textColumn('order_date', 'Date'),
      textColumn('po_no', 'Number'),
      textColumn('supplier_name', 'Supplier'),
      moneyColumn('total', 'Amount'),
    ],
    text: `select p.id, p.order_date::text, p.po_no, s.legal_name as supplier_name, p.total::text,
                  '/purchasing/orders/' || p.id as href
             from purch.purchase_orders p
             join app.suppliers s on s.id = p.supplier_id
            where p.entity_id = $1 and p.status = 'APPROVED'
            order by p.order_date desc`,
  },
  'open-po-detail': {
    empty: 'No open purchase-order lines.',
    columns: [
      textColumn('po_no', 'PO'),
      textColumn('description', 'Item'),
      qtyColumn('quantity', 'Ordered'),
      qtyColumn('received', 'Received'),
    ],
    text: `select l.id, p.po_no, l.description, l.quantity::text,
                  coalesce((
                    select sum(g.quantity) from purch.goods_receipt_lines g
                      join purch.goods_receipts h on h.id = g.goods_receipt_id
                     where g.po_line_id = l.id and h.status = 'POSTED'
                  ), 0)::text as received,
                  '/purchasing/orders/' || p.id as href
             from purch.purchase_order_lines l
             join purch.purchase_orders p on p.id = l.po_id
            where p.entity_id = $1 and p.status = 'APPROVED' and l.item_id is not null
            order by p.po_no, l.line_no`,
  },
};
