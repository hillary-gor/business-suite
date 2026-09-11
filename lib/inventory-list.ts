import { classifyOnHand, type StockAlert } from '@/lib/inventory-overview';
import { defaultListView, type ListColumn, type ListView } from '@/lib/list-view';
import { addDays, nairobiToday, thisYearRange } from '@/lib/payables';

export const PRODUCTS_VIEW_KEY = 'skyjet.inv-products-view';
export const ADJUSTMENTS_VIEW_KEY = 'skyjet.inv-adjustments-view';

export type ProductTypeFilter = 'ALL' | 'INVENTORY' | 'NON_INVENTORY' | 'SERVICE';
export type StockStatusFilter = 'ANY' | 'IN_STOCK' | 'LOW' | 'OUT';

export const PRODUCT_COLUMNS: readonly ListColumn[] = [
  { id: 'name', label: 'Name' },
  { id: 'salesDescription', label: 'Sales Description' },
  { id: 'qtyOnHand', label: 'Qty on hand', numeric: true },
  { id: 'qtyOnPo', label: 'Qty on PO', numeric: true },
  { id: 'qtyOnSo', label: 'Qty on SO', numeric: true },
  { id: 'qtyAvailable', label: 'Avail Qty', numeric: true },
  { id: 'category', label: 'Category' },
  { id: 'sku', label: 'Part number' },
  { id: 'type', label: 'Type' },
  { id: 'price', label: 'Price', numeric: true },
  { id: 'cost', label: 'Cost', numeric: true },
  { id: 'incomeAccount', label: 'Income Account' },
  { id: 'expenseAccount', label: 'Expense Account' },
  { id: 'inventoryAccount', label: 'Inventory Account' },
  { id: 'purchaseDescription', label: 'Purchase Description' },
  { id: 'reorderPoint', label: 'Reorder Point', numeric: true },
  { id: 'preferredSupplier', label: 'Preferred Supplier' },
  { id: 'actions', label: 'Actions', fixed: true },
];

export const ADJUSTMENT_COLUMNS: readonly ListColumn[] = [
  { id: 'date', label: 'Date' },
  { id: 'reference', label: 'Reference' },
  { id: 'reason', label: 'Adjustment reason' },
  { id: 'account', label: 'Adjustment account' },
  { id: 'items', label: 'Products' },
  { id: 'quantity', label: 'Quantity', numeric: true },
  { id: 'actions', label: 'Actions', fixed: true },
];

export function defaultProductsView(): ListView {
  return defaultListView(PRODUCT_COLUMNS, {
    sortBy: 'name',
    hidden: [
      'qtyOnPo',
      'qtyOnSo',
      'qtyAvailable',
      'incomeAccount',
      'expenseAccount',
      'inventoryAccount',
      'purchaseDescription',
      'reorderPoint',
      'preferredSupplier',
    ],
  });
}

export function defaultAdjustmentsView(): ListView {
  return defaultListView(ADJUSTMENT_COLUMNS, {
    sortBy: 'date',
    sortDir: 'desc',
    hidden: ['items', 'quantity'],
  });
}

export type ProductItemType = Exclude<ProductTypeFilter, 'ALL'>;

export type ProductRow = {
  name: string;
  sku: string;
  salesDescription: string | null;
  category: string | null;
  itemType: ProductItemType;
  qtyOnHand: string;
  reorderPoint: string | null;
  isStocked: boolean;
  hasMovement: boolean;
};

export function itemTypeLabel(type: ProductItemType): string {
  if (type === 'NON_INVENTORY') return 'Non-inventory';
  if (type === 'SERVICE') return 'Service';
  return 'Inventory';
}

export function parseProductType(raw: string | undefined): ProductTypeFilter {
  return raw === 'INVENTORY' || raw === 'NON_INVENTORY' || raw === 'SERVICE' ? raw : 'ALL';
}

export function parseNewProductType(raw: string | undefined): ProductItemType | null {
  return raw === 'INVENTORY' || raw === 'NON_INVENTORY' || raw === 'SERVICE' ? raw : null;
}

export function parseStockStatus(raw: string | undefined): StockStatusFilter {
  return raw === 'IN_STOCK' || raw === 'LOW' || raw === 'OUT' ? raw : 'ANY';
}

export function stockAlertOf(row: ProductRow): StockAlert {
  return classifyOnHand({
    qtyOnHand: row.qtyOnHand,
    reorderPoint: row.reorderPoint,
    isStocked: row.isStocked,
  });
}

export function matchesProductType(row: ProductRow, filter: ProductTypeFilter): boolean {
  return filter === 'ALL' || row.itemType === filter;
}

export function matchesStockStatus(row: ProductRow, filter: StockStatusFilter): boolean {
  if (filter === 'ANY') return true;
  // Stock status is a question about stocked parts. A service has no answer,
  // so it drops out of the list rather than pretending to be in stock.
  if (!row.isStocked) return false;
  const alert = stockAlertOf(row);
  if (filter === 'OUT') return alert === 'out';
  if (filter === 'LOW') return alert === 'low';
  return alert === 'ok';
}

export function matchesProductSearch(row: ProductRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [row.name, row.sku, row.category, row.salesDescription].some(
    (value) => value !== null && value !== undefined && value.toLowerCase().includes(needle),
  );
}

export type AttentionCounts = { low: number; out: number };

/** The banner only earns its place when something is actually wrong. */
export function attentionLines(counts: AttentionCounts): string[] {
  const lines: string[] = [];
  if (counts.out > 0) {
    lines.push(`${counts.out} item${counts.out === 1 ? ' is' : 's are'} out of stock.`);
  }
  if (counts.low > 0) {
    lines.push(`${counts.low} item${counts.low === 1 ? ' is' : 's are'} running low on stock.`);
  }
  return lines;
}

export const ADJUSTMENT_REASONS = [
  'SHRINKAGE',
  'DAMAGED',
  'EXPIRED',
  'STOCK_COUNT',
  'SUPPLIES_USED',
  'FOUND',
  'OTHER',
] as const;

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  SHRINKAGE: 'Shrinkage',
  DAMAGED: 'Damaged',
  EXPIRED: 'Expired or time-expired',
  STOCK_COUNT: 'Stock count',
  SUPPLIES_USED: 'Supplies used internally',
  FOUND: 'Found',
  OTHER: 'Other',
};

export function adjustmentReasonLabel(reason: string): string {
  return ADJUSTMENT_REASON_LABELS[reason as AdjustmentReason] ?? reason;
}

export type AdjustmentDateRange =
  'ALL' | 'TODAY' | 'THIS_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR' | 'LAST_365';

export function parseAdjustmentReason(raw: string | undefined): AdjustmentReason | 'ALL' {
  return ADJUSTMENT_REASONS.includes(raw as AdjustmentReason) ? (raw as AdjustmentReason) : 'ALL';
}

export function matchesAdjustmentSearch(
  row: {
    reference: string;
    reason: string;
    accountName: string;
    accountCode: string;
    items: string | null;
  },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [
    row.reference,
    adjustmentReasonLabel(row.reason),
    row.accountName,
    row.accountCode,
    row.items,
  ].some((value) => value !== null && value !== undefined && value.toLowerCase().includes(needle));
}

export function parseAdjustmentDateRange(raw: string | undefined): AdjustmentDateRange {
  return raw === 'TODAY' ||
    raw === 'THIS_MONTH' ||
    raw === 'THIS_QUARTER' ||
    raw === 'THIS_YEAR' ||
    raw === 'LAST_365'
    ? raw
    : 'ALL';
}

export function adjustmentDateRangeLabel(range: AdjustmentDateRange): string {
  switch (range) {
    case 'TODAY':
      return 'Today';
    case 'THIS_MONTH':
      return 'This month';
    case 'THIS_QUARTER':
      return 'This quarter';
    case 'THIS_YEAR':
      return 'This year';
    case 'LAST_365':
      return 'Last 365 days';
    default:
      return 'All dates';
  }
}

export function adjustmentDateBounds(
  range: AdjustmentDateRange,
  today = nairobiToday(),
): { from?: string; to?: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  switch (range) {
    case 'TODAY':
      return { from: today, to: today };
    case 'THIS_MONTH':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'THIS_QUARTER': {
      const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
      return { from: `${year}-${String(firstMonth).padStart(2, '0')}-01`, to: today };
    }
    case 'THIS_YEAR':
      return thisYearRange(today);
    case 'LAST_365':
      return { from: addDays(today, -364), to: today };
    default:
      return {};
  }
}
