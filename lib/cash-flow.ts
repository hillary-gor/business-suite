/**
 * Cash flow overview — window, projection and display helpers.
 *
 * Figures on the page come from posted cash accounts, open invoices and open
 * bills. Bank feeds are not in this version; the left-hand list is the chart
 * of cash and bank accounts, not a live feed.
 */
import { displayCurrency } from '@/lib/inventory-overview';
import { formatMoney, Money, type MoneyInput } from '@/lib/money';
import { addDays } from '@/lib/payables';
import { monthShort, monthsInRange } from '@/lib/performance-centre';

export const CASH_FLOW_RANGES = [3, 6, 12] as const;
export type CashFlowRange = (typeof CASH_FLOW_RANGES)[number];

export const SUGGESTED_BANKS = [
  { id: 'equity', name: 'Equity Bank', mark: 'EQ' },
  { id: 'kcb', name: 'KCB', mark: 'KCB' },
  { id: 'coop', name: 'Co-operative Bank', mark: 'CO' },
  { id: 'absa', name: 'Absa', mark: 'AB' },
  { id: 'stanbic', name: 'Stanbic', mark: 'ST' },
  { id: 'ncba', name: 'NCBA', mark: 'NC' },
] as const;

export type CashFlowBucket = {
  qty: number;
  amount: string;
};

export type CashFlowLine = {
  id: string;
  date: string;
  party: string;
  kind: 'Invoice' | 'Bill';
  amount: string;
  href: string;
};

export type CashFlowAccount = {
  id: string;
  name: string;
  balance: string;
};

export type CashFlowMonth = {
  key: string;
  actualBalance: string;
  moneyIn: string;
  moneyOut: string;
};

export type CashFlowScheduled = {
  date: string;
  amount: string;
  direction: 'in' | 'out';
};

export type CashFlowPayload = {
  today: string;
  todayBalance: string;
  accounts: CashFlowAccount[];
  months: CashFlowMonth[];
  moneyIn: {
    overdueInvoices: CashFlowBucket;
    openInvoices: CashFlowBucket;
    undeposited: CashFlowBucket;
    invoicePayments: CashFlowBucket;
    salesReceipts: CashFlowBucket;
  };
  moneyOut: {
    overdueBills: CashFlowBucket;
    openBills: CashFlowBucket;
    billPayments: CashFlowBucket;
    paidExpenses: CashFlowBucket;
  };
  scheduled: CashFlowScheduled[];
  comingUp: CashFlowLine[];
};

export type CashFlowChartPoint = {
  key: string;
  label: string;
  actual: string | null;
  projected: string;
  moneyIn: string;
  moneyOut: string;
  future: boolean;
};

function monthStart(yyyyMm: string): string {
  return `${yyyyMm}-01`;
}

function shiftMonth(yyyyMm: string, delta: number): string {
  const year = Number(yyyyMm.slice(0, 4));
  const month = Number(yyyyMm.slice(5, 7));
  const index = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}

/** Last calendar day of YYYY-MM. */
export function monthEnd(yyyyMm: string): string {
  return addDays(monthStart(shiftMonth(yyyyMm, 1)), -1);
}

/**
 * A window that includes the current month, a few projected months, and the
 * rest as history — matching the 12-month board that shows Dec through Nov
 * when today is in September.
 */
export function cashFlowWindow(months: CashFlowRange, today: string): string[] {
  const future = months === 12 ? 2 : months === 6 ? 1 : 0;
  const past = months - 1 - future;
  const current = today.slice(0, 7);
  const from = shiftMonth(current, -past);
  const to = shiftMonth(current, future);
  return monthsInRange(monthStart(from), monthEnd(to));
}

export function cashFlowMonthLabel(yyyyMm: string): string {
  return `${monthShort(yyyyMm)} '${yyyyMm.slice(2, 4)}`;
}

export function parseCashFlowRange(raw: string | undefined): CashFlowRange {
  const value = Number(raw);
  return CASH_FLOW_RANGES.includes(value as CashFlowRange) ? (value as CashFlowRange) : 12;
}

function emptyBucket(): CashFlowBucket {
  return { qty: 0, amount: '0' };
}

export function emptyCashFlowPayload(today: string): CashFlowPayload {
  return {
    today,
    todayBalance: '0',
    accounts: [],
    months: cashFlowWindow(12, today).map((key) => ({
      key,
      actualBalance: '0',
      moneyIn: '0',
      moneyOut: '0',
    })),
    moneyIn: {
      overdueInvoices: emptyBucket(),
      openInvoices: emptyBucket(),
      undeposited: emptyBucket(),
      invoicePayments: emptyBucket(),
      salesReceipts: emptyBucket(),
    },
    moneyOut: {
      overdueBills: emptyBucket(),
      openBills: emptyBucket(),
      billPayments: emptyBucket(),
      paidExpenses: emptyBucket(),
    },
    scheduled: [],
    comingUp: [],
  };
}

function remainingFromToday(
  items: readonly CashFlowScheduled[],
  key: string,
  today: string,
  direction: 'in' | 'out',
): Money {
  const current = today.slice(0, 7);
  return Money.sum(
    items
      .filter((item) => {
        if (item.direction !== direction) return false;
        if (item.date < today) return key === current;
        return item.date.slice(0, 7) === key;
      })
      .map((item) => item.amount),
  );
}

export function buildCashFlowSeries(
  payload: Pick<CashFlowPayload, 'today' | 'todayBalance' | 'months' | 'scheduled'>,
  range: CashFlowRange,
): CashFlowChartPoint[] {
  const keys = cashFlowWindow(range, payload.today);
  const current = payload.today.slice(0, 7);
  const byMonth = new Map(payload.months.map((row) => [row.key, row]));
  let running = Money.from(payload.todayBalance);

  return keys.map((key) => {
    const row = byMonth.get(key);
    const future = key > current;
    const isCurrent = key === current;
    const moneyIn = future
      ? remainingFromToday(payload.scheduled, key, payload.today, 'in')
      : Money.from(row?.moneyIn ?? '0');
    const moneyOut = future
      ? remainingFromToday(payload.scheduled, key, payload.today, 'out')
      : Money.from(row?.moneyOut ?? '0');

    let actual: string | null = null;
    let projected: string;

    if (future) {
      running = running
        .plus(remainingFromToday(payload.scheduled, key, payload.today, 'in'))
        .minus(remainingFromToday(payload.scheduled, key, payload.today, 'out'));
      projected = running.toDecimal().toString();
    } else if (isCurrent) {
      actual = payload.todayBalance;
      running = Money.from(payload.todayBalance)
        .plus(remainingFromToday(payload.scheduled, key, payload.today, 'in'))
        .minus(remainingFromToday(payload.scheduled, key, payload.today, 'out'));
      projected = running.toDecimal().toString();
    } else {
      actual = row?.actualBalance ?? '0';
      projected = actual;
    }

    return {
      key,
      label: cashFlowMonthLabel(key),
      actual,
      projected,
      moneyIn: moneyIn.toDecimal().toString(),
      moneyOut: moneyOut.toDecimal().toString(),
      future,
    };
  });
}

export function outlookTotal(upcoming: CashFlowBucket, paid: CashFlowBucket): Money {
  return Money.from(upcoming.amount).plus(paid.amount);
}

export function moneyInUpcoming(payload: CashFlowPayload): CashFlowBucket {
  const overdue = payload.moneyIn.overdueInvoices;
  const open = payload.moneyIn.openInvoices;
  return {
    qty: overdue.qty + open.qty,
    amount: Money.from(overdue.amount).plus(open.amount).toDecimal().toString(),
  };
}

export function moneyInPaid(payload: CashFlowPayload): CashFlowBucket {
  const payments = payload.moneyIn.invoicePayments;
  const receipts = payload.moneyIn.salesReceipts;
  const undeposited = payload.moneyIn.undeposited;
  return {
    qty: payments.qty + receipts.qty + undeposited.qty,
    amount: Money.from(payments.amount)
      .plus(receipts.amount)
      .plus(undeposited.amount)
      .toDecimal()
      .toString(),
  };
}

export function moneyOutUpcoming(payload: CashFlowPayload): CashFlowBucket {
  const overdue = payload.moneyOut.overdueBills;
  const open = payload.moneyOut.openBills;
  return {
    qty: overdue.qty + open.qty,
    amount: Money.from(overdue.amount).plus(open.amount).toDecimal().toString(),
  };
}

export function moneyOutPaid(payload: CashFlowPayload): CashFlowBucket {
  const payments = payload.moneyOut.billPayments;
  const expenses = payload.moneyOut.paidExpenses;
  return {
    qty: payments.qty + expenses.qty,
    amount: Money.from(payments.amount).plus(expenses.amount).toDecimal().toString(),
  };
}

export function barShare(part: MoneyInput, total: MoneyInput): number {
  const whole = Money.from(total);
  if (!whole.isPositive()) return 0;
  return Number(Money.from(part).dividedBy(whole).toDecimal().toFixed(6));
}

/** Headline figures on the board, QBO-style: Ksh5,000 / -Ksh8,000. */
export function formatFlowHeadline(amount: MoneyInput, currency: string): string {
  const money = Money.from(amount);
  const code = displayCurrency(currency);
  const body = formatMoney(money.abs(), { minorUnits: 0 });
  return money.isNegative() ? `-${code}${body}` : `${code}${body}`;
}

/** Line items keep cents: Ksh4,000.00 / Ksh-4,000.00. */
export function formatFlowLine(amount: MoneyInput, currency: string): string {
  const money = Money.from(amount);
  const code = displayCurrency(currency);
  const body = formatMoney(money.abs(), { minorUnits: 2 });
  return money.isNegative() ? `${code}-${body}` : `${code}${body}`;
}
