import { Money } from '@/lib/money';
import { addDays, nairobiToday, queryString } from '@/lib/payables';
import { salesIncomeBounds } from '@/lib/sales-overview';

export const SALES_TXN_TYPES = [
  'invoice',
  'estimate',
  'payment',
  'sales_receipt',
  'credit_note',
  'refund',
  'sales_order',
  'debit_note',
] as const;

export type SalesTxnType = (typeof SALES_TXN_TYPES)[number];
export type SalesTxnTypeFilter = 'all' | SalesTxnType;

export const SALES_TXN_RANGES = ['last3', 'thisMonth', 'last12', 'all'] as const;
export type SalesTxnRange = (typeof SALES_TXN_RANGES)[number];

export const SALES_TXN_STATUSES = ['all', 'open', 'overdue', 'paid', 'draft', 'pending'] as const;
export type SalesTxnStatusFilter = (typeof SALES_TXN_STATUSES)[number];

export const SALES_TXN_PAGE_SIZES = [50, 100, 200, 300] as const;
export type SalesTxnPageSize = (typeof SALES_TXN_PAGE_SIZES)[number];

export const SALES_TXN_TOGGLE_COLUMNS = [
  { id: 'no', label: 'No.' },
  { id: 'due', label: 'Due date' },
  { id: 'balance', label: 'Balance' },
  { id: 'customer', label: 'Customer' },
  { id: 'method', label: 'Method' },
  { id: 'status', label: 'Status' },
  { id: 'type', label: 'Type' },
  { id: 'memo', label: 'Memo' },
  { id: 'email', label: 'Email' },
  { id: 'ageing', label: 'Ageing' },
  { id: 'delivered', label: 'Last Delivered' },
  { id: 'attachments', label: 'Attachments' },
] as const;

export type SalesTxnColumnId = (typeof SALES_TXN_TOGGLE_COLUMNS)[number]['id'];

export const SALES_TXN_DEFAULT_HIDDEN: readonly SalesTxnColumnId[] = [
  'email',
  'ageing',
  'delivered',
  'attachments',
];

export const SALES_TXN_COLUMNS_KEY = 'skyjet.columns.sales-transactions';
export const SALES_TXN_ROWS_KEY = 'skyjet.rows.sales-transactions';

const TOGGLE_IDS = new Set<string>(SALES_TXN_TOGGLE_COLUMNS.map((column) => column.id));

export function firstQuery(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function parseSalesTxnType(raw: string | undefined): SalesTxnTypeFilter {
  if (raw && (SALES_TXN_TYPES as readonly string[]).includes(raw)) {
    return raw as SalesTxnType;
  }
  return 'all';
}

export function parseSalesTxnRange(raw: string | undefined): SalesTxnRange {
  if (raw && (SALES_TXN_RANGES as readonly string[]).includes(raw)) {
    return raw as SalesTxnRange;
  }
  return 'last3';
}

export function parseSalesTxnStatus(raw: string | undefined): SalesTxnStatusFilter {
  if (raw && (SALES_TXN_STATUSES as readonly string[]).includes(raw)) {
    return raw as SalesTxnStatusFilter;
  }
  return 'all';
}

export function parseSalesTxnSearch(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim() ?? '';
  return trimmed.length > 0 ? trimmed.slice(0, 200) : undefined;
}

export function parseSalesTxnPageSize(raw: string | undefined): SalesTxnPageSize {
  if (raw === '50' || raw === '100' || raw === '200' || raw === '300') {
    return Number(raw) as SalesTxnPageSize;
  }
  return 50;
}

export function parseSalesTxnPage(raw: string | undefined): number {
  if (!raw) return 1;
  const page = Number(raw);
  if (!Number.isInteger(page) || page < 1) return 1;
  return page;
}

export function parseSalesTxnHidden(raw: string | undefined): SalesTxnColumnId[] {
  if (raw === undefined) return [...SALES_TXN_DEFAULT_HIDDEN];
  if (raw.trim() === '' || raw.trim() === '-') return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id): id is SalesTxnColumnId => TOGGLE_IDS.has(id));
}

export function last3MonthsRange(today = nairobiToday()): { from: string; to: string } {
  return { from: addDays(today, -90), to: today };
}

export function salesTxnDateBounds(
  range: SalesTxnRange,
  today = nairobiToday(),
): { from: string | null; to: string | null } {
  if (range === 'all') return { from: null, to: null };
  if (range === 'thisMonth') return salesIncomeBounds('thisMonth', today);
  if (range === 'last12') {
    const bounds = last12FromToday(today);
    return bounds;
  }
  return last3MonthsRange(today);
}

function last12FromToday(today: string): { from: string; to: string } {
  return { from: addDays(today, -365), to: today };
}

export function salesTxnRangeLabel(range: SalesTxnRange): string {
  switch (range) {
    case 'thisMonth':
      return 'This month';
    case 'last12':
      return 'Last 12 months';
    case 'all':
      return 'All dates';
    default:
      return 'Last 3 months';
  }
}

export function salesTxnTypeLabel(kind: string): string {
  switch (kind) {
    case 'invoice':
      return 'Invoice';
    case 'estimate':
      return 'Estimate';
    case 'payment':
      return 'Payment';
    case 'sales_receipt':
      return 'Sales Receipt';
    case 'credit_note':
      return 'Credit Note';
    case 'refund':
      return 'Refund Receipt';
    case 'sales_order':
      return 'Sales Order';
    case 'debit_note':
      return 'Debit Note';
    default:
      return kind;
  }
}

export function calendarDaysBetween(fromIso: string, toIso: string): number {
  const from = parseUtcDate(fromIso);
  const to = parseUtcDate(toIso);
  if (from === null || to === null) return 0;
  return Math.trunc((to - from) / 86_400_000);
}

function parseUtcDate(iso: string): number | null {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

export function salesTxnAgeingLabel(
  kind: string,
  dueDate: string | null,
  balance: string,
  today: string,
): string {
  if (kind !== 'invoice' || !dueDate) return '';
  if (!Money.from(balance).isPositive()) return '';
  const days = calendarDaysBetween(dueDate, today);
  if (days <= 0) return '';
  return days === 1 ? '1 day' : `${days} days`;
}

export function salesTxnStatusLabel(input: {
  kind: string;
  docStatus: string;
  balance: string;
  dueDate: string | null;
  convertedInvoiceId: string | null;
  today: string;
}): string {
  const { kind, docStatus, dueDate, convertedInvoiceId, today } = input;
  const outstanding = Money.from(input.balance);

  if (kind === 'invoice') {
    if (docStatus === 'DRAFT') return 'Draft';
    if (docStatus === 'VOIDED') return 'Voided';
    if (docStatus === 'ISSUED' && !outstanding.isPositive()) return 'Paid';
    if (docStatus === 'ISSUED' && dueDate) {
      const days = calendarDaysBetween(today, dueDate);
      if (days < 0) return 'Overdue';
      if (days === 0) return 'Due today';
      return days === 1 ? 'Due in 1 day' : `Due in ${days} days`;
    }
    return 'Open';
  }

  if (kind === 'estimate') {
    if (convertedInvoiceId) return 'Closed';
    if (docStatus === 'SENT') return 'Pending';
    if (docStatus === 'DRAFT') return 'Draft';
    if (docStatus === 'ACCEPTED') return 'Closed';
    if (docStatus === 'CANCELLED') return 'Cancelled';
    return docStatus;
  }

  if (kind === 'payment' || kind === 'sales_receipt' || kind === 'refund') {
    if (docStatus === 'POSTED') return 'Paid';
    if (docStatus === 'DRAFT') return 'Draft';
    if (docStatus === 'REVERSED' || docStatus === 'VOIDED') return 'Voided';
    return docStatus;
  }

  if (kind === 'credit_note') {
    if (docStatus === 'DRAFT') return 'Draft';
    if (docStatus === 'POSTED' && outstanding.isPositive()) return 'Open';
    if (docStatus === 'POSTED') return 'Closed';
    return docStatus;
  }

  if (kind === 'sales_order') {
    if (convertedInvoiceId) return 'Closed';
    if (docStatus === 'DRAFT') return 'Draft';
    if (docStatus === 'CONFIRMED') return 'Open';
    if (docStatus === 'CANCELLED') return 'Cancelled';
    return docStatus;
  }

  if (kind === 'debit_note') {
    if (docStatus === 'DRAFT') return 'Draft';
    if (docStatus === 'POSTED') return 'Closed';
    return docStatus;
  }

  return docStatus;
}

export function salesTxnStatusTone(
  label: string,
): 'paid' | 'overdue' | 'pending' | 'draft' | 'open' {
  if (label === 'Paid' || label === 'Closed') return 'paid';
  if (label === 'Overdue') return 'overdue';
  if (label === 'Pending' || label.startsWith('Due')) return 'pending';
  if (label === 'Draft') return 'draft';
  return 'open';
}

export function estimateRibbonCaption(count: string): string {
  return count === '1' ? '1 estimate' : `${count} estimates`;
}

export function unbilledRibbonCaption(): string {
  return 'Unbilled income';
}

export function salesTxnHref(kind: string, id: string): string | null {
  if (kind === 'invoice') return `/sales/invoices/${id}`;
  if (kind === 'estimate') return `/sales/estimates/new?quotationId=${id}`;
  return null;
}

export type SalesTxnQuery = {
  type: SalesTxnTypeFilter;
  range: SalesTxnRange;
  status: SalesTxnStatusFilter;
  q?: string;
  page: number;
  rows: SalesTxnPageSize;
  hidden: readonly string[];
};

export function salesTxnQueryString(query: SalesTxnQuery): string {
  return queryString({
    type: query.type === 'all' ? undefined : query.type,
    range: query.range === 'last3' ? undefined : query.range,
    status: query.status === 'all' ? undefined : query.status,
    q: query.q,
    page: query.page > 1 ? String(query.page) : undefined,
    rows: query.rows === 50 ? undefined : String(query.rows),
    hidden: hiddenQueryValue(query.hidden),
  });
}

function hiddenQueryValue(hidden: readonly string[]): string | undefined {
  const normalized = [...hidden].filter((id) => TOGGLE_IDS.has(id)).sort();
  const defaults = [...SALES_TXN_DEFAULT_HIDDEN].sort();
  if (normalized.join(',') === defaults.join(',')) return undefined;
  if (normalized.length === 0) return '-';
  return normalized.join(',');
}

export function salesTxnPagerRange(total: number, page: number, rows: number): string {
  if (total === 0) return '1-0 of 0';
  const lastPage = Math.max(1, Math.ceil(total / rows));
  const current = Math.min(page, lastPage);
  const first = (current - 1) * rows + 1;
  const last = Math.min(total, current * rows);
  return `${first}-${last} of ${total}`;
}

export function salesTxnHideClass(hidden: readonly string[]): string {
  return hidden
    .filter((id) => TOGGLE_IDS.has(id))
    .map((id) => `is-hide-${id}`)
    .join(' ');
}
