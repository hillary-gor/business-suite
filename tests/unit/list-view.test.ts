import { describe, expect, it } from 'vitest';
import { PRODUCT_COLUMNS, defaultProductsView } from '@/lib/inventory-list';
import {
  defaultListView,
  moveColumn,
  pageCount,
  pagerLabel,
  pageSlice,
  parseListView,
  visibleColumns,
} from '@/lib/list-view';

describe('list view preferences', () => {
  it('drops unknown columns and keeps newly added ones at the end of the order', () => {
    const fallback = defaultListView(PRODUCT_COLUMNS);
    const parsed = parseListView(
      {
        sortBy: 'deleted-column',
        sortDir: 'desc',
        rowsPerPage: 50,
        order: ['name', 'gone', 'sku'],
        hidden: ['gone', 'cost'],
        groupBy: 'category',
      },
      PRODUCT_COLUMNS,
      fallback,
    );

    expect(parsed.sortBy).toBe(fallback.sortBy);
    expect(parsed.sortDir).toBe('desc');
    expect(parsed.order[0]).toBe('name');
    expect(parsed.order[1]).toBe('sku');
    expect(parsed.order).toContain('salesDescription');
    expect(parsed.order).not.toContain('gone');
    expect(parsed.hidden).toEqual(['cost']);
    expect(parsed.groupBy).toBe('category');
  });

  it('hides unchecked columns and keeps the actions column last', () => {
    const view = defaultProductsView();
    const columns = visibleColumns(view, PRODUCT_COLUMNS);
    expect(columns.map((column) => column.id)).toEqual([
      'name',
      'salesDescription',
      'qtyOnHand',
      'category',
      'sku',
      'type',
      'price',
      'cost',
      'actions',
    ]);
  });

  it('moves a column and pages a list', () => {
    expect(moveColumn(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(pageCount(3, 50)).toBe(1);
    expect(pageCount(0, 50)).toBe(1);
    expect(pageSlice(['a', 'b', 'c', 'd'], 2, 2)).toEqual(['c', 'd']);
    expect(pagerLabel(3, 1, 50)).toBe('1-3 of 3 items');
    expect(pagerLabel(1, 1, 50)).toBe('1-1 of 1 item');
    expect(pagerLabel(0, 1, 50)).toBe('0 of 0 items');
  });
});
