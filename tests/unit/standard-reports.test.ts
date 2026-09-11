import { describe, expect, it } from 'vitest';
import {
  STANDARD_REPORT_SECTIONS,
  allStandardReports,
  defaultFavouriteIds,
  getStandardReport,
} from '@/lib/standard-reports';

describe('standard reports catalogue', () => {
  it('gives every report a title, help text, and a reports href', () => {
    for (const section of STANDARD_REPORT_SECTIONS) {
      expect(section.title.length).toBeGreaterThan(0);
      for (const report of section.reports) {
        expect(report.title.length).toBeGreaterThan(0);
        expect(report.help.length).toBeGreaterThan(20);
        expect(report.href.startsWith('/reports/')).toBe(true);
      }
    }
  });

  it('reuses one id when the same report appears in more than one section', () => {
    const first = new Map<string, string>();
    for (const section of STANDARD_REPORT_SECTIONS) {
      for (const report of section.reports) {
        const existing = first.get(report.title);
        if (existing) expect(report.id).toBe(existing);
        else first.set(report.title, report.id);
      }
    }
    const ids = allStandardReports().map((report) => report.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stars balance sheet, profit and loss, and aged receivables by default', () => {
    expect(defaultFavouriteIds().sort()).toEqual([
      'aged-receivables-summary',
      'balance-sheet',
      'profit-and-loss',
    ]);
    expect(getStandardReport('profit-and-loss')?.href).toBe('/reports/profit-and-loss');
    expect(getStandardReport('sales-by-product')?.href).toBe('/reports/sales-by-product');
    expect(getStandardReport('sales-by-product')?.accountingMethod).toBe('both');
    expect(getStandardReport('profit-and-loss')?.accountingMethod).toBe('accrual');
    expect(getStandardReport('statement-of-cash-flows')?.accountingMethod).toBe('cash');
  });
});
