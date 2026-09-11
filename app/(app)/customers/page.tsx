import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { can, requireSession, resolveEntity } from '@/server/auth/session';
import { listCustomerHubOverview } from '@/server/modules/sales/hub';
import { Amount } from '@/components/ui';
import { Money } from '@/lib/money';
import { SURVEY_SETTINGS_HREF, parseHubOverviewRange } from '@/lib/customer-hub';
import { formatDisplayDate, last12MonthsRange, nairobiToday, thisYearRange } from '@/lib/payables';
import { PageFeedback } from '@/components/lists/list-chrome';
import { HubRangeSelect } from './hub-range';

export const metadata = { title: 'Customer Hub overview · SkyJet' };

export default async function CustomerHubOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await requireSession();
  const entity = await resolveEntity(session);
  const mayCustomers = can(session, entity.entityId, Permission.MastersManageCustomers);
  const mayInvoice = can(session, entity.entityId, Permission.SalesInvoiceCreate);
  const params = await searchParams;
  const range = parseHubOverviewRange(params.range);
  const today = nairobiToday();
  const bounds = range === 'thisYear' ? thisYearRange(today) : last12MonthsRange(today);
  const overview = await listCustomerHubOverview(
    { userId: session.userId, entityId: entity.entityId, requestId: session.requestId },
    { from: bounds.from, to: bounds.to, today },
  );
  const overdueZero = Money.from(overview.overdue.amount).isZero();

  return (
    <div className="hub-overview">
      <header className="hub-overview__head">
        <div className="hub-overview__title-row">
          <h1>Customer Hub overview</h1>
          <PageFeedback />
        </div>
        <p className="hub-overview__kicker">Customers at a glance</p>
      </header>

      <section className="hub-funnel" aria-label="Customers funnel">
        <div className="hub-funnel__bar">
          <h2>Customers funnel</h2>
          <HubRangeSelect range={range} />
        </div>
        <div className="hub-funnel__stages">
          <FunnelStage
            label="Open opportunities"
            count={overview.funnel.opportunities}
            href="/customers/opportunities"
            action="View open opportunities"
          />
          <FunnelArrow />
          <FunnelStage
            label="Open estimates"
            count={overview.funnel.estimates}
            href="/sales/estimates"
            action="view estimates"
          />
          <FunnelArrow />
          <FunnelStage
            label="Open contracts"
            count={overview.funnel.contracts}
            href="/customers/contracts"
            action="view contracts (coming soon)"
          />
          <FunnelArrow />
          <FunnelStage
            label="In progress projects"
            count={overview.funnel.projects}
            href="/customers/projects"
            action="view projects (coming soon)"
          />
          <FunnelArrow />
          <FunnelStage
            label="Unpaid invoices"
            count={overview.funnel.unpaidInvoices}
            href="/sales/invoices?status=unpaid"
            action="view unpaid invoices"
          />
          <FunnelArrow />
          <FunnelStage
            label="Reviews"
            count={overview.funnel.reviews}
            href="/customers/reviews"
            action="view reviews"
          />
        </div>
      </section>

      <div className="hub-overview__mid">
        <article className="hub-card">
          <h3>Overdue invoices</h3>
          <p>
            You have{' '}
            <strong>
              <Amount value={overview.overdue.amount} currency={entity.baseCurrency} showCurrency />
            </strong>{' '}
            in invoices that are overdue.
            {overdueZero ? ' Create an invoice for your next job!' : null}
          </p>
          <div className="hub-card__footer">
            {mayInvoice ? (
              <Link href="/sales/invoices/new" className="button hub-card__btn">
                Create an invoice
              </Link>
            ) : (
              <Link href="/sales/invoices" className="button hub-card__btn">
                View invoices
              </Link>
            )}
          </div>
        </article>

        <article className="hub-card">
          <header className="hub-card__head">
            <div>
              <h3>Open estimates</h3>
              <p className="hub-card__sub">Potential cash leads</p>
            </div>
            <span className="hub-card__when">As of today</span>
          </header>
          <p className="hub-card__figure">
            <Amount
              value={overview.openEstimates.amount}
              currency={entity.baseCurrency}
              showCurrency
            />
          </p>
          {overview.openEstimates.rows.length === 0 ? (
            <p className="hub-card__empty">No open estimates. Send a quote before you invoice.</p>
          ) : (
            <table className="hub-card__table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Date</th>
                  <th className="numeric">Amount</th>
                </tr>
              </thead>
              <tbody>
                {overview.openEstimates.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.customer_name}</td>
                    <td>{formatDisplayDate(row.quotation_date)}</td>
                    <td className="numeric">
                      <Amount value={row.total} currency={row.currency_code} showCurrency />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="hub-card__footer">
            <Link href="/sales/estimates">View estimates</Link>
          </div>
        </article>

        <article className="hub-card">
          <h3>Needs attention</h3>
          <table className="hub-card__table hub-card__table--tasks">
            <thead>
              <tr>
                <th>Task</th>
                <th>Assigned to</th>
                <th>Due date</th>
                <th>Actions</th>
              </tr>
            </thead>
          </table>
          <div className="hub-caught-up">
            <CaughtUpIcon />
            <p>
              <strong>You&apos;re caught up!</strong>
            </p>
            <p>You don&apos;t have any tasks to do. Check back soon to stay on top of things.</p>
          </div>
          <div className="hub-card__footer">
            <span className="hub-card__muted">Show all</span>
          </div>
        </article>
      </div>

      <div className="hub-overview__lower">
        <article className="hub-card">
          <h3>Work requests</h3>
          <p className="hub-card__sub">Drive repeat business using the post-invoice survey</p>
          <div className="hub-survey-preview">
            <span className="hub-survey-preview__avatar" aria-hidden="true">
              +
            </span>
            <p>A customer wants to work with you again</p>
          </div>
          <div className="hub-card__footer">
            <Link href={SURVEY_SETTINGS_HREF} className="button hub-card__btn">
              Manage survey settings
            </Link>
          </div>
        </article>

        <article className="hub-card">
          <h3>Referrals</h3>
          <p className="hub-card__sub">Generate referrals using the post-invoice survey</p>
          <div className="hub-survey-preview">
            <span className="hub-survey-preview__avatar" aria-hidden="true">
              +
            </span>
            <p>You&apos;ve received a new referral</p>
          </div>
          <div className="hub-card__footer">
            <Link href={SURVEY_SETTINGS_HREF} className="button hub-card__btn">
              Manage survey settings
            </Link>
          </div>
        </article>

        <article className="hub-card">
          <h3>Reviews &amp; testimonials</h3>
          <p className="hub-card__sub">Collect feedback using the post-invoice survey</p>
          <div className="hub-survey-preview">
            <p className="hub-survey-preview__stars" aria-label="Five stars">
              ★★★★★
            </p>
            <p>You&apos;ve received some feedback</p>
          </div>
          <div className="hub-card__footer">
            <Link href={SURVEY_SETTINGS_HREF} className="button hub-card__btn">
              Manage survey settings
            </Link>
          </div>
        </article>

        <article className="hub-card">
          <h3>Shortcuts</h3>
          <div className="hub-shortcuts">
            {mayCustomers ? (
              <Link href="/sales/customers/new" className="hub-shortcut">
                <ShortcutPersonPlus />
                New customer
              </Link>
            ) : (
              <span className="hub-shortcut hub-shortcut--disabled">
                <ShortcutPersonPlus />
                New customer
              </span>
            )}
            <span className="hub-shortcut hub-shortcut--disabled" title="Not yet built">
              <ShortcutPeoplePlus />
              Import customers
            </span>
            {mayInvoice ? (
              <Link href="/sales/invoices/new" className="hub-shortcut">
                <ShortcutDocPlus />
                Create invoice
              </Link>
            ) : (
              <span className="hub-shortcut hub-shortcut--disabled">
                <ShortcutDocPlus />
                Create invoice
              </span>
            )}
            {mayCustomers ? (
              <Link href="/sales/customers" className="hub-shortcut">
                <ShortcutList />
                View customers
              </Link>
            ) : (
              <span className="hub-shortcut hub-shortcut--disabled">
                <ShortcutList />
                View customers
              </span>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}

function FunnelStage({
  label,
  count,
  href,
  action,
}: {
  label: string;
  count: string;
  href: string;
  action?: string;
}) {
  return (
    <article className="hub-funnel__stage">
      <h3>{label}</h3>
      <p className="hub-funnel__count">
        <Link href={href}>{count}</Link>
      </p>
      {action ? <Link href={href}>{action}</Link> : null}
    </article>
  );
}

function FunnelArrow() {
  return (
    <span className="hub-funnel__arrow" aria-hidden="true">
      ›
    </span>
  );
}

function CaughtUpIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 21.2 17.2 26.2 28 14.8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShortcutPersonPlus() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10" cy="8" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M4.2 19c0-2.8 2.5-4.6 5.8-4.6 1.1 0 2.1.2 3 .6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path d="M18 11v6M15 14h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ShortcutPeoplePlus() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="2.6" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M3.8 19c0-2.5 2.2-4.1 5.2-4.1s5.2 1.6 5.2 4.1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="16.5" cy="9" r="2.1" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M19.2 12.5v4M17.2 14.5h4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShortcutDocPlus() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 4.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V6A1.5 1.5 0 0 1 7 4.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M14 4.5V9h4.5M12 13v5M9.5 15.5h5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShortcutList() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="4" width="14" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M8 9h8M8 12.5h8M8 16h5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
