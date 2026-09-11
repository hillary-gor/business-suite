import { formatDisplayDate, queryString } from '@/lib/payables';
import { firstQuery } from '@/lib/sales-transactions';
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PO_LIST_RANGES = [
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
  'lastYear',
  'all',
] as const;

export type PoListRange = (typeof PO_LIST_RANGES)[number];
export type PoListSort = 'date' | 'supplier' | 'no' | 'amount';
export type PoListDir = 'asc' | 'desc';

export const PO_LIST_PAGE_SIZE = 50;

export const PO_LIST_COLUMNS = [
  { id: 'supplier', label: 'Supplier' },
  { id: 'no', label: 'Order no.' },
  { id: 'date', label: 'Order date' },
  { id: 'category', label: 'Category' },
  { id: 'class', label: 'Class' },
  { id: 'location', label: 'Location' },
  { id: 'memo', label: 'Memo' },
  { id: 'pretax', label: 'Total before sales tax' },
  { id: 'tax', label: 'Sales tax' },
  { id: 'amount', label: 'Total amount' },
  { id: 'due', label: 'Due date' },
  { id: 'status', label: 'Status' },
  { id: 'email', label: 'Email' },
  { id: 'lastEmail', label: 'Last email sent' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'action', label: 'Action' },
] as const;

export type PoListQuery = {
  supplierId?: string;
  range: PoListRange;
  page: number;
  sort: PoListSort;
  dir: PoListDir;
};

export const PO_LIST_RANGE_OPTIONS: ReadonlyArray<{ value: PoListRange; label: string }> = [
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
  { value: 'lastYear', label: 'Last year' },
  { value: 'all', label: 'All dates' },
];

export function parsePoListRange(raw: string | undefined): PoListRange {
  if (raw && (PO_LIST_RANGES as readonly string[]).includes(raw)) {
    return raw as PoListRange;
  }
  return 'thisYear';
}

export function parsePoListSort(raw: string | undefined): PoListSort {
  if (raw === 'supplier' || raw === 'no' || raw === 'amount') return raw;
  return 'date';
}

export function parsePoListDir(raw: string | undefined, sort: PoListSort): PoListDir {
  if (raw === 'asc' || raw === 'desc') return raw;
  return sort === 'supplier' || sort === 'no' ? 'asc' : 'desc';
}

export function parsePoListPage(raw: string | undefined): number {
  if (!raw) return 1;
  const page = Number(raw);
  if (!Number.isInteger(page) || page < 1) return 1;
  return page;
}

export function parsePoSupplierId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!UUID_RE.test(value)) return undefined;
  return value;
}

export function parsePoListQuery(params: {
  [key: string]: string | string[] | undefined;
}): PoListQuery {
  const sort = parsePoListSort(firstQuery(params.sort));
  return {
    supplierId: parsePoSupplierId(firstQuery(params.supplier)),
    range: parsePoListRange(firstQuery(params.range)),
    page: parsePoListPage(firstQuery(params.page)),
    sort,
    dir: parsePoListDir(firstQuery(params.dir), sort),
  };
}

export function purchaseOrderDateBounds(
  range: PoListRange,
  today: string,
): { from: string | null; to: string | null } {
  if (range === 'all') return { from: null, to: null };
  if (range === 'lastYear') {
    return calendarYearBounds(Number(today.slice(0, 4)) - 1);
  }
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
    case 'last3':
      return lastDaysBounds(90, today);
    case 'last6':
      return lastDaysBounds(180, today);
    case 'last12':
      return lastDaysBounds(365, today);
    case 'ytd':
      return yearToDateBounds(today);
    case 'thisYear':
      return salesIncomeBounds('thisYear', today);
    default:
      return lastDaysBounds(90, today);
  }
}

export function poListQueryString(query: PoListQuery): string {
  const defaultDir: PoListDir = query.sort === 'supplier' || query.sort === 'no' ? 'asc' : 'desc';
  return queryString({
    supplier: query.supplierId,
    range: query.range === 'thisYear' ? undefined : query.range,
    page: query.page > 1 ? String(query.page) : undefined,
    sort: query.sort === 'date' ? undefined : query.sort,
    dir: query.dir === defaultDir ? undefined : query.dir,
  });
}

export function poListSortHref(query: PoListQuery, sort: PoListSort): string {
  const defaultDir: PoListDir = sort === 'supplier' || sort === 'no' ? 'asc' : 'desc';
  if (query.sort !== sort) {
    return `/purchasing/orders${poListQueryString({ ...query, sort, dir: defaultDir, page: 1 })}`;
  }
  const dir: PoListDir = query.dir === 'asc' ? 'desc' : 'asc';
  return `/purchasing/orders${poListQueryString({ ...query, sort, dir, page: 1 })}`;
}

export function purchaseOrderStatusLabel(status: string): string {
  if (status === 'APPROVED') return 'Open';
  if (status === 'DRAFT') return 'Draft';
  if (status === 'CANCELLED') return 'Cancelled';
  return status;
}

export function purchaseOrderDateChip(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  return `Purchase Order Date: ${formatDisplayDate(from)}–${formatDisplayDate(to)}`;
}

export function poPagerLabel(total: number, page: number, rows: number): string {
  if (total === 0) return '0 - 0 of 0 items';
  const lastPage = Math.max(1, Math.ceil(total / rows));
  const current = Math.min(page, lastPage);
  const first = (current - 1) * rows + 1;
  const last = Math.min(total, current * rows);
  return `${first} - ${last} of ${total} item${total === 1 ? '' : 's'}`;
}

export function supplierDetailHref(supplierId: string): string {
  return `/purchasing/vendors/${supplierId}`;
}

export function purchaseOrderHref(poId: string): string {
  return `/purchasing/orders/${poId}`;
}

export function purchaseOrderTitle(poNo: string | null | undefined): string {
  return poNo ? `Purchase Order #${poNo}` : 'Purchase Order';
}

export function purchaseOrderIsDraft(status: string): boolean {
  return status === 'DRAFT';
}
