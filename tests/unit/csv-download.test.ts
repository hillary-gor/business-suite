import { describe, expect, it } from 'vitest';
import { csvFilename, csvWithBom } from '@/lib/csv-download';

describe('csv download helpers', () => {
  it('builds a safe filename from report identity and dates', () => {
    expect(csvFilename(['profit-and-loss', '2026-01-01-2026-09-06'])).toBe(
      'profit-and-loss-2026-01-01-2026-09-06.csv',
    );
    expect(csvFilename(['Sales by Product / Service', 'this month'])).toBe(
      'Sales-by-Product-Service-this-month.csv',
    );
  });

  it('prefixes a UTF-8 BOM so Excel opens the file as Unicode', () => {
    const csv = csvWithBom([
      ['Name', 'Total'],
      ['Parts', '1000'],
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.slice(1)).toBe('Name,Total\nParts,1000');
  });
});
