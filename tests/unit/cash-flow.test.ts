import { describe, expect, it } from 'vitest';
import {
  barShare,
  buildCashFlowSeries,
  cashFlowWindow,
  formatFlowHeadline,
  formatFlowLine,
  moneyInUpcoming,
  emptyCashFlowPayload,
} from '@/lib/cash-flow';
import { Money } from '@/lib/money';
import { buildCashFlowPlot } from '@/lib/cash-flow-plot';

describe('cash flow window', () => {
  it('shows nine past months, the current month, and two projected months for 12 months', () => {
    expect(cashFlowWindow(12, '2026-09-06')).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
  });
});

describe('cash flow projection', () => {
  it('keeps posted cash through today and then applies open invoices and bills by due date', () => {
    const payload = emptyCashFlowPayload('2026-09-06');
    payload.todayBalance = '1000';
    payload.months = payload.months.map((row) =>
      row.key === '2026-08' ? { ...row, actualBalance: '800', moneyIn: '200', moneyOut: '0' } : row,
    );
    payload.scheduled = [
      { date: '2026-10-03', amount: '5', direction: 'in' },
      { date: '2026-09-20', amount: '100', direction: 'out' },
      { date: '2026-10-06', amount: '4000', direction: 'out' },
    ];

    const series = buildCashFlowSeries(payload, 12);
    const august = series.find((point) => point.key === '2026-08');
    const september = series.find((point) => point.key === '2026-09');
    const october = series.find((point) => point.key === '2026-10');

    expect(august?.actual).toBe('800');
    expect(september?.actual).toBe('1000');
    expect(september?.future).toBe(false);
    expect(september?.projected).toBe(Money.from('900').toDecimal().toString());
    expect(october?.actual).toBeNull();
    expect(october?.future).toBe(true);
    expect(october?.projected).toBe(Money.from('-3095').toDecimal().toString());
  });
});

describe('cash flow display', () => {
  it('prints Ksh headlines and line amounts the way the overview shows them', () => {
    expect(formatFlowHeadline('5000', 'Ksh')).toBe('Ksh5,000');
    expect(formatFlowHeadline('-8000', 'Ksh')).toBe('-Ksh8,000');
    expect(formatFlowLine('-4000', 'Ksh')).toBe('Ksh-4,000.00');
    expect(formatFlowLine('5', 'Ksh')).toBe('Ksh5.00');
    expect(barShare('8000', '8000')).toBe(1);
    expect(moneyInUpcoming(emptyCashFlowPayload('2026-09-06')).amount).toBe('0');
  });
});

describe('cash flow plot', () => {
  it('shades from the current month and keeps projected points below a falling actual', () => {
    const series = buildCashFlowSeries(
      {
        today: '2026-09-06',
        todayBalance: '0',
        months: cashFlowWindow(12, '2026-09-06').map((key) => ({
          key,
          actualBalance: '0',
          moneyIn: '0',
          moneyOut: key === '2026-09' ? '8000' : '0',
        })),
        scheduled: [{ date: '2026-10-06', amount: '8000', direction: 'out' }],
      },
      12,
    );
    const plot = buildCashFlowPlot(series, 'balance', 'Ksh');
    expect(plot.future).not.toBeNull();
    expect(plot.actual.split(' ').length).toBeGreaterThan(1);
    expect(plot.projected.split(' ').length).toBeGreaterThan(1);
    expect(plot.yLabels.some((label) => label.text.includes('k'))).toBe(true);
  });
});
