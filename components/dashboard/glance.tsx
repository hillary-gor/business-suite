import Link from 'next/link';
import type { ReactNode } from 'react';
import { Amount } from '@/components/ui';
import { formatMoney, Money } from '@/lib/money';

export function GlanceCard({
  kicker,
  when,
  caption,
  figure,
  meta,
  tone = 'neutral',
  children,
  footer,
}: {
  kicker: string;
  when?: string;
  caption?: string;
  figure: ReactNode;
  meta?: ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad';
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <article className={`glance-card glance-card--${tone}`}>
      <header className="glance-card__kicker">
        <span className="glance-card__kicker-label">
          <span className={`glance-pip glance-pip--${tone}`} aria-hidden="true" />
          {kicker}
        </span>
        {when ? <span className="glance-card__when">{when}</span> : null}
      </header>
      {caption ? <p className="glance-card__caption">{caption}</p> : null}
      <div className="glance-card__figure">{figure}</div>
      {meta ? <p className="glance-card__meta">{meta}</p> : null}
      {children ? <div className="glance-card__visual">{children}</div> : null}
      {footer ? <footer className="glance-card__footer">{footer}</footer> : null}
    </article>
  );
}

export function PairBars({
  left,
  right,
}: {
  left: { label: string; amount: Money };
  right: { label: string; amount: Money };
}) {
  const peak = left.amount.comparedTo(right.amount) >= 0 ? left.amount : right.amount;
  return (
    <div className="glance-bars">
      <BarRow label={left.label} amount={left.amount} peak={peak} fill="var(--brand)" />
      <BarRow label={right.label} amount={right.amount} peak={peak} fill="var(--positive)" />
    </div>
  );
}

function BarRow({
  label,
  amount,
  peak,
  fill,
}: {
  label: string;
  amount: Money;
  peak: Money;
  fill: string;
}) {
  const width = peak.isZero() ? 0 : integerPercent(amount.abs(), peak.abs());
  return (
    <div className="glance-bar">
      <div className="glance-bar__label">{label}</div>
      <div className="glance-bar__track">
        <span className="glance-bar__fill" style={{ width: `${width}%`, background: fill }} />
      </div>
      <div className="glance-bar__value">
        <Amount value={amount} />
      </div>
    </div>
  );
}

const SLICE_COLOURS = ['#0071e3', '#5ac8fa', '#248a3d', '#86868b', '#d2d2d7'];

export function ShareList({
  items,
  total,
}: {
  items: ReadonlyArray<{ id: string; label: string; amount: Money }>;
  total: Money;
}) {
  if (items.length === 0 || total.isZero()) {
    return <p className="glance-empty">No spending in this period.</p>;
  }

  const top = items.slice(0, 4);
  const rest = items.slice(4);
  const restTotal = Money.sum(rest.map((item) => item.amount));
  const slices = rest.length > 0 ? [...top, { id: 'other', label: 'Other', amount: restTotal }] : top;
  const weights = slices.map((slice) => (slice.amount.isPositive() ? slice.amount : Money.zero()));
  if (weights.every((weight) => weight.isZero())) {
    return <p className="glance-empty">No spending in this period.</p>;
  }
  const degrees = Money.from(360).allocate(weights, 0);

  let cursor = 0;
  const stops: string[] = [];
  slices.forEach((slice, index) => {
    const span = Number(degrees[index]?.toString() ?? '0');
    const colour = SLICE_COLOURS[index] ?? '#d2d2d7';
    stops.push(`${colour} ${cursor}deg ${cursor + span}deg`);
    cursor += span;
  });

  return (
    <div className="glance-share">
      <div
        className="glance-donut"
        style={{ background: `conic-gradient(${stops.join(', ')})` }}
        aria-hidden="true"
      />
      <ul className="glance-share__list">
        {slices.map((slice, index) => (
          <li key={slice.id}>
            <span className="glance-share__swatch" style={{ background: SLICE_COLOURS[index] }} />
            <span className="glance-share__name">{slice.label}</span>
            <span className="glance-share__amt">
              <Amount value={slice.amount} />
              <span className="glance-share__pct">{integerPercent(slice.amount, total)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const AR_BUCKETS = [
  { key: 'current', label: 'Current', colour: '#248a3d' },
  { key: '1-30', label: '1–30', colour: '#0071e3' },
  { key: '31-60', label: '31–60', colour: '#5ac8fa' },
  { key: '61-90', label: '61–90', colour: '#b25000' },
  { key: '90+', label: '90+', colour: '#de071c' },
] as const;

export function AgeStrip({
  buckets,
}: {
  buckets: ReadonlyArray<{ bucket: string; outstanding: string }>;
}) {
  const totals = AR_BUCKETS.map((meta) => ({
    ...meta,
    amount: Money.sum(buckets.filter((row) => row.bucket === meta.key).map((row) => row.outstanding)),
  }));
  const grand = Money.sum(totals.map((row) => row.amount));

  if (grand.isZero()) {
    return <p className="glance-empty">No open invoices.</p>;
  }

  const widths = Money.from(100).allocate(
    totals.map((row) => (row.amount.isPositive() ? row.amount : Money.zero())),
    0,
  );

  return (
    <div className="glance-age">
      <div className="glance-age__bar" aria-hidden="true">
        {totals.map((row, index) => {
          const width = Number(widths[index]?.toString() ?? '0');
          if (width <= 0) return null;
          return <span key={row.key} style={{ width: `${width}%`, background: row.colour }} />;
        })}
      </div>
      <ul className="glance-age__legend">
        {totals.map((row) => (
          <li key={row.key}>
            <span className="glance-share__swatch" style={{ background: row.colour }} />
            <span>{row.label}</span>
            <Amount value={row.amount} dash />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BankList({
  accounts,
}: {
  accounts: ReadonlyArray<{ id: string; name: string; controlType: string; balance: string }>;
}) {
  if (accounts.length === 0) {
    return <p className="glance-empty">No cash or bank accounts on the chart.</p>;
  }

  return (
    <ul className="glance-accounts">
      {accounts.map((account) => (
        <li key={account.id}>
          <Link href={`/accounting/ledger/${account.id}`} className="glance-accounts__row">
            <span className="glance-accounts__mark" data-kind={account.controlType.toLowerCase()}>
              {account.controlType === 'CASH' ? 'C' : 'B'}
            </span>
            <span className="glance-accounts__name">{account.name}</span>
            <Amount value={account.balance} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function expenseChange(current: Money, prior: Money): { text: string; tone: 'up' | 'down' | 'flat' } | null {
  if (current.isZero() && prior.isZero()) return null;
  if (prior.isZero() && current.isPositive()) {
    return { text: 'First spending this period', tone: 'up' };
  }
  if (current.equals(prior)) return { text: 'Same as the prior period', tone: 'flat' };

  const pct = integerPercent(current.minus(prior).abs(), prior.abs());
  if (current.comparedTo(prior) > 0) {
    return { text: `Up ${pct}% from the prior period`, tone: 'up' };
  }
  return { text: `Down ${pct}% from the prior period`, tone: 'down' };
}

export function integerPercent(part: Money, whole: Money): number {
  if (whole.isZero()) return 0;
  return Number(part.times(100).dividedBy(whole).round(0).toString());
}

export function moneyFigure(value: Money, currency: string): string {
  return formatMoney(value, { currency, showCurrency: true });
}
