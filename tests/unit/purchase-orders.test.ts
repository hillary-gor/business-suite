import { describe, expect, it } from 'vitest';
import {
  parsePoListQuery,
  parsePoListRange,
  poListQueryString,
  poListSortHref,
  poPagerLabel,
  purchaseOrderDateBounds,
  purchaseOrderDateChip,
  purchaseOrderHref,
  purchaseOrderStatusLabel,
  purchaseOrderTitle,
  supplierDetailHref,
} from '@/lib/purchase-orders';

describe('purchase order list', () => {
  it('defaults to this year, newest order first', () => {
    expect(parsePoListRange(undefined)).toBe('thisYear');
    expect(parsePoListQuery({})).toEqual({
      supplierId: undefined,
      range: 'thisYear',
      page: 1,
      sort: 'date',
      dir: 'desc',
    });
  });

  it('keeps this-year off the query string and maps approved orders to Open', () => {
    expect(poListQueryString({ range: 'thisYear', page: 1, sort: 'date', dir: 'desc' })).toBe('');
    expect(
      poListQueryString({
        supplierId: '11111111-1111-4111-8111-111111111111',
        range: 'all',
        page: 2,
        sort: 'supplier',
        dir: 'asc',
      }),
    ).toBe('?supplier=11111111-1111-4111-8111-111111111111&range=all&page=2&sort=supplier');
    expect(purchaseOrderStatusLabel('APPROVED')).toBe('Open');
    expect(purchaseOrderStatusLabel('DRAFT')).toBe('Draft');
    expect(purchaseOrderStatusLabel('CANCELLED')).toBe('Cancelled');
    expect(supplierDetailHref('abc')).toBe('/purchasing/vendors/abc');
    expect(purchaseOrderTitle('1001')).toBe('Purchase Order #1001');
    expect(purchaseOrderTitle(null)).toBe('Purchase Order');
    expect(purchaseOrderHref('abc')).toBe('/purchasing/orders/abc');
  });

  it('bounds this year and leaves all-dates unbounded', () => {
    expect(purchaseOrderDateBounds('thisYear', '2026-09-06')).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(purchaseOrderDateBounds('all', '2026-09-06')).toEqual({ from: null, to: null });
    expect(purchaseOrderDateBounds('lastYear', '2026-09-06')).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
    expect(purchaseOrderDateChip('2026-01-01', '2026-12-31')).toBe(
      'Purchase Order Date: 01/01/2026–31/12/2026',
    );
  });

  it('toggles date sort and labels the boxed pager', () => {
    const href = poListSortHref({ range: 'thisYear', page: 1, sort: 'date', dir: 'desc' }, 'date');
    expect(href).toBe('/purchasing/orders?dir=asc');
    expect(poPagerLabel(2, 1, 50)).toBe('1 - 2 of 2 items');
    expect(poPagerLabel(0, 1, 50)).toBe('0 - 0 of 0 items');
    expect(poPagerLabel(1, 1, 50)).toBe('1 - 1 of 1 item');
  });
});
