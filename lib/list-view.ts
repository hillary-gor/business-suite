/**
 * How a person has chosen to look at a list: what is sorted, how many rows fit
 * on a page, which columns show and in what order. It is a preference, not
 * data, so it lives in the browser and every value that comes back out of
 * storage is checked against the columns the list actually has — a column that
 * has since been renamed or removed must not be able to blank the table.
 */

export type ListColumn = {
  id: string;
  label: string;
  numeric?: boolean;
  /** Always shown and never reordered. Row actions sit at the end. */
  fixed?: boolean;
};

export type RowHeight = 'comfortable' | 'compact';

export type ListView = {
  sortBy: string;
  sortDir: 'asc' | 'desc';
  rowsPerPage: number;
  rowHeight: RowHeight;
  alternateRows: boolean;
  /** Every non-fixed column id, in display order. */
  order: string[];
  hidden: string[];
  groupBy: string | null;
};

export const ROWS_PER_PAGE_CHOICES = [25, 50, 75, 100, 150, 300] as const;

export function defaultListView(
  columns: readonly ListColumn[],
  overrides: Partial<ListView> = {},
): ListView {
  const order = columns.filter((column) => !column.fixed).map((column) => column.id);
  return {
    sortBy: order[0] ?? '',
    sortDir: 'asc',
    rowsPerPage: 50,
    rowHeight: 'comfortable',
    alternateRows: false,
    order,
    hidden: [],
    groupBy: null,
    ...overrides,
  };
}

export function parseListView(
  raw: unknown,
  columns: readonly ListColumn[],
  fallback: ListView,
): ListView {
  if (!raw || typeof raw !== 'object') return fallback;
  const value = raw as Partial<Record<keyof ListView, unknown>>;
  const known = new Set(columns.filter((column) => !column.fixed).map((column) => column.id));

  const stored = Array.isArray(value.order)
    ? value.order.filter((id): id is string => typeof id === 'string' && known.has(id))
    : [];
  // Anything the stored order has not heard of is a column added since, so it
  // keeps its place from the column definition rather than being dropped.
  const order = [...stored, ...[...known].filter((id) => !stored.includes(id))];

  const hidden = Array.isArray(value.hidden)
    ? value.hidden.filter((id): id is string => typeof id === 'string' && known.has(id))
    : fallback.hidden;

  const rowsPerPage =
    typeof value.rowsPerPage === 'number' &&
    (ROWS_PER_PAGE_CHOICES as readonly number[]).includes(value.rowsPerPage)
      ? value.rowsPerPage
      : fallback.rowsPerPage;

  return {
    sortBy:
      typeof value.sortBy === 'string' && known.has(value.sortBy) ? value.sortBy : fallback.sortBy,
    sortDir: value.sortDir === 'desc' ? 'desc' : 'asc',
    rowsPerPage,
    rowHeight: value.rowHeight === 'compact' ? 'compact' : 'comfortable',
    alternateRows: value.alternateRows === true,
    order,
    hidden,
    groupBy:
      typeof value.groupBy === 'string' && known.has(value.groupBy)
        ? value.groupBy
        : fallback.groupBy,
  };
}

export function loadListView(
  key: string,
  columns: readonly ListColumn[],
  fallback: ListView,
): ListView {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return fallback;
    return parseListView(JSON.parse(stored), columns, fallback);
  } catch {
    return fallback;
  }
}

export function saveListView(key: string, view: ListView): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(view));
  } catch {
    // A full or blocked storage quota is not worth interrupting anyone over.
  }
}

/** The columns to render: chosen order first, then any fixed ones at the end. */
export function visibleColumns(view: ListView, columns: readonly ListColumn[]): ListColumn[] {
  const byId = new Map(columns.map((column) => [column.id, column]));
  const chosen = view.order
    .filter((id) => !view.hidden.includes(id))
    .map((id) => byId.get(id))
    .filter((column): column is ListColumn => column !== undefined);
  return [...chosen, ...columns.filter((column) => column.fixed)];
}

export function moveColumn(order: readonly string[], id: string, toIndex: number): string[] {
  const from = order.indexOf(id);
  if (from === -1) return [...order];
  const bounded = Math.max(0, Math.min(toIndex, order.length - 1));
  const next = [...order];
  next.splice(from, 1);
  next.splice(bounded, 0, id);
  return next;
}

export function pageCount(total: number, rowsPerPage: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, rowsPerPage)));
}

export function pageSlice<T>(rows: readonly T[], page: number, rowsPerPage: number): T[] {
  const start = (page - 1) * rowsPerPage;
  return rows.slice(start, start + rowsPerPage);
}

/** "1-3 of 3 items", and "0 of 0 items" when there is nothing to show. */
export function pagerLabel(total: number, page: number, rowsPerPage: number): string {
  if (total === 0) return '0 of 0 items';
  const first = (page - 1) * rowsPerPage + 1;
  const last = Math.min(total, page * rowsPerPage);
  return `${first}-${last} of ${total} item${total === 1 ? '' : 's'}`;
}
