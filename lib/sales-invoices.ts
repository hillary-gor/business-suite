import { formatDisplayDate, queryString } from '@/lib/payables';
import { Money } from '@/lib/money';
import {
  calendarYearBounds,
  isoWeekBounds,
  lastDaysBounds,
  lastQuarterBounds,
  paidWindow,
  previousIsoWeekBounds,
  salesIncomeBounds,
  yearToDateBounds,
} from '@/lib/sales-overview';
import { firstQuery } from '@/lib/sales-transactions';

const INVOICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const INVOICE_LIST_STATUSES = [
  'all',
  'needs_attention',
  'unpaid',
  'overdue',
  'not_due',
  'paid',
  'not_deposited',
  'deposited',
] as const;

export type InvoiceListStatus = (typeof INVOICE_LIST_STATUSES)[number];

export const INVOICE_LIST_RANGES = [
  'today',
  'yesterday',
  'thisWeek',
  'lastWeek',
  'thisMonth',
  'lastMonth',
  'last30',
  'thisQuarter',
  'lastQuarter',
  'last3',
  'last6',
  'last12',
  'ytd',
  'thisYear',
  '2025',
] as const;

export type InvoiceListRange = (typeof INVOICE_LIST_RANGES)[number];

export const INVOICE_LIST_PAGE_SIZES = [50, 100, 200, 300] as const;
export type InvoiceListPageSize = (typeof INVOICE_LIST_PAGE_SIZES)[number];

export const INVOICE_LIST_TOGGLE_COLUMNS = [
  { id: 'no', label: 'Invoice number' },
  { id: 'balance', label: 'Balance' },
  { id: 'due', label: 'Due date' },
] as const;

export type InvoiceListColumnId = (typeof INVOICE_LIST_TOGGLE_COLUMNS)[number]['id'];

export const INVOICE_LIST_DEFAULT_HIDDEN: readonly InvoiceListColumnId[] = ['balance', 'due'];

export const INVOICE_LIST_COLUMNS_KEY = 'skyjet.columns.sales-invoices';
export const INVOICE_LIST_ROWS_KEY = 'skyjet.rows.sales-invoices';
export const INVOICE_LIST_SUMMARY_KEY = 'skyjet.summary.sales-invoices';

export type InvoiceListSort = 'date' | 'status';
export type InvoiceListDir = 'asc' | 'desc';

const TOGGLE_IDS = new Set<string>(INVOICE_LIST_TOGGLE_COLUMNS.map((column) => column.id));

export type InvoiceListQuery = {
  status: InvoiceListStatus;
  range: InvoiceListRange;
  page: number;
  rows: InvoiceListPageSize;
  hidden: readonly InvoiceListColumnId[];
  sort: InvoiceListSort;
  dir: InvoiceListDir;
  invoice?: string;
};

export type InvoiceActivityStepId = 'sent' | 'viewed' | 'paid' | 'payout';

export type InvoiceActivityStep = {
  id: InvoiceActivityStepId;
  label: string;
  complete: boolean;
  at: string | null;
};

export function parseInvoiceListStatus(raw: string | undefined): InvoiceListStatus {
  if (raw && (INVOICE_LIST_STATUSES as readonly string[]).includes(raw)) {
    return raw as InvoiceListStatus;
  }
  return 'all';
}

export function parseInvoiceListRange(raw: string | undefined): InvoiceListRange {
  if (raw && (INVOICE_LIST_RANGES as readonly string[]).includes(raw)) {
    return raw as InvoiceListRange;
  }
  return 'last3';
}

export function parseInvoiceListPageSize(raw: string | undefined): InvoiceListPageSize {
  if (raw === '50' || raw === '100' || raw === '200' || raw === '300') {
    return Number(raw) as InvoiceListPageSize;
  }
  return 50;
}

export function parseInvoiceListPage(raw: string | undefined): number {
  if (!raw) return 1;
  const page = Number(raw);
  if (!Number.isInteger(page) || page < 1) return 1;
  return page;
}

export function parseInvoiceListHidden(raw: string | undefined): InvoiceListColumnId[] {
  if (raw === undefined) return [...INVOICE_LIST_DEFAULT_HIDDEN];
  if (raw.trim() === '' || raw.trim() === '-') return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id): id is InvoiceListColumnId => TOGGLE_IDS.has(id));
}

export function parseInvoiceListSort(raw: string | undefined): InvoiceListSort {
  return raw === 'status' ? 'status' : 'date';
}

export function parseInvoiceListDir(
  raw: string | undefined,
  sort: InvoiceListSort,
): InvoiceListDir {
  if (raw === 'asc' || raw === 'desc') return raw;
  return sort === 'status' ? 'asc' : 'desc';
}

export function parseInvoiceListSelectedId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!INVOICE_ID_RE.test(value)) return undefined;
  return value;
}

export function parseInvoiceListQuery(params: {
  [key: string]: string | string[] | undefined;
}): InvoiceListQuery {
  const sort = parseInvoiceListSort(firstQuery(params.sort));
  return {
    status: parseInvoiceListStatus(firstQuery(params.status)),
    range: parseInvoiceListRange(firstQuery(params.range)),
    page: parseInvoiceListPage(firstQuery(params.page)),
    rows: parseInvoiceListPageSize(firstQuery(params.rows)),
    hidden: parseInvoiceListHidden(firstQuery(params.hidden)),
    sort,
    dir: parseInvoiceListDir(firstQuery(params.dir), sort),
    invoice: parseInvoiceListSelectedId(firstQuery(params.invoice)),
  };
}

export function invoiceActivitySteps(input: {
  issuedAt: string | null;
  outstanding: string;
  status: string;
  paidOn: string | null;
}): InvoiceActivityStep[] {
  const issuedAt = input.issuedAt?.trim() ? input.issuedAt : null;
  const paidOn = input.paidOn?.trim() ? input.paidOn : null;
  const paid = input.status === 'ISSUED' && !Money.from(input.outstanding).isPositive();
  return [
    { id: 'sent', label: 'Sent', complete: Boolean(issuedAt), at: issuedAt },
    { id: 'viewed', label: 'Viewed', complete: false, at: null },
    { id: 'paid', label: 'Paid', complete: paid, at: paid ? paidOn : null },
    { id: 'payout', label: 'Payout sent', complete: false, at: null },
  ];
}

export function formatInvoiceActivityAt(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!match?.[1]) return value;
  const date = formatDisplayDate(match[1]);
  if (!match[2] || !match[3]) return date;
  const hour = Number(match[2]);
  const minute = match[3];
  const suffix = hour >= 12 ? 'pm' : 'am';
  const hour12 = hour % 12 || 12;
  return `${date} at ${hour12}:${minute} ${suffix}`;
}

export function invoiceListDateBounds(
  range: InvoiceListRange,
  today: string,
): { from: string; to: string } {
  switch (range) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const day = lastDaysBounds(1, today).from;
      return { from: day, to: day };
    }
    case 'thisWeek':
      return isoWeekBounds(today);
    case 'lastWeek':
      return previousIsoWeekBounds(today);
    case 'thisMonth':
      return salesIncomeBounds('thisMonth', today);
    case 'lastMonth':
      return salesIncomeBounds('lastMonth', today);
    case 'last30':
      return paidWindow(today);
    case 'thisQuarter':
      return salesIncomeBounds('thisQuarter', today);
    case 'lastQuarter':
      return lastQuarterBounds(today);
    case 'last6':
      return lastDaysBounds(180, today);
    case 'last12':
      return lastDaysBounds(365, today);
    case 'ytd':
      return yearToDateBounds(today);
    case 'thisYear':
      return salesIncomeBounds('thisYear', today);
    case '2025':
      return calendarYearBounds(2025);
    default:
      return lastDaysBounds(90, today);
  }
}

export function invoiceListQueryString(query: InvoiceListQuery): string {
  const defaultDir: InvoiceListDir = query.sort === 'status' ? 'asc' : 'desc';
  return queryString({
    status: query.status === 'all' ? undefined : query.status,
    range: query.range === 'last3' ? undefined : query.range,
    page: query.page > 1 ? String(query.page) : undefined,
    rows: query.rows === 50 ? undefined : String(query.rows),
    hidden: hiddenQueryValue(query.hidden),
    sort: query.sort === 'date' ? undefined : query.sort,
    dir: query.dir === defaultDir ? undefined : query.dir,
    invoice: query.invoice,
  });
}

function hiddenQueryValue(hidden: readonly string[]): string | undefined {
  const normalized = [...hidden].filter((id) => TOGGLE_IDS.has(id)).sort();
  const defaults = [...INVOICE_LIST_DEFAULT_HIDDEN].sort();
  if (normalized.join(',') === defaults.join(',')) return undefined;
  if (normalized.length === 0) return '-';
  return normalized.join(',');
}

export function invoiceListHideClass(hidden: readonly string[]): string {
  return hidden
    .filter((id) => TOGGLE_IDS.has(id))
    .map((id) => `is-hide-${id}`)
    .join(' ');
}

export function invoiceListStatusSortHref(query: InvoiceListQuery): string {
  if (query.sort !== 'status') {
    return `/sales/invoices${invoiceListQueryString({ ...query, sort: 'status', dir: 'asc', page: 1 })}`;
  }
  const dir: InvoiceListDir = query.dir === 'asc' ? 'desc' : 'asc';
  return `/sales/invoices${invoiceListQueryString({ ...query, sort: 'status', dir, page: 1 })}`;
}

export const INVOICE_LIST_RANGE_OPTIONS: ReadonlyArray<{ value: InvoiceListRange; label: string }> =
  [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'thisWeek', label: 'This week' },
    { value: 'lastWeek', label: 'Last week' },
    { value: 'thisMonth', label: 'This month' },
    { value: 'lastMonth', label: 'Last month' },
    { value: 'last30', label: 'Last 30 days' },
    { value: 'thisQuarter', label: 'This quarter' },
    { value: 'lastQuarter', label: 'Last quarter' },
    { value: 'last3', label: 'Last 3 months' },
    { value: 'last6', label: 'Last 6 months' },
    { value: 'last12', label: 'Last 12 months' },
    { value: 'ytd', label: 'Year to date' },
    { value: 'thisYear', label: 'This year' },
    { value: '2025', label: '2025' },
  ];
