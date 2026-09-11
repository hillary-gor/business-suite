import { describe, expect, it } from 'vitest';
import { groupProductSales } from '@/lib/sales-by-product';

describe('groupProductSales', () => {
  it('nests named categories and leaves uncategorised items at the top level', () => {
    const grouped = groupProductSales([
      {
        itemId: 'pads',
        categoryId: 'hw',
        categoryName: 'Hardware',
        productName: 'Brake Pads',
        quantity: '1',
        amount: '5000',
        cos: '4000',
      },
      {
        itemId: 'hours',
        categoryId: null,
        categoryName: null,
        productName: 'Hours',
        quantity: '0',
        amount: '5',
        cos: '0',
      },
    ]);

    expect(grouped.sections).toHaveLength(2);
    const hardware = grouped.sections[0];
    const hours = grouped.sections[1];
    if (hardware?.kind !== 'category' || hours?.kind !== 'item') {
      throw new Error('expected a Hardware group then an uncategorised Hours row');
    }

    expect(hardware.name).toBe('Hardware');
    expect(hardware.lines[0]?.percentOfSales).toBe('99.9%');
    expect(hardware.lines[0]?.grossMarginPercent).toBe('20.0%');
    expect(hardware.total.name).toBe('Total for Hardware');
    expect(hours.line.name).toBe('Hours');
    expect(hours.line.percentOfSales).toBe('0.1%');
    expect(hours.line.avgPrice).toBeNull();
    expect(grouped.total.percentOfSales).toBe('100.0%');
    expect(grouped.total.amount).toBe('5005.0000');
  });
});
