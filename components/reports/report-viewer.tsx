'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageFeedback } from '@/components/lists/list-chrome';
import {
  ReportCustomisePanel,
  type ReportDisplayOptions,
} from '@/components/reports/customise-panel';
import { csvFilename, downloadCsv } from '@/lib/csv-download';
import { Money, formatMoney, formatQuantity } from '@/lib/money';
import {
  REPORT_PERIODS,
  formatReportDateRange,
  reportPeriodLabel,
  reportPeriodRange,
  reportQueryHref,
  type ReportBasis,
  type ReportPeriod,
} from '@/lib/report-periods';
import type { ReportModel, ReportRow } from '@/lib/report-view';
import {
  reportAccountingMethod,
  type ReportDateMode,
  type StandardReport,
} from '@/lib/standard-reports';

type Query = { period: ReportPeriod; from: string; to: string; basis: ReportBasis };

const DEFAULT_DISPLAY: ReportDisplayOptions = {
  showZero: false,
  showSymbol: true,
  decimals: 2,
  negativesRed: false,
  divide1000: false,
  titles: {},
};

export function ReportViewer({
  report,
  model,
  companyName,
  currency,
  query,
  generatedAt,
}: {
  report: StandardReport;
  model: ReportModel;
  companyName: string;
  currency: string;
  query: Query;
  generatedAt: string;
}) {
  const router = useRouter();
  const [customiseOpen, setCustomiseOpen] = useState(false);
  const [display, setDisplay] = useState<ReportDisplayOptions>(DEFAULT_DISPLAY);
  const [draft, setDraft] = useState<ReportDisplayOptions>(DEFAULT_DISPLAY);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const accountingMethod = reportAccountingMethod(report);
  const dateMode: ReportDateMode = report.dateMode;
  const basisLabel =
    accountingMethod === 'cash' || (accountingMethod === 'both' && query.basis === 'CASH')
      ? 'Cash basis'
      : 'Accrual basis';

  const visible = useMemo(
    () => (display.showZero ? model.rows : model.rows.filter((row) => keepRow(row, model))),
    [model, display.showZero],
  );

  const closeCustomise = useCallback(() => setCustomiseOpen(false), []);

  function go(next: Query) {
    router.push(reportQueryHref(report.href, next));
  }

  function setPeriod(period: ReportPeriod) {
    if (period === 'custom') {
      go({ ...query, period });
      return;
    }
    const range = reportPeriodRange(period);
    go({ period, from: range.from, to: range.to, basis: query.basis });
  }

  function formatCell(row: ReportRow, key: string, options: ReportDisplayOptions = display): string {
    const column = model.columns.find((item) => item.key === key);
    const raw = row.values[key] ?? '';
    if (!column || column.format === 'text' || column.format === 'date' || raw === '') return raw;
    if (column.format === 'qty') return formatQuantity(raw);
    if (column.format === 'percent') return raw ? `${raw}%` : '';
    let amount = Money.from(raw);
    if (options.divide1000) amount = amount.dividedBy(1000);
    return formatMoney(amount, {
      currency,
      minorUnits: options.decimals,
      showCurrency:
        options.showSymbol &&
        column.format === 'money' &&
        (row.role === 'total' || row.role === 'grand'),
    });
  }

  function download() {
    const headingRange =
      dateMode === 'asOf'
        ? query.to
        : dateMode === 'none'
          ? ''
          : formatReportDateRange(query.from, query.to);
    const header = model.columns.map((column) => column.label);
    const csvRows: string[][] = [
      [companyName],
      [report.title],
      ...(headingRange ? [[headingRange]] : []),
      [basisLabel],
      header,
      ...visible.map((row) =>
        model.columns.map((column, index) => {
          if (index === 0 && row.role === 'group' && row.group) {
            return display.titles[row.group] ?? row.values.name ?? '';
          }
          return formatCell(row, column.key);
        }),
      ),
    ];
    downloadCsv(
      csvFilename([report.id, dateMode === 'asOf' ? query.to : `${query.from}-${query.to}`]),
      csvRows,
    );
  }

  const headingRange =
    dateMode === 'asOf'
      ? query.to
      : dateMode === 'none'
        ? ''
        : formatReportDateRange(query.from, query.to);

  return (
    <div className="sbp rpt">
      <header className="sbp__chrome">
        <Link href="/reports" className="sbp__back">
          Back to standard reports
        </Link>
        <div className="sbp__actions">
          <PageFeedback />
          <button
            type="button"
            className="button sbp__customise"
            onClick={() => {
              setDraft(display);
              setCustomiseOpen(true);
            }}
          >
            Customise
          </button>
          <button
            type="button"
            className="button button--primary sbp__save"
            disabled
            title="Not in this version"
          >
            Save As
          </button>
        </div>
      </header>

      {dateMode !== 'none' ? (
        <form
          className="sbp__filters"
          method="get"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            go({
              period: (data.get('period') as ReportPeriod | null) ?? query.period,
              from: String(data.get('from') ?? query.from),
              to: String(data.get('to') ?? query.to),
              basis: query.basis,
            });
          }}
        >
          {dateMode === 'range' ? (
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
          ) : null}
          {dateMode === 'range' ? (
            <label className="sbp__field">
              <span>From</span>
              <input
                name="from"
                type="date"
                value={query.from}
                onChange={(event) => go({ ...query, period: 'custom', from: event.target.value })}
              />
            </label>
          ) : null}
          <label className="sbp__field">
            <span>{dateMode === 'asOf' ? 'As at' : 'To'}</span>
            <input
              name="to"
              type="date"
              value={query.to}
              onChange={(event) =>
                go({
                  ...query,
                  period: 'custom',
                  from: dateMode === 'asOf' ? event.target.value : query.from,
                  to: event.target.value,
                })
              }
            />
          </label>
          {accountingMethod === 'both' ? (
            <div className="sbp__field">
              <span>Accounting method</span>
              <div className="sbp__basis" role="group" aria-label="Accounting method">
                <button
                  type="button"
                  className={query.basis === 'CASH' ? 'is-on' : undefined}
                  aria-pressed={query.basis === 'CASH'}
                  onClick={() => go({ ...query, basis: 'CASH' })}
                >
                  Cash
                </button>
                <button
                  type="button"
                  className={query.basis === 'ACCRUAL' ? 'is-on' : undefined}
                  aria-pressed={query.basis === 'ACCRUAL'}
                  onClick={() => go({ ...query, basis: 'ACCRUAL' })}
                >
                  Accrual
                </button>
              </div>
            </div>
          ) : (
            <div className="sbp__field">
              <span>Accounting method</span>
              <p className="sbp__basis-label">{basisLabel}</p>
            </div>
          )}
          <label className="sbp__field">
            <span>Display columns by</span>
            <select disabled defaultValue="total" aria-label="Display columns by">
              <option value="total">Total</option>
            </select>
          </label>
          <label className="sbp__field">
            <span>Compare to</span>
            <select disabled defaultValue="" aria-label="Compare to">
              <option value="">Select period</option>
            </select>
          </label>
        </form>
      ) : null}

      <div className="rpt__workspace">
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
            </div>
          </div>

          <header className="sbp__heading">
            <p className="sbp__company">{companyName}</p>
            <h1>{report.title}</h1>
            {headingRange ? <p className="sbp__dates">{headingRange}</p> : null}
          </header>

          {model.unavailable ? (
            <p className="sbp__empty">{model.unavailable}</p>
          ) : visible.length === 0 ? (
            <p className="sbp__empty">{model.empty}</p>
          ) : (
            <div className="sbp__table-wrap">
              <table className="sbp-table">
                <thead>
                  <tr>
                    {model.columns.map((column) => (
                      <th
                        key={column.key}
                        className={column.align === 'right' ? 'numeric' : undefined}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    if (row.role === 'group' && row.group && collapsed.has(row.group)) {
                      const total = visible.find(
                        (item) => item.role === 'total' && item.group === row.group,
                      );
                      return (
                        <tr key={row.key} className="rpt-row rpt-row--group">
                          {model.columns.map((column, index) => (
                            <td
                              key={column.key}
                              className={column.align === 'right' ? 'numeric' : undefined}
                            >
                              {index === 0 ? (
                                <button
                                  type="button"
                                  className="rpt-toggle"
                                  onClick={() => toggleGroup(row.group!, collapsed, setCollapsed)}
                                >
                                  <Chevron open={false} />
                                  {display.titles[row.group!] ?? row.values.name}
                                </button>
                              ) : total ? (
                                formatCell(total, column.key)
                              ) : null}
                            </td>
                          ))}
                        </tr>
                      );
                    }
                    if (row.role === 'line' && row.group && collapsed.has(row.group)) return null;
                    const className = [
                      'rpt-row',
                      row.role === 'group' ? 'rpt-row--group' : '',
                      row.role === 'total' ? 'rpt-row--total' : '',
                      row.role === 'grand' ? 'rpt-row--grand' : '',
                      display.negativesRed && isNegativeRow(row, model) ? 'rpt-row--neg' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <tr key={row.key} className={className}>
                        {model.columns.map((column, index) => {
                          const content =
                            index === 0 && row.role === 'group' && row.group ? (
                              <button
                                type="button"
                                className="rpt-toggle"
                                onClick={() => toggleGroup(row.group!, collapsed, setCollapsed)}
                              >
                                <Chevron open />
                                {display.titles[row.group] ?? row.values.name}
                              </button>
                            ) : index === 0 && row.href ? (
                              <Link href={row.href}>{formatCell(row, column.key)}</Link>
                            ) : (
                              formatCell(row, column.key)
                            );
                          return (
                            <td
                              key={column.key}
                              className={column.align === 'right' ? 'numeric' : undefined}
                              style={
                                row.indent && index === 0
                                  ? { paddingLeft: `${16 + row.indent * 16}px` }
                                  : undefined
                              }
                            >
                              {content}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <footer className="sbp__foot">
            <p>
              {basisLabel}
              {generatedAt ? ` · ${generatedAt}` : ''}
            </p>
            <button type="button" className="sbp__note" disabled title="Not in this version">
              Add note
            </button>
          </footer>
        </section>
      </div>

      <ReportCustomisePanel
        open={customiseOpen}
        onClose={closeCustomise}
        onApply={() => {
          setDisplay(draft);
          setCustomiseOpen(false);
        }}
        accountingMethod={accountingMethod}
        groups={visible.filter((row) => row.role === 'group' && row.group)}
        draft={draft}
        setDraft={setDraft}
      />
    </div>
  );
}

function keepRow(row: ReportRow, model: ReportModel): boolean {
  if (row.alwaysShow) return true;
  if (row.role === 'group' || row.role === 'grand' || row.role === 'total') return true;
  return model.columns.some((column) => {
    if (column.format !== 'money' && column.format !== 'percent') return false;
    const raw = row.values[column.key];
    if (!raw) return false;
    try {
      return !Money.from(raw).isZero();
    } catch {
      return true;
    }
  })
    ? true
    : model.columns.every((column) => column.format !== 'money');
}

function isNegativeRow(row: ReportRow, model: ReportModel): boolean {
  return model.columns.some((column) => {
    if (column.format !== 'money') return false;
    const raw = row.values[column.key];
    if (!raw) return false;
    try {
      return Money.from(raw).isNegative();
    } catch {
      return false;
    }
  });
}

function toggleGroup(
  group: string,
  collapsed: ReadonlySet<string>,
  setCollapsed: (next: ReadonlySet<string>) => void,
) {
  const next = new Set(collapsed);
  if (next.has(group)) next.delete(group);
  else next.add(group);
  setCollapsed(next);
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d={open ? 'M2 4.5 6 8.5 10 4.5' : 'M4.5 2 8.5 6 4.5 10'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
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
        d="M12 4v11M8 11l4 4 4-4M5 19h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
