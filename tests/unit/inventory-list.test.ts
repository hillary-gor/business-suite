import { describe, expect, it } from 'vitest';
import {
  adjustmentDateBounds,
  attentionLines,
  matchesAdjustmentSearch,
  matchesProductSearch,
  matchesProductType,
  matchesStockStatus,
  parseAdjustmentDateRange,
  parseAdjustmentReason,
  parseNewProductType,
  parseProductType,
  parseStockStatus,
  stockAlertOf,
  type ProductRow,
} from '@/lib/inventory-list';

const brakePads: ProductRow = {
  name: 'Brake Pads',
  sku: 'DSFAGDF-125',
  salesDescription: 'test item',
  category: 'Hardware',
  itemType: 'INVENTORY',
  qtyOnHand: '-1',
  reorderPoint: '2',
  isStocked: true,
  hasMovement: true,
};

const labour: ProductRow = {
  name: 'Bench labour',
  sku: 'LABOUR',
  salesDescription: null,
  category: null,
  itemType: 'SERVICE',
  qtyOnHand: '0',
  reorderPoint: null,
  isStocked: false,
  hasMovement: false,
};

describe('product list filters', () => {
  it('parses a create-product type from the query string', () => {
    expect(parseNewProductType('SERVICE')).toBe('SERVICE');
    expect(parseNewProductType('INVENTORY')).toBe('INVENTORY');
    expect(parseNewProductType('widget')).toBeNull();
    expect(parseNewProductType(undefined)).toBeNull();
  });

  it('parses type and stock status, and ignores unknown values', () => {
    expect(parseProductType('SERVICE')).toBe('SERVICE');
    expect(parseProductType('widget')).toBe('ALL');
    expect(parseStockStatus('OUT')).toBe('OUT');
    expect(parseStockStatus(undefined)).toBe('ANY');
  });

  it('matches search against name, part number, category and sales description', () => {
    expect(matchesProductSearch(brakePads, 'brake')).toBe(true);
    expect(matchesProductSearch(brakePads, 'DSFAG')).toBe(true);
    expect(matchesProductSearch(brakePads, 'hardware')).toBe(true);
    expect(matchesProductSearch(brakePads, 'test')).toBe(true);
    expect(matchesProductSearch(brakePads, 'widget')).toBe(false);
    expect(matchesProductSearch(brakePads, '  ')).toBe(true);
  });

  it('keeps services out of stock-status filters', () => {
    expect(matchesProductType(labour, 'ALL')).toBe(true);
    expect(matchesProductType(labour, 'SERVICE')).toBe(true);
    expect(matchesProductType(labour, 'INVENTORY')).toBe(false);
    expect(matchesStockStatus(labour, 'ANY')).toBe(true);
    expect(matchesStockStatus(labour, 'IN_STOCK')).toBe(false);
  });

  it('treats a negative on-hand quantity as out of stock', () => {
    expect(stockAlertOf(brakePads)).toBe('out');
    expect(matchesStockStatus(brakePads, 'OUT')).toBe(true);
    expect(matchesStockStatus(brakePads, 'LOW')).toBe(false);
  });

  it('treats a stocked item at zero as out of stock', () => {
    const unused = { ...labour, itemType: 'INVENTORY' as const, isStocked: true, qtyOnHand: '0' };
    expect(stockAlertOf(unused)).toBe('out');
    expect(matchesStockStatus(unused, 'OUT')).toBe(true);
    expect(matchesStockStatus(unused, 'IN_STOCK')).toBe(false);
  });
});

describe('attention banner', () => {
  it('is silent when nothing is wrong, and pluralises when more than one item is', () => {
    expect(attentionLines({ low: 0, out: 0 })).toEqual([]);
    expect(attentionLines({ low: 0, out: 1 })).toEqual(['1 item is out of stock.']);
    expect(attentionLines({ low: 2, out: 3 })).toEqual([
      '3 items are out of stock.',
      '2 items are running low on stock.',
    ]);
  });
});

describe('adjustment list filters', () => {
  it('parses reason and date range', () => {
    expect(parseAdjustmentReason('SHRINKAGE')).toBe('SHRINKAGE');
    expect(parseAdjustmentReason('mystery')).toBe('ALL');
    expect(parseAdjustmentDateRange('THIS_MONTH')).toBe('THIS_MONTH');
    expect(parseAdjustmentDateRange(undefined)).toBe('ALL');
  });

  it('builds inclusive date windows from a known calendar day', () => {
    expect(adjustmentDateBounds('TODAY', '2026-09-05')).toEqual({
      from: '2026-09-05',
      to: '2026-09-05',
    });
    expect(adjustmentDateBounds('THIS_MONTH', '2026-09-05')).toEqual({
      from: '2026-09-01',
      to: '2026-09-05',
    });
    expect(adjustmentDateBounds('THIS_QUARTER', '2026-09-05')).toEqual({
      from: '2026-07-01',
      to: '2026-09-05',
    });
    expect(adjustmentDateBounds('ALL', '2026-09-05')).toEqual({});
  });

  it('matches search against reference, reason label and account', () => {
    const row = {
      reference: 'ADJ-0001',
      reason: 'SHRINKAGE',
      accountName: 'Inventory adjustment',
      accountCode: '5050',
      items: 'Brake Pads',
    };
    expect(matchesAdjustmentSearch(row, 'adj-0001')).toBe(true);
    expect(matchesAdjustmentSearch(row, 'shrink')).toBe(true);
    expect(matchesAdjustmentSearch(row, '5050')).toBe(true);
    expect(matchesAdjustmentSearch(row, 'brake')).toBe(true);
    expect(matchesAdjustmentSearch(row, 'found')).toBe(false);
  });
});
