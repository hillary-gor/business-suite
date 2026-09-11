import { Money } from '@/lib/money';
import { addDays, nairobiToday } from '@/lib/payables';

export type SalesIncomeRange = 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'thisYear';

export function parseSalesIncomeRange(raw: string | undefined): SalesIncomeRange {
  if (raw === 'lastMonth' || raw === 'thisQuarter' || raw === 'thisYear') return raw;
  return 'thisMonth';
}

export function salesIncomeRangeLabel(range: SalesIncomeRange): string {
  switch (range) {
    case 'lastMonth':
      return 'Last month';
    case 'thisQuarter':
      return 'This quarter';
    case 'thisYear':
      return 'This year';
    default:
      return 'This month';
  }
}

export function parseComparePriorYear(raw: string | undefined): boolean {
  return raw === '1' || raw === 'true';
}

function utcDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function salesIncomeBounds(
  range: SalesIncomeRange,
  today = nairobiToday(),
): { from: string; to: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (range === 'thisYear') {
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  if (range === 'lastMonth') {
    const priorMonth = month === 1 ? 12 : month - 1;
    const priorYear = month === 1 ? year - 1 : year;
    return {
      from: utcDate(priorYear, priorMonth, 1),
      to: utcDate(priorYear, priorMonth, lastDayOfMonth(priorYear, priorMonth)),
    };
  }
  if (range === 'thisQuarter') {
    const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
    const endMonth = startMonth + 2;
    return {
      from: utcDate(year, startMonth, 1),
      to: utcDate(year, endMonth, lastDayOfMonth(year, endMonth)),
    };
  }
  return {
    from: utcDate(year, month, 1),
    to: utcDate(year, month, lastDayOfMonth(year, month)),
  };
}

export function shiftYears(iso: string, years: number): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const last = lastDayOfMonth(year + years, month);
  return utcDate(year + years, month, Math.min(day, last));
}

export function monthYearLabel(iso: string): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const month = Number(iso.slice(5, 7));
  return `${months[month - 1] ?? iso}, ${iso.slice(0, 4)}`;
}

export function chartDayLabel(iso: string): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const month = Number(iso.slice(5, 7));
  return `${months[month - 1] ?? ''} ${iso.slice(8, 10)}`;
}

export function lastDaysBounds(days: number, today = nairobiToday()): { from: string; to: string } {
  return { from: addDays(today, -days), to: today };
}

export function unpaidWindow(today = nairobiToday()): { from: string; to: string } {
  return lastDaysBounds(365, today);
}

export function paidWindow(today = nairobiToday()): { from: string; to: string } {
  return lastDaysBounds(30, today);
}

/** Monday–Sunday week that contains `today`, including days still ahead. */
export function isoWeekBounds(today = nairobiToday()): { from: string; to: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  const weekdayMonday0 = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  const from = addDays(today, -weekdayMonday0);
  return { from, to: addDays(from, 6) };
}

export function previousIsoWeekBounds(today = nairobiToday()): { from: string; to: string } {
  const { from } = isoWeekBounds(today);
  return { from: addDays(from, -7), to: addDays(from, -1) };
}

export function lastQuarterBounds(today = nairobiToday()): { from: string; to: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const thisStart = Math.floor((month - 1) / 3) * 3 + 1;
  if (thisStart === 1) {
    return { from: utcDate(year - 1, 10, 1), to: utcDate(year - 1, 12, 31) };
  }
  const startMonth = thisStart - 3;
  const endMonth = startMonth + 2;
  return {
    from: utcDate(year, startMonth, 1),
    to: utcDate(year, endMonth, lastDayOfMonth(year, endMonth)),
  };
}

export function yearToDateBounds(today = nairobiToday()): { from: string; to: string } {
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

export function calendarYearBounds(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** Whole-percent share for a stacked bar. Presentation only — not stored. */
export function barSharePercent(part: string, whole: string): string {
  const total = Money.from(whole);
  if (!total.isPositive()) return '0';
  return Money.from(part).times('100').dividedBy(total).round(0).toString();
}

export function pickChartTicks(days: readonly string[], count = 6): string[] {
  if (days.length === 0) return [];
  if (days.length <= count) return [...days];
  const last = days.length - 1;
  const ticks: string[] = [];
  const steps = count - 1;
  for (let i = 0; i < count; i += 1) {
    const index = steps === 0 ? 0 : Math.trunc((i * last * 2 + steps) / (steps * 2));
    const day = days[index];
    if (day && ticks[ticks.length - 1] !== day) ticks.push(day);
  }
  return ticks;
}
