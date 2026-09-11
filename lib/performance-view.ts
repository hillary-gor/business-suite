import { Money } from '@/lib/money';
import {
  CHART_DEFINITIONS,
  monthShort,
  monthsInRange,
  priorMonthKey,
  type AgingSlice,
  type CashMonthTotals,
  type ChartMetric,
  type PerformancePayload,
  type PerformanceWidget,
  type PnlMonthTotals,
} from '@/lib/performance-centre';
import { reportPeriodRange, type ReportPeriod } from '@/lib/report-periods';

export type TimePoint = { key: string; label: string; amount: string; prior: string };

export type WidgetView = {
  title: string;
  subtitle: string;
  periodLabel: string;
  headline: string;
  isMoney: boolean;
  series: TimePoint[];
  cash: { operating: TimePoint[]; investing: TimePoint[]; financing: TimePoint[] } | null;
  aging: AgingSlice[] | null;
};

export function widgetView(
  widget: PerformanceWidget,
  payload: PerformancePayload,
  today: string,
): WidgetView {
  const def = CHART_DEFINITIONS[widget.metric];
  const range = reportPeriodRange(
    def.kind === 'aging' ? 'today' : (widget.period as ReportPeriod),
    today,
  );
  const months = monthsInRange(range.from, range.to);
  const title = widget.name;
  const periodLabel = def.kind === 'aging' ? 'As of today' : rangeLabel(widget.period);

  if (def.kind === 'aging') {
    const aging = widget.metric === 'ap_aging' ? payload.apAging : payload.arAging;
    const total = Money.sum(aging.map((row) => row.amount));
    return {
      title,
      subtitle: def.subtitle,
      periodLabel,
      headline: total.toDecimal().toString(),
      isMoney: true,
      series: [],
      cash: null,
      aging,
    };
  }

  if (widget.metric === 'cash_flow') {
    const operating: TimePoint[] = [];
    const investing: TimePoint[] = [];
    const financing: TimePoint[] = [];
    let net = Money.from('0');
    for (const key of months) {
      const row = payload.cashByMonth[key] ?? emptyCash();
      operating.push(point(key, row.operating, '0'));
      investing.push(point(key, row.investing, '0'));
      financing.push(point(key, row.financing, '0'));
      net = net.plus(row.net);
    }
    return {
      title,
      subtitle: def.subtitle,
      periodLabel,
      headline: net.toDecimal().toString(),
      isMoney: true,
      series: operating.map((item, index) => ({
        ...item,
        amount: Money.from(item.amount)
          .plus(investing[index]?.amount ?? '0')
          .plus(financing[index]?.amount ?? '0')
          .toDecimal()
          .toString(),
      })),
      cash: { operating, investing, financing },
      aging: null,
    };
  }

  if (def.kind === 'ratio') {
    const series: TimePoint[] = months.map((key) => {
      const row = payload.ratioByMonth[key];
      const value = widget.metric === 'quick_ratio' ? row?.quick : row?.current;
      const prior = payload.ratioByMonth[priorMonthKey(key)];
      const priorValue = widget.metric === 'quick_ratio' ? prior?.quick : prior?.current;
      return {
        key,
        label: monthShort(key),
        amount: value ?? '',
        prior: priorValue ?? '',
      };
    });
    const last = [...series].reverse().find((item) => item.amount !== '');
    return {
      title,
      subtitle: def.subtitle,
      periodLabel,
      headline: last?.amount || '—',
      isMoney: false,
      series,
      cash: null,
      aging: null,
    };
  }

  const series: TimePoint[] = months.map((key) => {
    const amount = pnlAmount(payload.pnlByMonth[key], widget.metric);
    const prior = pnlAmount(payload.pnlByMonth[priorMonthKey(key)], widget.metric);
    return point(key, amount, prior);
  });
  const total = Money.sum(series.map((item) => item.amount));
  return {
    title,
    subtitle: def.subtitle,
    periodLabel,
    headline: total.toDecimal().toString(),
    isMoney: true,
    series,
    cash: null,
    aging: null,
  };
}

function rangeLabel(period: ReportPeriod): string {
  switch (period) {
    case 'this_year_to_date':
      return 'This year to date';
    case 'this_year':
      return 'This year';
    case 'this_quarter':
      return 'This quarter';
    case 'this_month_to_date':
      return 'This month to date';
    case 'last_month':
      return 'Last month';
    case 'last_year':
      return 'Last year';
    default:
      return 'This year to date';
  }
}

function emptyCash(): CashMonthTotals {
  return { operating: '0', investing: '0', financing: '0', net: '0' };
}

function point(key: string, amount: string, prior: string): TimePoint {
  return { key, label: monthShort(key), amount, prior };
}

function pnlAmount(row: PnlMonthTotals | undefined, metric: ChartMetric): string {
  if (!row) return '0';
  switch (metric) {
    case 'expenses':
      return row.expenses;
    case 'revenue':
      return row.revenue;
    case 'gross_profit':
      return row.gross;
    case 'net_profit':
      return row.net;
    case 'cogs':
      return row.cogs;
    default:
      return '0';
  }
}
