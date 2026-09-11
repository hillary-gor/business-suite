import { describe, expect, it } from 'vitest';
import {
  countryName,
  parseSupplierQuery,
  supplierDateBounds,
  supplierDateChipLabel,
  supplierQueryString,
} from '@/lib/supplier-hub';

describe('supplier hub', () => {
  it('defaults to the transaction list for the last 12 months', () => {
    expect(parseSupplierQuery({})).toEqual({
      tab: 'transactions',
      kind: 'all',
      range: 'last12',
      q: undefined,
      sort: 'name',
      page: 1,
    });
    expect(supplierQueryString(parseSupplierQuery({}))).toBe('');
    expect(supplierDateChipLabel('last12')).toBe('Dates: Last 12 months');
  });

  it('keeps notes and details tabs, and maps Kenya', () => {
    expect(parseSupplierQuery({ tab: 'notes', kind: 'purchase_order', range: 'thisYear' })).toEqual(
      {
        tab: 'notes',
        kind: 'purchase_order',
        range: 'thisYear',
        q: undefined,
        sort: 'name',
        page: 1,
      },
    );
    expect(supplierDateBounds('thisYear', '2026-09-06')).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(countryName('KE')).toBe('Kenya');
    expect(countryName('US')).toBe('US');
  });
});
