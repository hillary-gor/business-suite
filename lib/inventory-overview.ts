import { Money } from '@/lib/money';
import { addDays, nairobiToday, thisYearRange } from '@/lib/payables';

export const OVERVIEW_WIDGET_IDS = [
  'lowStock',
  'outOfStock',
  'topSelling',
  'openSalesOrders',
  'openPurchaseOrders',
  'reports',
] as const;

export type OverviewWidgetId = (typeof OVERVIEW_WIDGET_IDS)[number];

export type StockAlert = 'out' | 'low' | 'ok';

export type SoldPeriod = '30' | '90' | 'year';

export const OVERVIEW_PREFS_KEY = 'skyjet.inv-overview';

export type OverviewPrefs = {
  hidden: OverviewWidgetId[];
};

const WIDGET_SET = new Set<string>(OVERVIEW_WIDGET_IDS);

export function defaultOverviewPrefs(): OverviewPrefs {
  return { hidden: [] };
}

export function parseOverviewPrefs(raw: unknown): OverviewPrefs {
  if (!raw || typeof raw !== 'object') return defaultOverviewPrefs();
  const hidden = Array.isArray((raw as { hidden?: unknown }).hidden)
    ? (raw as { hidden: unknown[] }).hidden.filter(
        (id): id is OverviewWidgetId => typeof id === 'string' && WIDGET_SET.has(id),
      )
    : [];
  return { hidden };
}

export function loadOverviewPrefs(): OverviewPrefs {
  if (typeof window === 'undefined') return defaultOverviewPrefs();
  try {
    const stored = window.localStorage.getItem(OVERVIEW_PREFS_KEY);
    if (!stored) return defaultOverviewPrefs();
    return parseOverviewPrefs(JSON.parse(stored));
  } catch {
    return defaultOverviewPrefs();
  }
}

export function saveOverviewPrefs(prefs: OverviewPrefs): void {
  window.localStorage.setItem(OVERVIEW_PREFS_KEY, JSON.stringify(prefs));
}

export function parseSoldPeriod(raw: string | undefined): SoldPeriod {
  if (raw === '90' || raw === 'year') return raw;
  return '30';
}

export function soldPeriodRange(
  period: SoldPeriod,
  today = nairobiToday(),
): { from: string; to: string } {
  if (period === 'year') return thisYearRange(today);
  const days = period === '90' ? 90 : 30;
  return { from: addDays(today, -(days - 1)), to: today };
}

export function soldPeriodLabel(period: SoldPeriod): string {
  if (period === '90') return 'Last 90 days';
  if (period === 'year') return 'This year';
  return 'Last 30 days';
}

/** Kenyan books print Ksh; ISO codes stay as-is for any other functional currency. */
export function displayCurrency(code: string): string {
  return code === 'KES' ? 'Ksh' : code;
}

export function productLabel(
  categoryName: string | null,
  description: string,
  partNumber?: string | null,
): string {
  const name = description.trim();
  const category = categoryName?.trim();
  if (category) return `${category}: ${name}`;
  const sku = partNumber?.trim();
  if (sku && sku !== name) return `${sku} — ${name}`;
  return name;
}

/**
 * Low and out of stock are mutually exclusive.
 *
 * A stocked item with nothing on the shelf is out of stock — including a new
 * catalogue row created at zero. Low on stock is only used while quantity is
 * still positive and at or below the reorder point.
 */
export function classifyOnHand(input: {
  qtyOnHand: string;
  reorderPoint: string | null;
  isStocked: boolean;
}): StockAlert {
  if (!input.isStocked) return 'ok';
  const qty = Money.from(input.qtyOnHand);
  if (qty.isNegative() || qty.isZero()) return 'out';
  if (input.reorderPoint === null || input.reorderPoint.trim() === '') return 'ok';
  return qty.comparedTo(Money.from(input.reorderPoint)) <= 0 ? 'low' : 'ok';
}

export function openDocumentCaption(kind: 'sales order' | 'purchase order', count: number): string {
  const noun = count === 1 ? kind : `${kind}s`;
  return `${count} open ${noun}`;
}
