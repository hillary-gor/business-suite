import { describe, expect, it } from 'vitest';
import {
  barSharePercent,
  calendarYearBounds,
  chartDayLabel,
  isoWeekBounds,
  lastDaysBounds,
  lastQuarterBounds,
  monthYearLabel,
  paidWindow,
  parseComparePriorYear,
  parseSalesIncomeRange,
  pickChartTicks,
  previousIsoWeekBounds,
  salesIncomeBounds,
  salesIncomeRangeLabel,
  shiftYears,
  unpaidWindow,
  yearToDateBounds,
} from '@/lib/sales-overview';

describe('sales overview helpers', () => {
  it('defaults the income window to this month', () => {
    expect(parseSalesIncomeRange(undefined)).toBe('thisMonth');
    expect(parseSalesIncomeRange('thisQuarter')).toBe('thisQuarter');
    expect(salesIncomeRangeLabel('thisMonth')).toBe('This month');
  });

  it('uses the full calendar month, including days still ahead', () => {
    expect(salesIncomeBounds('thisMonth', '2026-09-05')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(salesIncomeBounds('lastMonth', '2026-09-05')).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(salesIncomeBounds('thisQuarter', '2026-09-05')).toEqual({
      from: '2026-07-01',
      to: '2026-09-30',
    });
    expect(salesIncomeBounds('thisYear', '2026-09-05')).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  it('keeps February on a valid day when shifting a year', () => {
    expect(shiftYears('2024-02-29', -1)).toBe('2023-02-28');
    expect(monthYearLabel('2025-09-01')).toBe('Sep, 2025');
    expect(chartDayLabel('2026-09-04')).toBe('Sep 04');
  });

  it('only compares the prior year when asked', () => {
    expect(parseComparePriorYear(undefined)).toBe(false);
    expect(parseComparePriorYear('1')).toBe(true);
  });

  it('windows unpaid invoices to 365 days and paid receipts to 30', () => {
    expect(unpaidWindow('2026-09-05')).toEqual({ from: '2025-09-05', to: '2026-09-05' });
    expect(paidWindow('2026-09-05')).toEqual({ from: '2026-08-06', to: '2026-09-05' });
  });

  it('uses Monday–Sunday weeks and the prior calendar quarter', () => {
    expect(isoWeekBounds('2026-09-05')).toEqual({ from: '2026-08-31', to: '2026-09-06' });
    expect(previousIsoWeekBounds('2026-09-05')).toEqual({ from: '2026-08-24', to: '2026-08-30' });
    expect(isoWeekBounds('2026-08-31')).toEqual({ from: '2026-08-31', to: '2026-09-06' });
    expect(isoWeekBounds('2026-09-06')).toEqual({ from: '2026-08-31', to: '2026-09-06' });
    expect(lastQuarterBounds('2026-09-05')).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(lastQuarterBounds('2026-02-15')).toEqual({ from: '2025-10-01', to: '2025-12-31' });
    expect(yearToDateBounds('2026-09-05')).toEqual({ from: '2026-01-01', to: '2026-09-05' });
    expect(calendarYearBounds(2025)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(lastDaysBounds(180, '2026-09-05')).toEqual({ from: '2026-03-09', to: '2026-09-05' });
  });

  it('splits a bar in whole percents without inventing a total', () => {
    expect(barSharePercent('25', '100')).toBe('25');
    expect(barSharePercent('0', '0')).toBe('0');
    expect(barSharePercent('1', '3')).toBe('33');
  });

  it('spreads chart ticks across the series', () => {
    const days = [
      '2026-09-01',
      '2026-09-06',
      '2026-09-11',
      '2026-09-16',
      '2026-09-21',
      '2026-09-26',
    ];
    expect(pickChartTicks(days, 6)).toEqual(days);
    expect(pickChartTicks(days, 3)).toEqual(['2026-09-01', '2026-09-16', '2026-09-26']);
  });
});
