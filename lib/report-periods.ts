import { addDays, nairobiToday } from '@/lib/payables';

export const REPORT_PERIODS = [
  'today',
  'this_week',
  'this_month',
  'this_month_to_date',
  'this_quarter',
  'this_year',
  'this_year_to_date',
  'last_month',
  'last_year',
  'custom',
] as const;

export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export type ReportBasis = 'ACCRUAL' | 'CASH';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function parseReportPeriod(raw: string | undefined): ReportPeriod {
  return REPORT_PERIODS.includes(raw as ReportPeriod)
    ? (raw as ReportPeriod)
    : 'this_month_to_date';
}

export function parseReportBasis(raw: string | undefined): ReportBasis {
  return raw === 'CASH' ? 'CASH' : 'ACCRUAL';
}

export function parseIsoDate(raw: string | undefined): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const { year, month, day } = parts(raw);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return null;
  }
  return raw;
}

export function resolveReportQuery(
  raw: { period?: string; from?: string; to?: string; basis?: string },
  today = nairobiToday(),
): { period: ReportPeriod; from: string; to: string; basis: ReportBasis } {
  const period = parseReportPeriod(raw.period);
  const basis = parseReportBasis(raw.basis);
  const computed = reportPeriodRange(period, today);
  if (period !== 'custom') {
    return { period, from: computed.from, to: computed.to, basis };
  }
  const from = parseIsoDate(raw.from) ?? computed.from;
  const to = parseIsoDate(raw.to) ?? computed.to;
  if (from <= to) return { period, from, to, basis };
  return { period, from: to, to: from, basis };
}

function ymd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parts(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number);
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1 };
}

function lastDayOfMonth(year: number, month: number): string {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return addDays(ymd(nextYear, nextMonth, 1), -1);
}

function quarterStartMonth(month: number): number {
  return Math.floor((month - 1) / 3) * 3 + 1;
}

export function reportPeriodRange(
  period: ReportPeriod,
  today = nairobiToday(),
): { from: string; to: string } {
  const { year, month, day } = parts(today);
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'this_week': {
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
      const from = addDays(today, mondayOffset);
      return { from, to: addDays(from, 6) };
    }
    case 'this_month':
      return { from: ymd(year, month, 1), to: lastDayOfMonth(year, month) };
    case 'this_month_to_date':
      return { from: ymd(year, month, 1), to: today };
    case 'this_quarter': {
      const start = quarterStartMonth(month);
      const end = start + 2;
      return { from: ymd(year, start, 1), to: lastDayOfMonth(year, end) };
    }
    case 'this_year':
      return { from: ymd(year, 1, 1), to: ymd(year, 12, 31) };
    case 'this_year_to_date':
      return { from: ymd(year, 1, 1), to: today };
    case 'last_month': {
      const lastMonth = month === 1 ? 12 : month - 1;
      const lastYear = month === 1 ? year - 1 : year;
      return { from: ymd(lastYear, lastMonth, 1), to: lastDayOfMonth(lastYear, lastMonth) };
    }
    case 'last_year':
      return { from: ymd(year - 1, 1, 1), to: ymd(year - 1, 12, 31) };
    case 'custom':
      return { from: ymd(year, month, 1), to: today };
  }
}

export function reportPeriodLabel(period: ReportPeriod): string {
  switch (period) {
    case 'today':
      return 'Today';
    case 'this_week':
      return 'This week';
    case 'this_month':
      return 'This month';
    case 'this_month_to_date':
      return 'This month to date';
    case 'this_quarter':
      return 'This quarter';
    case 'this_year':
      return 'This year';
    case 'this_year_to_date':
      return 'This year to date';
    case 'last_month':
      return 'Last month';
    case 'last_year':
      return 'Last year';
    case 'custom':
      return 'Custom';
  }
}

export function formatReportDateRange(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  const fromMonth = MONTHS[a.month - 1] ?? from;
  const toMonth = MONTHS[b.month - 1] ?? to;
  if (from === to) return `${fromMonth} ${a.day}, ${a.year}`;
  if (a.year === b.year && a.month === b.month) {
    return `${fromMonth} ${a.day}-${b.day}, ${a.year}`;
  }
  if (a.year === b.year) {
    return `${fromMonth} ${a.day} - ${toMonth} ${b.day}, ${a.year}`;
  }
  return `${fromMonth} ${a.day}, ${a.year} - ${toMonth} ${b.day}, ${b.year}`;
}

export function formatReportTimestamp(at = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Nairobi',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'longOffset',
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('weekday')}, ${value('month')} ${value('day')}, ${value('year')} ${value('hour')}:${value('minute')} ${value('dayPeriod')} ${value('timeZoneName')}`;
}

export function reportQueryHref(
  path: string,
  query: { period: string; from: string; to: string; basis: string },
): string {
  const params = new URLSearchParams({
    period: query.period,
    from: query.from,
    to: query.to,
    basis: query.basis,
  });
  return `${path}?${params.toString()}`;
}
