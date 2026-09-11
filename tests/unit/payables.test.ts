import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatDisplayDate,
  last12MonthsRange,
  parseBillTab,
  parseExpenseKind,
  queryString,
  thisYearRange,
  toCsv,
} from '@/lib/payables';

describe('payables helpers', () => {
  it('defaults the bills register to unpaid', () => {
    expect(parseBillTab(undefined)).toBe('unpaid');
    expect(parseBillTab('review')).toBe('review');
    expect(parseBillTab('paid')).toBe('paid');
    expect(parseBillTab('other')).toBe('unpaid');
  });

  it('formats ISO dates as day/month/year', () => {
    expect(formatDisplayDate('2026-09-03')).toBe('03/09/2026');
  });

  it('builds this-year and rolling twelve-month ranges from a calendar day', () => {
    expect(thisYearRange('2026-09-05')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(last12MonthsRange('2026-09-05')).toEqual({ from: addDays('2026-09-05', -365), to: '2026-09-05' });
  });

  it('encodes a query string without empty values', () => {
    expect(queryString({ tab: 'paid', supplier: undefined })).toBe('?tab=paid');
    expect(parseExpenseKind('bill')).toBe('bill');
    expect(toCsv([['A', 'B'], ['1,2', 'x']])).toBe('A,B\n"1,2",x');
  });
});
