import { describe, expect, it } from 'vitest';
import {
  formatReportDateRange,
  formatReportTimestamp,
  parseIsoDate,
  parseReportBasis,
  parseReportPeriod,
  reportPeriodRange,
  resolveReportQuery,
} from '@/lib/report-periods';

describe('report periods', () => {
  const today = '2026-09-05';

  it('defaults to this month to date and accrual', () => {
    expect(parseReportPeriod(undefined)).toBe('this_month_to_date');
    expect(parseReportBasis(undefined)).toBe('ACCRUAL');
    expect(parseReportBasis('CASH')).toBe('CASH');
    expect(reportPeriodRange('this_month_to_date', today)).toEqual({
      from: '2026-09-01',
      to: '2026-09-05',
    });
  });

  it('builds calendar windows from a Nairobi date, not UTC', () => {
    expect(reportPeriodRange('this_month', today)).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(reportPeriodRange('this_quarter', today)).toEqual({
      from: '2026-07-01',
      to: '2026-09-30',
    });
    expect(reportPeriodRange('this_year', today)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(reportPeriodRange('this_year_to_date', today)).toEqual({
      from: '2026-01-01',
      to: '2026-09-05',
    });
    expect(reportPeriodRange('last_month', today)).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(reportPeriodRange('this_week', today)).toEqual({ from: '2026-08-31', to: '2026-09-06' });
  });

  it('prints a compact date range for the report heading', () => {
    expect(formatReportDateRange('2026-09-01', '2026-09-05')).toBe('September 1-5, 2026');
    expect(formatReportDateRange('2026-09-05', '2026-09-05')).toBe('September 5, 2026');
    expect(formatReportDateRange('2026-08-01', '2026-09-05')).toBe('August 1 - September 5, 2026');
  });

  it('prints the Nairobi stamp without an extra at', () => {
    expect(formatReportTimestamp(new Date('2026-09-05T12:56:00.000Z'))).toBe(
      'Saturday, September 5, 2026 03:56 PM GMT+03:00',
    );
  });

  it('uses custom from/to only when the period is custom, and swaps inverted dates', () => {
    expect(parseIsoDate('2026-02-31')).toBeNull();
    expect(
      resolveReportQuery(
        { period: 'this_month_to_date', from: '2020-01-01', to: '2020-01-31', basis: 'CASH' },
        today,
      ),
    ).toEqual({
      period: 'this_month_to_date',
      from: '2026-09-01',
      to: '2026-09-05',
      basis: 'CASH',
    });
    expect(
      resolveReportQuery({ period: 'custom', from: '2026-09-05', to: '2026-09-01' }, today),
    ).toEqual({
      period: 'custom',
      from: '2026-09-01',
      to: '2026-09-05',
      basis: 'ACCRUAL',
    });
  });
});
