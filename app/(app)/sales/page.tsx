import Link from 'next/link';
import type { ReactNode } from 'react';
import { Permission } from '@/server/auth/permissions';
import { can, requireSession, resolveEntity } from '@/server/auth/session';
import { PermissionDeniedError } from '@/server/db/errors';
import { Amount } from '@/components/ui';
import { Money } from '@/lib/money';
import { formatDisplayDate, nairobiToday } from '@/lib/payables';
import { getSalesOverview } from '@/server/modules/sales/overview';
import {
  barSharePercent,
  monthYearLabel,
  paidWindow,
  parseComparePriorYear,
  parseSalesIncomeRange,
  salesIncomeBounds,
  salesIncomeRangeLabel,
  shiftYears,
  unpaidWindow,
} from '@/lib/sales-overview';
import { IncomeChart } from './income-chart';
import { SalesIncomeControls } from './income-controls';

export const metadata = { title: 'Sales & Get Paid overview · SkyJet' };

export default async function SalesOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ income?: string; compare?: string }>;
}) {
  const session = await requireSession();
  const entity = await resolveEntity(session);
  const mayInvoice = can(session, entity.entityId, Permission.SalesInvoiceCreate);
  const mayPay = can(session, entity.entityId, Permission.SalesPaymentCreate);
  const mayCustomers = can(session, entity.entityId, Permission.MastersManageCustomers);
  const mayItems = can(session, entity.entityId, Permission.MastersManageItems);
  if (!mayInvoice && !mayPay && !mayCustomers) {
    throw new PermissionDeniedError(
      'You do not have permission to do that (sales.invoice.create, sales.payment.create or masters.manage_customers required)',
    );
  }

  const params = await searchParams;
  const incomeRange = parseSalesIncomeRange(params.income);
  const compare = parseComparePriorYear(params.compare);
  const today = nairobiToday();
  const incomeBounds = salesIncomeBounds(incomeRange, today);
  const unpaid = unpaidWindow(today);
  const paid = paidWindow(today);
  const data = await getSalesOverview(
    { userId: session.userId, entityId: entity.entityId, requestId: session.requestId },
    {
      incomeFrom: incomeBounds.from,
      incomeTo: incomeBounds.to,
      unpaidFrom: unpaid.from,
      unpaidTo: unpaid.to,
      paidFrom: paid.from,
      paidTo: paid.to,
      today,
      compareFrom: compare ? shiftYears(incomeBounds.from, -1) : undefined,
      compareTo: compare ? shiftYears(incomeBounds.to, -1) : undefined,
    },
  );

  const incomeTotal = Money.sum(data.income.map((row) => row.amount));
  const priorTotal = Money.sum(data.prior.map((row) => row.amount));
  const incomeDelta = incomeTotal.minus(priorTotal);
  const unpaidTotal = Money.from(data.unpaid.overdue).plus(data.unpaid.not_due);
  const paidTotal = Money.from(data.paid.amount);
  const priorLabel = monthYearLabel(shiftYears(incomeBounds.from, -1));
  const currency = entity.baseCurrency;

  return (
    <div className="sales-ov">
      <header className="sales-ov__head">
        <h1>Sales &amp; Get Paid overview</h1>
      </header>

      <section className="sales-ov__card" aria-labelledby="sales-quick-actions">
        <header className="sales-ov__card-head">
          <h2 id="sales-quick-actions" className="sales-ov__card-title">
            Quick actions
          </h2>
        </header>
        <p className="sales-ov__kicker">Money in</p>
        <div className="sales-ov__actions">
          <QuickAction
            href={mayCustomers ? '/sales/customers/new' : undefined}
            label="Customer"
            icon={<IconPerson />}
            plus
          />
          <QuickAction
            href={mayItems ? '/inventory/items/new' : undefined}
            label="Product or service"
            icon={<IconBag />}
            plus
          />
          <QuickAction
            href={mayInvoice ? '/sales/estimates/new' : undefined}
            label="Estimate"
            icon={<IconDoc />}
            plus
          />
          <QuickAction
            href={mayInvoice ? '/sales/invoices/new' : undefined}
            label="Invoice"
            icon={<IconDoc />}
            plus
          />
          <QuickAction label="Recurring invoice" icon={<IconRecurring />} unavailable />
          <QuickAction
            href={mayPay ? '/sales/payments/new' : undefined}
            label="Receive payment"
            icon={<IconPayment />}
            plus
          />
          <QuickAction
            href={mayInvoice ? '/sales/receipts/new' : undefined}
            label="Sales receipt"
            icon={<IconDoc />}
            plus
          />
          <QuickAction label="Bank deposit" icon={<IconBank />} unavailable />
          <QuickAction
            href={mayInvoice ? '/sales/statements' : undefined}
            label="Create statement"
            icon={<IconStatement />}
            plus
          />
          <QuickAction label="Lead" icon={<IconLead />} unavailable />
          <QuickAction label="Contract" icon={<IconContract />} unavailable />
        </div>
      </section>

      <section className="sales-ov__card" aria-labelledby="sales-income">
        <header className="sales-ov__card-head">
          <h2 id="sales-income">Income over time</h2>
        </header>
        <div className="sales-ov__income-toolbar">
          <p className="sales-ov__as-of">As of {formatDisplayDate(today)}</p>
          <SalesIncomeControls range={incomeRange} compare={compare} />
        </div>
        <p className="sales-ov__income-total">
          <Amount value={incomeTotal} currency={currency} showCurrency />
          <span> {salesIncomeRangeLabel(incomeRange)}</span>
        </p>
        {compare ? (
          <p
            className={
              incomeDelta.isNegative()
                ? 'sales-ov__delta is-down'
                : incomeDelta.isZero()
                  ? 'sales-ov__delta'
                  : 'sales-ov__delta is-up'
            }
          >
            {incomeDelta.isZero() ? (
              <>Same as {priorLabel}</>
            ) : incomeDelta.isNegative() ? (
              <>
                ↓ <Amount value={incomeDelta.abs()} currency={currency} showCurrency /> less than{' '}
                {priorLabel}
              </>
            ) : (
              <>
                ↑ <Amount value={incomeDelta.abs()} currency={currency} showCurrency /> more than{' '}
                {priorLabel}
              </>
            )}
          </p>
        ) : null}
        <IncomeChart
          series={data.income}
          prior={compare ? data.prior : undefined}
          currency={currency}
        />
      </section>

      <section className="sales-ov__card" aria-labelledby="sales-invoices">
        <header className="sales-ov__card-head">
          <h2 id="sales-invoices">Invoices</h2>
        </header>
        <div className="sales-ov__invoice-cols">
          <article>
            <p className="sales-ov__bucket-total">
              <Amount value={unpaidTotal} currency={currency} showCurrency /> Unpaid
              <span className="sales-ov__bucket-when"> Last 365 days</span>
            </p>
            <div className="sales-ov__bucket-split">
              <p>
                <Amount value={data.unpaid.overdue} currency={currency} showCurrency />
                <span> Overdue</span>
              </p>
              <p>
                <Amount value={data.unpaid.not_due} currency={currency} showCurrency />
                <span> Not due yet</span>
              </p>
            </div>
            <InvoiceBar
              left={data.unpaid.overdue}
              right={data.unpaid.not_due}
              leftClass="is-overdue"
              rightClass="is-unpaid"
            />
            <Link className="sales-ov__bucket-link" href="/sales/invoices?status=unpaid">
              View unpaid invoices
            </Link>
          </article>
          <article>
            <p className="sales-ov__bucket-total">
              <Amount value={paidTotal} currency={currency} showCurrency /> Paid
              <span className="sales-ov__bucket-when"> Last 30 days</span>
            </p>
            <div className="sales-ov__bucket-split">
              <p>
                <Amount value="0" currency={currency} showCurrency />
                <span> Not deposited</span>
              </p>
              <p>
                <Amount value={paidTotal} currency={currency} showCurrency />
                <span> Deposited</span>
              </p>
            </div>
            <InvoiceBar
              left="0"
              right={paidTotal.toDatabase()}
              leftClass="is-undeposited"
              rightClass="is-paid"
            />
            <p className="sales-ov__note">
              Posted receipts go to a bank or cash account, so they show as deposited. There is no
              undeposited-funds step yet.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}

function InvoiceBar({
  left,
  right,
  leftClass,
  rightClass,
}: {
  left: string;
  right: string;
  leftClass: string;
  rightClass: string;
}) {
  const total = Money.from(left).plus(right);
  return (
    <div className="sales-ov__bar" aria-hidden="true">
      <span
        className={`sales-ov__bar-fill ${leftClass}`}
        style={{ width: `${barSharePercent(left, total.toDatabase())}%` }}
      />
      <span
        className={`sales-ov__bar-fill ${rightClass}`}
        style={{ width: `${barSharePercent(right, total.toDatabase())}%` }}
      />
    </div>
  );
}

function QuickAction({
  href,
  label,
  icon,
  plus = false,
  unavailable = false,
}: {
  href?: string;
  label: string;
  icon: ReactNode;
  plus?: boolean;
  unavailable?: boolean;
}) {
  if (!href) {
    return (
      <span
        className="sales-ov__action is-disabled"
        title={unavailable ? 'Not in this version' : 'You do not have permission'}
      >
        <span className="sales-ov__action-icon">{icon}</span>
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className="sales-ov__action">
      <span className="sales-ov__action-icon">
        {icon}
        {plus ? (
          <span className="sales-ov__action-plus" aria-hidden="true">
            +
          </span>
        ) : null}
      </span>
      {label}
    </Link>
  );
}

function IconPerson() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M5 19c0-3 2.8-5 7-5s7 2 7 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBag() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 8h12l-1 11H7L6 8Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M9 8V7a3 3 0 0 1 6 0v1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconDoc() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 4.5h7l4 4V19A1.5 1.5 0 0 1 16.5 20.5H7A1.5 1.5 0 0 1 5.5 19V6A1.5 1.5 0 0 1 7 4.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 4.5V9h4.5" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

function IconRecurring() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 4.5h7l4 4V19A1.5 1.5 0 0 1 16.5 20.5H7A1.5 1.5 0 0 1 5.5 19V6A1.5 1.5 0 0 1 7 4.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 14.5a2.5 2.5 0 0 1 4.2-1.8M14.5 12.5A2.5 2.5 0 0 1 10.3 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPayment() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="6" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M4 10h16" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 12.5v4M10 14.5h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBank() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10h16" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 5 4 10h16L12 5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M6 10v7M10 10v7M14 10v7M18 10v7" stroke="currentColor" strokeWidth="1.75" />
      <path d="M4 17h16" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconStatement() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 4.5h7l4 4V19A1.5 1.5 0 0 1 16.5 20.5H7A1.5 1.5 0 0 1 5.5 19V6A1.5 1.5 0 0 1 7 4.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M9 12h6M9 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconLead() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10" cy="8" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M4 19c0-2.8 2.4-4.8 6-4.8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path d="M17 10v6M14 13h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconContract() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 4.5h7l4 4V19A1.5 1.5 0 0 1 16.5 20.5H7A1.5 1.5 0 0 1 5.5 19V6A1.5 1.5 0 0 1 7 4.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M9 13h6M9 16h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
