import { last12MonthsRange, queryString, thisYearRange, type ExpenseKind } from '@/lib/payables';
import { firstQuery } from '@/lib/sales-transactions';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SUPPLIER_TABS = ['transactions', 'details', 'notes'] as const;
export type SupplierTab = (typeof SUPPLIER_TABS)[number];

export const SUPPLIER_DATE_RANGES = ['last12', 'thisYear', 'all'] as const;
export type SupplierDateRange = (typeof SUPPLIER_DATE_RANGES)[number];

export const SUPPLIER_SORTS = ['name', 'balance'] as const;
export type SupplierSort = (typeof SUPPLIER_SORTS)[number];

export type SupplierQuery = {
  tab: SupplierTab;
  kind: ExpenseKind;
  range: SupplierDateRange;
  q?: string;
  sort: SupplierSort;
  page: number;
};

export function parseSupplierTab(raw: string | undefined): SupplierTab {
  if (raw === 'details' || raw === 'notes') return raw;
  return 'transactions';
}

export function parseSupplierDateRange(raw: string | undefined): SupplierDateRange {
  if (raw === 'thisYear' || raw === 'all') return raw;
  return 'last12';
}

export function parseSupplierSort(raw: string | undefined): SupplierSort {
  return raw === 'balance' ? 'balance' : 'name';
}

export function parseSupplierPage(raw: string | undefined): number {
  if (!raw) return 1;
  const page = Number(raw);
  if (!Number.isInteger(page) || page < 1) return 1;
  return page;
}

export function parseSupplierId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!UUID_RE.test(value)) return undefined;
  return value;
}

export function parseSupplierQuery(params: {
  [key: string]: string | string[] | undefined;
}): SupplierQuery {
  const q = firstQuery(params.q)?.trim();
  return {
    tab: parseSupplierTab(firstQuery(params.tab)),
    kind: parseSupplierKind(firstQuery(params.kind)),
    range: parseSupplierDateRange(firstQuery(params.range)),
    q: q || undefined,
    sort: parseSupplierSort(firstQuery(params.sort)),
    page: parseSupplierPage(firstQuery(params.page)),
  };
}

function parseSupplierKind(raw: string | undefined): ExpenseKind {
  if (
    raw === 'purchase_order' ||
    raw === 'item_receipt' ||
    raw === 'bill' ||
    raw === 'expense' ||
    raw === 'payment' ||
    raw === 'credit'
  ) {
    return raw;
  }
  return 'all';
}

export function supplierQueryString(query: SupplierQuery): string {
  return queryString({
    tab: query.tab === 'transactions' ? undefined : query.tab,
    kind: query.kind === 'all' ? undefined : query.kind,
    range: query.range === 'last12' ? undefined : query.range,
    q: query.q,
    sort: query.sort === 'name' ? undefined : query.sort,
    page: query.page > 1 ? String(query.page) : undefined,
  });
}

export function supplierDateBounds(
  range: SupplierDateRange,
  today?: string,
): { from: string | null; to: string | null } {
  if (range === 'all') return { from: null, to: null };
  if (range === 'thisYear') return thisYearRange(today);
  return last12MonthsRange(today);
}

export function supplierDateChipLabel(range: SupplierDateRange): string {
  if (range === 'thisYear') return 'Dates: This year';
  if (range === 'all') return 'Dates: All dates';
  return 'Dates: Last 12 months';
}

export function countryName(code: string | null | undefined): string {
  if (!code) return '';
  if (code === 'KE') return 'Kenya';
  return code;
}
