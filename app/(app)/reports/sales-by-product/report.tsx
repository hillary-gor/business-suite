'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Amount, Quantity } from '@/components/ui';
import { PageFeedback } from '@/components/lists/list-chrome';
import { Money, formatMoney } from '@/lib/money';
import { csvFilename, downloadCsv } from '@/lib/csv-download';
import {
  REPORT_PERIODS,
  formatReportDateRange,
  reportPeriodLabel,
  reportPeriodRange,
  reportQueryHref,
  type ReportBasis,
  type ReportPeriod,
} from '@/lib/report-periods';
import {
  groupProductSales,
  type ProductSaleMetrics,
  type ProductSaleRow,
} from '@/lib/sales-by-product';

type Query = {
  period: ReportPeriod;
  from: string;
  to: string;
  basis: ReportBasis;
};

export function SalesByProductReport({
  companyName,
  currency,
  query,
  generatedAt,
  rows,
}: {
  companyName: string;
  currency: string;
  query: Query;
  generatedAt: string;
  rows: readonly ProductSaleRow[];
}) {
  const router = useRouter();
  const grouped = useMemo(() => groupProductSales(rows), [rows]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  function go(next: Query) {
    router.push(reportQueryHref('/reports/sales-by-product', next));
  }

  function setPeriod(period: ReportPeriod) {
    if (period === 'custom') {
      go({ ...query, period });
      return;
    }
    const range = reportPeriodRange(period);
    go({ period, from: range.from, to: range.to, basis: query.basis });
  }

  function setDates(from: string, to: string) {
    go({ period: 'custom', from, to, basis: query.basis });
  }

  function download() {
    const csvRows: string[][] = [
      [
        'Product/Service',
        'Quantity',
        'Amount',
        '% of sales',
        'Avg. price',
        'COS',
        'Avg. COS',
        'Gross margin',
        'Gross margin %',
      ],
    ];
    for (const section of grouped.sections) {
      if (section.kind === 'category') {
        csvRows.push(csvLine(section.total, currency, section.name));
        for (const line of section.lines) csvRows.push(csvLine(line, currency, `  ${line.name}`));
      } else {
        csvRows.push(csvLine(section.line, currency));
      }
    }
    csvRows.push(csvLine(grouped.total, currency));
    downloadCsv(csvFilename(['sales-by-product', query.from, query.to, query.basis]), csvRows);
  }

  return (
    <div className="sbp">
      <header className="sbp__chrome">
        <Link href="/reports" className="sbp__back">
          Back to standard reports
        </Link>
        <div className="sbp__actions">
          <span className="sbp__muted" title="Not yet built">
            Learn more
          </span>
          <PageFeedback />
          <button type="button" className="button sbp__customise" disabled title="Not yet built">
            Customise
            <span className="sbp__dot" aria-hidden="true" />
          </button>
          <button type="button" className="button sbp__save" disabled title="Not yet built">
            Save As
          </button>
        </div>
      </header>

      <form
        className="sbp__filters"
        method="get"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const period = (data.get('period') as ReportPeriod | null) ?? query.period;
          go({
            period,
            from: String(data.get('from') ?? query.from),
            to: String(data.get('to') ?? query.to),
            basis: query.basis,
          });
        }}
      >
        <label className="sbp__field">
          <span>Report period</span>
          <select
            name="period"
            value={query.period}
            onChange={(event) => setPeriod(event.target.value as ReportPeriod)}
          >
            {REPORT_PERIODS.map((period) => (
              <option key={period} value={period}>
                {reportPeriodLabel(period)}
              </option>
            ))}
          </select>
        </label>
        <label className="sbp__field">
          <span>From</span>
          <input
            name="from"
            type="date"
            value={query.from}
            onChange={(event) => setDates(event.target.value, query.to)}
          />
        </label>
        <label className="sbp__field">
          <span>To</span>
          <input
            name="to"
            type="date"
            value={query.to}
            onChange={(event) => setDates(query.from, event.target.value)}
          />
        </label>
        <div className="sbp__field">
          <span>Accounting method</span>
          <div className="sbp__basis" role="group" aria-label="Accounting method">
            <button
              type="button"
              className={query.basis === 'CASH' ? 'is-on' : undefined}
              onClick={() => go({ ...query, basis: 'CASH' })}
            >
              Cash
            </button>
            <button
              type="button"
              className={query.basis === 'ACCRUAL' ? 'is-on' : undefined}
              onClick={() => go({ ...query, basis: 'ACCRUAL' })}
            >
              Accrual
            </button>
          </div>
        </div>
        <label className="sbp__field">
          <span>Display columns by</span>
          <select disabled defaultValue="total" aria-label="Display columns by">
            <option value="total">Total</option>
          </select>
        </label>
      </form>

      <section className="sbp__paper">
        <div className="sbp__toolbar">
          <p className="sbp__zoom">
            Compact <span aria-hidden="true">|</span> 100%
          </p>
          <div className="list-tools">
            <button
              type="button"
              className="list-tools__icon"
              title="Refresh"
              onClick={() => router.refresh()}
            >
              <RefreshIcon />
            </button>
            <button type="button" className="list-tools__icon" title="Not yet built" disabled>
              <MailIcon />
            </button>
            <button
              type="button"
              className="list-tools__icon"
              title="Print"
              onClick={() => window.print()}
            >
              <PrintIcon />
            </button>
              <button
                type="button"
                className="list-tools__icon"
                title="Download CSV"
                onClick={download}
              >
              <ExportIcon />
            </button>
            <button type="button" className="list-tools__icon" title="Not yet built" disabled>
              <GearIcon />
            </button>
          </div>
        </div>

        <header className="sbp__heading">
          <p className="sbp__company">{companyName}</p>
          <h1>Sales by Product/Service Summary</h1>
          <p className="sbp__dates">{formatReportDateRange(query.from, query.to)}</p>
        </header>

        {rows.length === 0 ? (
          <p className="sbp__empty">No sales in this period.</p>
        ) : (
          <div className="sbp__table-wrap">
            <table className="sbp-table">
              <thead>
                <tr>
                  <th>Product/Service</th>
                  <th className="numeric">Quantity</th>
                  <th className="numeric">Amount</th>
                  <th className="numeric">% of sales</th>
                  <th className="numeric">Avg. price</th>
                  <th className="numeric">COS</th>
                  <th className="numeric">Avg. COS</th>
                  <th className="numeric">Gross margin</th>
                  <th className="numeric">Gross margin %</th>
                </tr>
              </thead>
              <tbody>
                {grouped.sections.map((section) => {
                  if (section.kind === 'item') {
                    return (
                      <MetricRow key={section.line.key} row={section.line} currency={currency} />
                    );
                  }
                  const open = !collapsed.has(section.key);
                  return (
                    <CategoryBlock
                      key={section.key}
                      name={section.name}
                      open={open}
                      lines={section.lines}
                      total={section.total}
                      currency={currency}
                      onToggle={() =>
                        setCollapsed((current) => {
                          const next = new Set(current);
                          if (next.has(section.key)) next.delete(section.key);
                          else next.add(section.key);
                          return next;
                        })
                      }
                    />
                  );
                })}
              </tbody>
              <tfoot>
                <MetricRow row={grouped.total} currency={currency} strong />
              </tfoot>
            </table>
          </div>
        )}

        <footer className="sbp__foot">
          <button type="button" className="sbp__note" disabled title="Not yet built">
            <NoteIcon />
            Add note
          </button>
          <p>
            {query.basis === 'CASH' ? 'Cash basis' : 'Accrual basis'} | {generatedAt}
          </p>
        </footer>
      </section>
    </div>
  );
}

function CategoryBlock({
  name,
  open,
  lines,
  total,
  currency,
  onToggle,
}: {
  name: string;
  open: boolean;
  lines: readonly ProductSaleMetrics[];
  total: ProductSaleMetrics;
  currency: string;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="sbp-table__group">
        <th scope="row">
          <button
            type="button"
            className="sbp-table__toggle"
            aria-expanded={open}
            onClick={onToggle}
          >
            <span className={open ? 'is-open' : undefined} aria-hidden="true" />
            {name}
          </button>
        </th>
        {open ? <td colSpan={8} /> : <MetricCells row={total} currency={currency} />}
      </tr>
      {open
        ? lines.map((line) => <MetricRow key={line.key} row={line} currency={currency} nested />)
        : null}
      {open ? <MetricRow row={total} currency={currency} strong /> : null}
    </>
  );
}

function MetricRow({
  row,
  currency,
  nested = false,
  strong = false,
}: {
  row: ProductSaleMetrics;
  currency: string;
  nested?: boolean;
  strong?: boolean;
}) {
  return (
    <tr className={strong ? 'sbp-table__total' : undefined}>
      <th scope="row" className={nested ? 'sbp-table__nested' : undefined}>
        {row.name}
      </th>
      <MetricCells row={row} currency={currency} showCurrency={strong} />
    </tr>
  );
}

function MetricCells({
  row,
  currency,
  showCurrency = false,
}: {
  row: ProductSaleMetrics;
  currency: string;
  showCurrency?: boolean;
}) {
  return (
    <>
      <td className="numeric">
        {Money.from(row.quantity).isZero() ? null : <Quantity value={row.quantity} />}
      </td>
      <td className="numeric">
        <Amount value={row.amount} currency={currency} showCurrency />
      </td>
      <td className="numeric">{row.percentOfSales}</td>
      <td className="numeric">
        {row.avgPrice ? (
          <Amount value={row.avgPrice} currency={currency} showCurrency={showCurrency} />
        ) : null}
      </td>
      <td className="numeric">
        <Amount value={row.cos} currency={currency} showCurrency={showCurrency} />
      </td>
      <td className="numeric">
        {row.avgCos ? (
          <Amount value={row.avgCos} currency={currency} showCurrency={showCurrency} />
        ) : null}
      </td>
      <td className="numeric">
        <Amount value={row.grossMargin} currency={currency} showCurrency={showCurrency} />
      </td>
      <td className="numeric">{row.grossMarginPercent}</td>
    </>
  );
}

function csvLine(row: ProductSaleMetrics, currency: string, name = row.name): string[] {
  return [
    name,
    Money.from(row.quantity).isZero() ? '' : Money.from(row.quantity).toString(),
    formatMoney(row.amount, { currency, showCurrency: true }),
    row.percentOfSales ?? '',
    row.avgPrice ? formatMoney(row.avgPrice, { currency }) : '',
    formatMoney(row.cos, { currency, showCurrency: true }),
    row.avgCos ? formatMoney(row.avgCos, { currency }) : '',
    formatMoney(row.grossMargin, { currency }),
    row.grossMarginPercent ?? '',
  ];
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 12a8 8 0 1 1-2.2-5.5M20 5v5h-5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="m5 7 7 6 7-6" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 8V4h10v4" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M6 14H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1M7 14h10v6H7v-6Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 3h7v7M21 3l-9 9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M20 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 3.5v2.2M12 18.3V20.5M4.9 7.2l1.9 1.1M17.2 15.7l1.9 1.1M4.9 16.8l1.9-1.1M17.2 8.3l1.9-1.1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 4h8l5 5v11H7V4Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M15 4v5h5" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}
