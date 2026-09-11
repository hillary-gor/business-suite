/**
 * Shared interface primitives.
 *
 * The visual conventions here are chosen for people who reconcile accounts,
 * not for a marketing page:
 *
 *   - figures are right aligned and tabular, so digits line up in a column and
 *     a transposed number is visible at a glance
 *   - negatives are shown in brackets, which is what an accountant reads
 *   - a zero renders as an em dash, because a column of zeros hides the
 *     figures that matter
 *
 * None of this is decoration. A trial balance where the thousands column does
 * not align is a trial balance nobody checks.
 */
import type { ReactNode } from 'react';
import { formatMoney, formatQuantity, Money, type MoneyInput } from '@/lib/money';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p className="page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

/**
 * A monetary figure.
 *
 * `dash` renders zero as an em dash. On a trial balance that is what you want;
 * on a total that happens to be zero — a balanced difference, say — you want
 * to see the 0.00, because a dash there reads as "not calculated".
 */
export function Amount({
  value,
  currency,
  minorUnits = 2,
  dash = false,
  showCurrency = false,
  emphasis = false,
}: {
  value: MoneyInput | null | undefined;
  currency?: string;
  minorUnits?: number;
  dash?: boolean;
  showCurrency?: boolean;
  emphasis?: boolean;
}) {
  if (value === null || value === undefined) return <span className="figure figure--nil">—</span>;

  const money = Money.from(value);
  if (dash && money.isZero()) return <span className="figure figure--nil">—</span>;

  const classes = [
    'figure',
    money.isNegative() ? 'figure--negative' : '',
    emphasis ? 'figure--emphasis' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes}>{formatMoney(money, { currency, minorUnits, showCurrency })}</span>
  );
}

export function Quantity({ value }: { value: MoneyInput | null | undefined }) {
  if (value === null || value === undefined) return <span className="figure figure--nil">—</span>;
  return <span className="figure">{formatQuantity(value)}</span>;
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

/** Maps a period or document status to a colour. Closed is not a failure. */
export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'OPEN' || status === 'POSTED' || status === 'ACCEPTED'
      ? 'success'
      : status === 'CLOSED' || status === 'LOCKED'
        ? 'neutral'
        : status === 'FAILED' || status === 'REJECTED'
          ? 'danger'
          : status === 'PENDING' || status === 'DRAFT' || status === 'VALIDATED'
            ? 'warning'
            : 'info';

  return <Badge tone={tone}>{status.replace(/_/g, ' ').toLowerCase()}</Badge>;
}

export function Card({
  title,
  description,
  children,
  footer,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="card">
      {title ? (
        <div className="card__header">
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      ) : null}
      <div className="card__body">{children}</div>
      {footer ? <div className="card__footer">{footer}</div> : null}
    </section>
  );
}

/** A headline figure. Used sparingly; a wall of tiles is not a dashboard. */
export function Statistic({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  return (
    <div className={`statistic statistic--${tone}`}>
      <span className="statistic__label">{label}</span>
      <span className="statistic__value">{value}</span>
      {hint ? <span className="statistic__hint">{hint}</span> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <p className="empty-state__title">{title}</p>
      {description ? <p className="empty-state__description">{description}</p> : null}
      {action}
    </div>
  );
}

/**
 * An error a user can act on.
 *
 * Deliberately plain: the message from the database is usually the clearest
 * description of what went wrong, and dressing it up in reassuring language
 * makes it harder to act on.
 */
export function Alert({
  tone = 'danger',
  title,
  children,
}: {
  tone?: 'danger' | 'warning' | 'success' | 'info';
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`alert alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {title ? <p className="alert__title">{title}</p> : null}
      <div className="alert__body">{children}</div>
    </div>
  );
}

export function DataTable({ children, dense = false }: { children: ReactNode; dense?: boolean }) {
  return (
    <div className="table-wrapper">
      <table className={dense ? 'data-table data-table--dense' : 'data-table'}>{children}</table>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={error ? 'field field--error' : 'field'}>
      <label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="field__required" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? <p className="field__hint">{hint}</p> : null}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
