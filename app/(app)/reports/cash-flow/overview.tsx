'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MenuButton, PageFeedback, RowAction } from '@/components/lists/list-chrome';
import { CashFlowChart } from '@/components/reports/cash-flow-chart';
import {
  CASH_FLOW_RANGES,
  SUGGESTED_BANKS,
  barShare,
  buildCashFlowSeries,
  formatFlowHeadline,
  formatFlowLine,
  moneyInPaid,
  moneyInUpcoming,
  moneyOutPaid,
  moneyOutUpcoming,
  outlookTotal,
  type CashFlowBucket,
  type CashFlowPayload,
  type CashFlowRange,
} from '@/lib/cash-flow';
import { Money } from '@/lib/money';
import type { FlowPlotMode } from '@/lib/cash-flow-plot';

export function CashFlowOverview({
  currency,
  payload,
}: {
  currency: string;
  payload: CashFlowPayload;
}) {
  const router = useRouter();
  const [range, setRange] = useState<CashFlowRange>(12);
  const [mode, setMode] = useState<FlowPlotMode>('balance');
  const [inTab, setInTab] = useState<'upcoming' | 'paid'>('upcoming');
  const [outTab, setOutTab] = useState<'upcoming' | 'paid'>('upcoming');

  const series = useMemo(() => buildCashFlowSeries(payload, range), [payload, range]);
  const inUpcoming = moneyInUpcoming(payload);
  const inPaid = moneyInPaid(payload);
  const outUpcoming = moneyOutUpcoming(payload);
  const outPaid = moneyOutPaid(payload);
  const inTotal = outlookTotal(inUpcoming, inPaid);
  const outTotal = outlookTotal(outUpcoming, outPaid).times(-1);

  return (
    <div className="cflo">
      <header className="cflo__header">
        <h1>Cash flow overview</h1>
        <div className="cflo__header-actions">
          <PageFeedback />
          <button
            type="button"
            className="cflo__icon"
            title="Refresh from posted books"
            onClick={() => router.refresh()}
          >
            <SwapIcon />
          </button>
        </div>
      </header>

      <div className="cflo__top">
        <AccountsCard accounts={payload.accounts} currency={currency} />
        <article className="cflo-card cflo-card--chart">
          <div className="cflo-chart__head">
            <div>
              <p className="cflo-chart__kicker">Cash flow</p>
              <p className="cflo-chart__updated">From posted books</p>
              <p className="cflo-chart__label">Today&apos;s cash balance</p>
              <p className="cflo-chart__balance">
                {formatFlowHeadline(payload.todayBalance, currency)}
              </p>
            </div>
            <div className="cflo-chart__controls">
              <label className="cflo-chart__range">
                <span className="sr-only">Time range</span>
                <select
                  value={range}
                  onChange={(event) => setRange(Number(event.target.value) as CashFlowRange)}
                >
                  {CASH_FLOW_RANGES.map((value) => (
                    <option key={value} value={value}>
                      {value} months
                    </option>
                  ))}
                </select>
              </label>
              <div className="cflo-chart__toggle" role="group" aria-label="Chart metric">
                <button
                  type="button"
                  className={mode === 'balance' ? 'is-on' : undefined}
                  onClick={() => setMode('balance')}
                >
                  Cash balance
                </button>
                <button
                  type="button"
                  className={mode === 'inout' ? 'is-on' : undefined}
                  onClick={() => setMode('inout')}
                >
                  Money in/out
                </button>
              </div>
            </div>
          </div>
          <CashFlowChart series={series} mode={mode} currency={currency} />
          {mode === 'balance' ? (
            <ul className="cflo-chart__legend">
              <li>
                <span className="cflo-swatch cflo-swatch--line" /> Cash balance
              </li>
              <li>
                <span className="cflo-swatch cflo-swatch--dash" /> Projected balance
              </li>
              <li>
                <span className="cflo-swatch cflo-swatch--threshold" /> Threshold
              </li>
            </ul>
          ) : (
            <ul className="cflo-chart__legend">
              <li>
                <span className="cflo-swatch cflo-swatch--in" /> Money in
              </li>
              <li>
                <span className="cflo-swatch cflo-swatch--out" /> Money out
              </li>
            </ul>
          )}
        </article>
      </div>

      <h2 className="cflo__section">Monthly outlook</h2>
      <OutlookCard
        title="Money in"
        tone="in"
        tab={inTab}
        onTab={setInTab}
        thisMonth={inTotal}
        upcoming={inUpcoming}
        paid={inPaid}
        currency={currency}
        reports={[
          { label: 'Statement of Cash Flows', href: '/reports/statement-of-cash-flows' },
          { label: 'Aged receivables', href: '/reports/aged-receivables' },
        ]}
        rows={
          inTab === 'upcoming'
            ? [
                {
                  label: 'Overdue invoices',
                  bucket: payload.moneyIn.overdueInvoices,
                  action: { label: 'Create invoice', href: '/sales/invoices/new' },
                },
                {
                  label: 'Open invoices',
                  bucket: payload.moneyIn.openInvoices,
                  action: { label: 'Create invoice', href: '/sales/invoices/new' },
                },
              ]
            : [
                {
                  label: 'Undeposited invoices',
                  bucket: payload.moneyIn.undeposited,
                  action: { label: 'Create invoice', href: '/sales/invoices/new' },
                },
                {
                  label: 'Invoice payments',
                  bucket: payload.moneyIn.invoicePayments,
                  action: { label: 'View invoice payments', href: '/sales/invoices' },
                },
                {
                  label: 'Sales receipts',
                  bucket: payload.moneyIn.salesReceipts,
                  action: { label: 'Create sales receipt', href: '/sales/receipts/new' },
                },
              ]
        }
      />
      <OutlookCard
        title="Money out"
        tone="out"
        tab={outTab}
        onTab={setOutTab}
        thisMonth={outTotal}
        upcoming={outUpcoming}
        paid={outPaid}
        currency={currency}
        reports={[
          { label: 'Statement of Cash Flows', href: '/reports/statement-of-cash-flows' },
          { label: 'Unpaid bills', href: '/reports/unpaid-bills' },
          { label: 'Expense transactions', href: '/purchasing/expenses' },
        ]}
        rows={
          outTab === 'upcoming'
            ? [
                {
                  label: 'Overdue bills',
                  bucket: payload.moneyOut.overdueBills,
                  action: { label: 'Create bill', href: '/purchasing/bills/new' },
                },
                {
                  label: 'Open bills',
                  bucket: payload.moneyOut.openBills,
                  action: { label: 'Pay bill', href: '/purchasing/payments/new' },
                },
              ]
            : [
                {
                  label: 'Bill payments',
                  bucket: payload.moneyOut.billPayments,
                  action: { label: 'Pay bill', href: '/purchasing/payments/new' },
                },
                {
                  label: 'Paid expenses',
                  bucket: payload.moneyOut.paidExpenses,
                  action: { label: 'Create expense', href: '/purchasing/expenses/new' },
                },
              ]
        }
      />

      <h2 className="cflo__section">Insights and ideas</h2>
      <article className="cflo-card cflo-coming">
        <p className="cflo-coming__kicker">Coming up</p>
        {payload.comingUp.length === 0 ? (
          <p className="cflo-coming__empty">Nothing due after today.</p>
        ) : (
          <ul>
            {payload.comingUp.map((row) => (
              <li key={`${row.kind}-${row.id}`}>
                <Link href={row.href}>
                  <span className="cflo-coming__date">{formatComingDate(row.date)}</span>
                  <span className="cflo-coming__who">
                    <strong>{row.party}</strong>
                    <em>{row.kind}</em>
                  </span>
                  <span className={`cflo-coming__amount${row.kind === 'Invoice' ? ' is-in' : ''}`}>
                    {formatFlowLine(row.amount, currency)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/sales/invoices" className="cflo-coming__all">
          View all
        </Link>
      </article>
    </div>
  );
}

function AccountsCard({
  accounts,
  currency,
}: {
  accounts: CashFlowPayload['accounts'];
  currency: string;
}) {
  return (
    <article className="cflo-card cflo-accounts">
      <p className="cflo-accounts__kicker">All accounts</p>
      {accounts.length > 0 ? (
        <>
          <ul className="cflo-accounts__books">
            {accounts.map((account) => (
              <li key={account.id}>
                <span>
                  <strong>{account.name}</strong>
                  <em>{formatFlowHeadline(account.balance, currency)}</em>
                </span>
              </li>
            ))}
          </ul>
          <p className="cflo-accounts__hint">
            These balances are from posted cash and bank accounts. Bank feeds are not in this
            version.
          </p>
        </>
      ) : (
        <>
          <h2>Link your bank</h2>
          <p>See where your money is headed so you can take control of your finances.</p>
          <ul className="cflo-accounts__banks">
            {SUGGESTED_BANKS.map((bank) => (
              <li key={bank.id}>
                <span className={`cflo-bank-mark cflo-bank-mark--${bank.id}`}>{bank.mark}</span>
                <span>{bank.name}</span>
                <button
                  type="button"
                  className="cflo-accounts__add"
                  title="Bank feeds are not in this version"
                  disabled
                >
                  +
                </button>
              </li>
            ))}
            <li>
              <span className="cflo-bank-mark cflo-bank-mark--find">⌕</span>
              <span>Find your bank</span>
              <button
                type="button"
                className="cflo-accounts__add"
                title="Bank feeds are not in this version"
                disabled
              >
                +
              </button>
            </li>
          </ul>
        </>
      )}
    </article>
  );
}

function OutlookCard({
  title,
  tone,
  tab,
  onTab,
  thisMonth,
  upcoming,
  paid,
  currency,
  reports,
  rows,
}: {
  title: string;
  tone: 'in' | 'out';
  tab: 'upcoming' | 'paid';
  onTab: (tab: 'upcoming' | 'paid') => void;
  thisMonth: Money;
  upcoming: CashFlowBucket;
  paid: CashFlowBucket;
  currency: string;
  reports: ReadonlyArray<{ label: string; href: string }>;
  rows: ReadonlyArray<{
    label: string;
    bucket: CashFlowBucket;
    action: { label: string; href: string };
  }>;
}) {
  const total = Money.from(upcoming.amount).plus(paid.amount);
  const upcomingShare = barShare(upcoming.amount, total);
  const paidShare = barShare(paid.amount, total);

  return (
    <article className={`cflo-outlook cflo-outlook--${tone}`}>
      <header className="cflo-outlook__head">
        <div className="cflo-outlook__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'upcoming'}
            className={tab === 'upcoming' ? 'is-on' : undefined}
            onClick={() => onTab('upcoming')}
          >
            Upcoming
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'paid'}
            className={tab === 'paid' ? 'is-on' : undefined}
            onClick={() => onTab('paid')}
          >
            Paid
          </button>
        </div>
        <div className="cflo-outlook__title">
          <h3>{title}</h3>
          <MenuButton label="View reports" items={[...reports]} />
        </div>
      </header>
      <div className="cflo-outlook__body">
        <div className="cflo-outlook__summary">
          <p className="cflo-outlook__when">This month</p>
          <p className="cflo-outlook__figure">{formatFlowHeadline(thisMonth, currency)}</p>
          <div className={`cflo-bar cflo-bar--${tone}`} aria-hidden="true">
            <span
              style={{ width: `${Math.max(0, upcomingShare * 100)}%` }}
              className="cflo-bar__upcoming"
            />
            <span
              style={{ width: `${Math.max(0, paidShare * 100)}%` }}
              className="cflo-bar__paid"
            />
          </div>
          <ul className="cflo-outlook__legend">
            <li>
              <span className="cflo-swatch cflo-swatch--upcoming" /> Upcoming:{' '}
              {formatFlowHeadline(
                tone === 'out' ? Money.from(upcoming.amount).times(-1) : upcoming.amount,
                currency,
              )}
            </li>
            <li>
              <span className="cflo-swatch cflo-swatch--paid" /> Paid:{' '}
              {formatFlowHeadline(
                tone === 'out' ? Money.from(paid.amount).times(-1) : paid.amount,
                currency,
              )}
            </li>
          </ul>
        </div>
        <table className="cflo-outlook__table">
          <thead>
            <tr>
              <th>Type</th>
              <th className="numeric">Qty</th>
              <th className="numeric">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className="numeric">{row.bucket.qty}</td>
                <td className="numeric">
                  {formatFlowHeadline(
                    tone === 'out' ? Money.from(row.bucket.amount).times(-1) : row.bucket.amount,
                    currency,
                  )}
                </td>
                <td className="cflo-outlook__action">
                  <RowAction
                    label={row.action.label}
                    href={row.action.href}
                    items={[{ label: row.action.label, href: row.action.href }]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function formatComingDate(iso: string): string {
  const months = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return `${months[month - 1] ?? iso} ${day}`;
}

function SwapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 7h11M18 7l-3-3M18 7l-3 3M17 17H6M6 17l3-3M6 17l3 3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
