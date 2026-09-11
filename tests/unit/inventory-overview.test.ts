import { describe, expect, it } from 'vitest';
import {
  classifyOnHand,
  displayCurrency,
  openDocumentCaption,
  parseOverviewPrefs,
  parseSoldPeriod,
  productLabel,
  soldPeriodRange,
} from '@/lib/inventory-overview';

describe('classifyOnHand', () => {
  it('marks a stocked item with nothing on the shelf as out of stock', () => {
    expect(
      classifyOnHand({
        qtyOnHand: '0',
        reorderPoint: '5',
        isStocked: true,
      }),
    ).toBe('out');
  });

  it('marks a sold-out item as out of stock, not low', () => {
    expect(
      classifyOnHand({
        qtyOnHand: '0',
        reorderPoint: '4',
        isStocked: true,
      }),
    ).toBe('out');
  });

  it('marks a negative quantity as out of stock', () => {
    expect(
      classifyOnHand({
        qtyOnHand: '-1',
        reorderPoint: '2',
        isStocked: true,
      }),
    ).toBe('out');
  });

  it('does not treat a service as out of stock', () => {
    expect(
      classifyOnHand({
        qtyOnHand: '0',
        reorderPoint: null,
        isStocked: false,
      }),
    ).toBe('ok');
  });

  it('only treats a positive quantity as low when it is at or below the reorder point', () => {
    expect(
      classifyOnHand({
        qtyOnHand: '3',
        reorderPoint: '4',
        isStocked: true,
      }),
    ).toBe('low');
    expect(
      classifyOnHand({
        qtyOnHand: '5',
        reorderPoint: '4',
        isStocked: true,
      }),
    ).toBe('ok');
    expect(
      classifyOnHand({
        qtyOnHand: '1',
        reorderPoint: null,
        isStocked: true,
      }),
    ).toBe('ok');
  });
});

describe('overview helpers', () => {
  it('parses the sold period and builds an inclusive date window', () => {
    expect(parseSoldPeriod(undefined)).toBe('30');
    expect(parseSoldPeriod('90')).toBe('90');
    expect(soldPeriodRange('30', '2026-09-05')).toEqual({ from: '2026-08-07', to: '2026-09-05' });
    expect(soldPeriodRange('year', '2026-09-05')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('prints Kenyan shillings the way the rest of the product talks about them', () => {
    expect(displayCurrency('KES')).toBe('Ksh');
    expect(displayCurrency('USD')).toBe('USD');
  });

  it('labels a product with its category, and drops unused widgets from prefs', () => {
    expect(productLabel('Hardware', 'Brake Pads')).toBe('Hardware: Brake Pads');
    expect(productLabel(null, 'Hours', 'SVC-1')).toBe('SVC-1 — Hours');
    expect(parseOverviewPrefs({ hidden: ['lowStock', 'nope'] }).hidden).toEqual(['lowStock']);
    expect(openDocumentCaption('purchase order', 1)).toBe('1 open purchase order');
    expect(openDocumentCaption('sales order', 0)).toBe('0 open sales orders');
  });
});
