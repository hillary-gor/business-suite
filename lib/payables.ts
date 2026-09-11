export type BillTab = 'review' | 'unpaid' | 'paid';
export type ExpenseKind =
  | 'all'
  | 'purchase_order'
  | 'item_receipt'
  | 'bill'
  | 'expense'
  | 'payment'
  | 'credit';

export function nairobiToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDays(isoDate: string, days: number): string {
  const parts = isoDate.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function thisYearRange(today = nairobiToday()): { from: string; to: string } {
  const year = today.slice(0, 4);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function last12MonthsRange(today = nairobiToday()): { from: string; to: string } {
  return { from: addDays(today, -365), to: today };
}

export function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

export function parseBillTab(raw: string | undefined): BillTab {
  if (raw === 'review' || raw === 'paid') return raw;
  return 'unpaid';
}

export function parseExpenseKind(raw: string | undefined): ExpenseKind {
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

export function expenseKindLabel(kind: Exclude<ExpenseKind, 'all'>): string {
  switch (kind) {
    case 'purchase_order':
      return 'Purchase Order';
    case 'item_receipt':
      return 'Item Receipt';
    case 'bill':
      return 'Bill';
    case 'expense':
      return 'Expense';
    case 'payment':
      return 'Bill Payment';
    case 'credit':
      return 'Supplier Credit';
  }
}

export function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? '' : String(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\n');
}

export function queryString(values: Record<string, string | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}
