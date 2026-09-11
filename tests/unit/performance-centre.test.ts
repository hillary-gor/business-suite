import { describe, expect, it } from 'vitest';
import {
  ADD_CHART_METRICS,
  QUICK_ADD_METRICS,
  ageingBucket,
  defaultPerformanceWidgets,
  monthsInRange,
  nextWidgetName,
  parsePerformanceWidgets,
  performancePdfFilename,
  widgetFromMetric,
} from '@/lib/performance-centre';
import { widgetView } from '@/lib/performance-view';

describe('performance centre catalogue', () => {
  it('starts with the nine default widgets and a 25-chart cap in the labels', () => {
    const widgets = defaultPerformanceWidgets();
    expect(widgets.map((widget) => widget.metric)).toEqual([
      'expenses',
      'ar_aging',
      'gross_profit',
      'revenue',
      'cash_flow',
      'net_profit',
      'quick_ratio',
      'current_ratio',
      'ap_aging',
    ]);
    expect(
      widgets.filter((widget) => widget.period === 'today').map((widget) => widget.metric),
    ).toEqual(['ar_aging', 'ap_aging']);
  });

  it('keeps Quick add and Add new chart in the screenshot order', () => {
    expect(QUICK_ADD_METRICS).toEqual([
      'expenses',
      'revenue',
      'gross_profit',
      'net_profit',
      'ar_aging',
      'ap_aging',
      'cogs',
      'cash_flow',
    ]);
    expect(ADD_CHART_METRICS).toEqual([
      'expenses',
      'revenue',
      'gross_profit',
      'net_profit',
      'ar_aging',
      'ap_aging',
      'cogs',
      'cash_flow',
      'current_ratio',
      'quick_ratio',
    ]);
  });

  it('names a second copy Gross profit 2', () => {
    const existing = [widgetFromMetric('gross_profit', 1)];
    expect(nextWidgetName('gross_profit', existing)).toBe('Gross profit 2');
  });
});

describe('performance layout parse', () => {
  it('keeps an empty board and ageing widgets as of today', () => {
    expect(parsePerformanceWidgets([])).toEqual([]);
    const parsed = parsePerformanceWidgets([
      {
        id: 'chart-ar_aging-1',
        metric: 'ar_aging',
        name: 'Accounts receivable by ageing periods',
        period: 'this_year_to_date',
        style: 'line',
      },
    ]);
    expect(parsed?.[0]).toMatchObject({
      metric: 'ar_aging',
      period: 'today',
      style: 'donut',
    });
  });

  it('rejects junk and unknown metrics', () => {
    expect(parsePerformanceWidgets(null)).toBeNull();
    expect(parsePerformanceWidgets([{ id: 'x' }])).toEqual([]);
  });
});

describe('performance helpers', () => {
  it('buckets ageing the way the QBO board does', () => {
    expect(ageingBucket(0)).toBe('current');
    expect(ageingBucket(1)).toBe('1-7');
    expect(ageingBucket(8)).toBe('8-14');
    expect(ageingBucket(21)).toBe('15-21');
    expect(ageingBucket(28)).toBe('22-28');
    expect(ageingBucket(60)).toBe('29-60');
    expect(ageingBucket(180)).toBe('61-180');
    expect(ageingBucket(181)).toBe('181+');
  });

  it('walks months inclusively and names the PDF like the QBO pack', () => {
    expect(monthsInRange('2026-01-15', '2026-03-02')).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(performancePdfFilename('Airzone Parts', '2026-09-06')).toBe(
      'Airzone-Parts_performance_09-06-26.pdf',
    );
  });
});

describe('widgetView', () => {
  it('sums posted monthly amounts with Money, not floats', () => {
    const widget = widgetFromMetric('revenue', 1);
    const view = widgetView(
      widget,
      {
        asAt: '2026-09-06',
        pnlByMonth: {
          '2026-08': {
            revenue: '100.00',
            expenses: '0',
            cogs: '0',
            gross: '100.00',
            net: '100.00',
          },
          '2026-09': { revenue: '5.50', expenses: '0', cogs: '0', gross: '5.50', net: '5.50' },
        },
        cashByMonth: {},
        ratioByMonth: {},
        arAging: [],
        apAging: [],
      },
      '2026-09-06',
    );
    expect(view.headline).toBe('105.5');
    expect(view.series.find((point) => point.key === '2026-09')?.amount).toBe('5.50');
  });
});
