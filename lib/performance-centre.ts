/**
 * Performance centre chart catalogue and layout.
 *
 * Widgets are stored per browser. Amounts never live here — the page loads
 * figures from posted books and the widgets only name which series to show.
 */
import { reportPeriodLabel, type ReportPeriod } from '@/lib/report-periods';

export const PERFORMANCE_LAYOUT_KEY = 'skyjet.performance-centre';
export const MAX_PERFORMANCE_CHARTS = 25;

export const CHART_METRICS = [
  'expenses',
  'revenue',
  'gross_profit',
  'net_profit',
  'cogs',
  'cash_flow',
  'ar_aging',
  'ap_aging',
  'current_ratio',
  'quick_ratio',
] as const;

export type ChartMetric = (typeof CHART_METRICS)[number];
export type ChartStyle = 'line' | 'bar' | 'donut';

export type PerformanceWidget = {
  id: string;
  metric: ChartMetric;
  name: string;
  period: ReportPeriod;
  style: ChartStyle;
};

export const PERFORMANCE_PERIODS = [
  'this_year_to_date',
  'this_year',
  'this_quarter',
  'this_month_to_date',
  'last_month',
  'last_year',
] as const satisfies readonly ReportPeriod[];

export const AGING_BUCKETS = [
  { id: 'current', label: 'Current' },
  { id: '1-7', label: '1-7 days' },
  { id: '8-14', label: '8-14 days' },
  { id: '15-21', label: '15-21 days' },
  { id: '22-28', label: '22-28 days' },
  { id: '29-60', label: '29 days - 2 months' },
  { id: '61-180', label: '2-6 months' },
  { id: '181+', label: '>6 months' },
] as const;

export type AgingBucketId = (typeof AGING_BUCKETS)[number]['id'];

export const AGING_COLORS: Record<AgingBucketId, string> = {
  current: '#248a3d',
  '1-7': '#0071e3',
  '8-14': '#e6b800',
  '15-21': '#f5a623',
  '22-28': '#de071c',
  '29-60': '#b25000',
  '61-180': '#7c3aed',
  '181+': '#6e6e73',
};

export type ChartDefinition = {
  metric: ChartMetric;
  shortName: string;
  title: string;
  subtitle: string;
  defaultStyle: ChartStyle;
  kind: 'time' | 'aging' | 'ratio';
  addLabel: string;
};

export const CHART_DEFINITIONS: Record<ChartMetric, ChartDefinition> = {
  expenses: {
    metric: 'expenses',
    shortName: 'Expenses',
    title: 'Expenses by time',
    subtitle: 'Total expenses',
    defaultStyle: 'line',
    kind: 'time',
    addLabel: 'Expenses over time',
  },
  revenue: {
    metric: 'revenue',
    shortName: 'Revenue',
    title: 'Revenue by time',
    subtitle: 'Total revenue',
    defaultStyle: 'bar',
    kind: 'time',
    addLabel: 'Revenue over time',
  },
  gross_profit: {
    metric: 'gross_profit',
    shortName: 'Gross profit',
    title: 'Gross profit by time',
    subtitle: 'Total gross profit',
    defaultStyle: 'line',
    kind: 'time',
    addLabel: 'Gross profit over time',
  },
  net_profit: {
    metric: 'net_profit',
    shortName: 'Net profit',
    title: 'Net profit by time',
    subtitle: 'Total net profit',
    defaultStyle: 'line',
    kind: 'time',
    addLabel: 'Net profit over time',
  },
  cogs: {
    metric: 'cogs',
    shortName: 'COGS',
    title: 'COGS by time',
    subtitle: 'Total cost of sales',
    defaultStyle: 'line',
    kind: 'time',
    addLabel: 'COGS over time',
  },
  cash_flow: {
    metric: 'cash_flow',
    shortName: 'Cash flow',
    title: 'Cash flow',
    subtitle: 'Net cash flow',
    defaultStyle: 'line',
    kind: 'time',
    addLabel: 'Net cash flow',
  },
  ar_aging: {
    metric: 'ar_aging',
    shortName: 'Accounts receivable',
    title: 'Accounts receivable by ageing periods',
    subtitle: 'Total A/R amount',
    defaultStyle: 'donut',
    kind: 'aging',
    addLabel: 'Accounts receivable',
  },
  ap_aging: {
    metric: 'ap_aging',
    shortName: 'Accounts payable',
    title: 'Accounts payable by ageing periods',
    subtitle: 'Total A/P amount',
    defaultStyle: 'donut',
    kind: 'aging',
    addLabel: 'Accounts payable',
  },
  current_ratio: {
    metric: 'current_ratio',
    shortName: 'Current ratio',
    title: 'Current ratio by time',
    subtitle: 'Current ratio',
    defaultStyle: 'line',
    kind: 'ratio',
    addLabel: 'Current ratio',
  },
  quick_ratio: {
    metric: 'quick_ratio',
    shortName: 'Quick ratio',
    title: 'Quick ratio by time',
    subtitle: 'Quick ratio',
    defaultStyle: 'line',
    kind: 'ratio',
    addLabel: 'Quick ratio',
  },
};

export const QUICK_ADD_METRICS: readonly ChartMetric[] = [
  'expenses',
  'revenue',
  'gross_profit',
  'net_profit',
  'ar_aging',
  'ap_aging',
  'cogs',
  'cash_flow',
];

export const ADD_CHART_METRICS: readonly ChartMetric[] = [
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
];

const METRIC_SET = new Set<string>(CHART_METRICS);
const PERIOD_SET = new Set<string>(['today', ...PERFORMANCE_PERIODS]);
const STYLE_SET = new Set<string>(['line', 'bar', 'donut']);

export function newWidgetId(metric: ChartMetric): string {
  const stamp = crypto.randomUUID();
  return `chart-${metric}-${stamp}`;
}

export function defaultPerformanceWidgets(): PerformanceWidget[] {
  const defaults: ChartMetric[] = [
    'expenses',
    'ar_aging',
    'gross_profit',
    'revenue',
    'cash_flow',
    'net_profit',
    'quick_ratio',
    'current_ratio',
    'ap_aging',
  ];
  return defaults.map((metric, index) => widgetFromMetric(metric, index + 1));
}

export function widgetFromMetric(metric: ChartMetric, seed: number): PerformanceWidget {
  const def = CHART_DEFINITIONS[metric];
  return {
    id: `chart-${metric}-${seed}`,
    metric,
    name: def.title,
    period: def.kind === 'aging' ? 'today' : 'this_year_to_date',
    style: def.defaultStyle,
  };
}

export function nextWidgetName(
  metric: ChartMetric,
  existing: readonly PerformanceWidget[],
): string {
  const def = CHART_DEFINITIONS[metric];
  const count = existing.filter((widget) => widget.metric === metric).length;
  if (count === 0) return def.title;
  return `${def.shortName} ${count + 1}`;
}

export function periodCaption(widget: PerformanceWidget): string {
  if (CHART_DEFINITIONS[widget.metric].kind === 'aging') return 'As of today';
  return reportPeriodLabel(widget.period);
}

export function parsePerformanceWidgets(raw: unknown): PerformanceWidget[] | null {
  if (!Array.isArray(raw)) return null;
  const widgets: PerformanceWidget[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.name !== 'string') continue;
    if (typeof row.metric !== 'string' || !METRIC_SET.has(row.metric)) continue;
    const metric = row.metric as ChartMetric;
    const period =
      typeof row.period === 'string' && PERIOD_SET.has(row.period)
        ? (row.period as ReportPeriod)
        : widgetFromMetric(metric, 0).period;
    const style =
      typeof row.style === 'string' && STYLE_SET.has(row.style)
        ? (row.style as ChartStyle)
        : CHART_DEFINITIONS[metric].defaultStyle;
    widgets.push({
      id: row.id.slice(0, 80),
      metric,
      name: row.name.slice(0, 80),
      period: CHART_DEFINITIONS[metric].kind === 'aging' ? 'today' : period,
      style: CHART_DEFINITIONS[metric].kind === 'aging' ? 'donut' : style,
    });
    if (widgets.length >= MAX_PERFORMANCE_CHARTS) break;
  }
  return widgets;
}

export function ageingBucket(daysPastDue: number): AgingBucketId {
  if (daysPastDue <= 0) return 'current';
  if (daysPastDue <= 7) return '1-7';
  if (daysPastDue <= 14) return '8-14';
  if (daysPastDue <= 21) return '15-21';
  if (daysPastDue <= 28) return '22-28';
  if (daysPastDue <= 60) return '29-60';
  if (daysPastDue <= 180) return '61-180';
  return '181+';
}

export function monthShort(yyyyMm: string): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const month = Number(yyyyMm.slice(5, 7));
  return months[month - 1] ?? yyyyMm;
}

export function monthsInRange(from: string, to: string): string[] {
  const start = from.slice(0, 7);
  const end = to.slice(0, 7);
  const out: string[] = [];
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const endYear = Number(end.slice(0, 4));
  const endMonth = Number(end.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

export function priorMonthKey(yyyyMm: string): string {
  const year = Number(yyyyMm.slice(0, 4)) - 1;
  return `${String(year).padStart(4, '0')}-${yyyyMm.slice(5)}`;
}

export type PnlMonthTotals = {
  revenue: string;
  expenses: string;
  cogs: string;
  gross: string;
  net: string;
};

export type CashMonthTotals = {
  operating: string;
  investing: string;
  financing: string;
  net: string;
};

export type RatioMonthTotals = {
  current: string | null;
  quick: string | null;
};

export type AgingSlice = { bucket: AgingBucketId; label: string; amount: string };

export type PerformancePayload = {
  asAt: string;
  pnlByMonth: Record<string, PnlMonthTotals>;
  cashByMonth: Record<string, CashMonthTotals>;
  ratioByMonth: Record<string, RatioMonthTotals>;
  arAging: AgingSlice[];
  apAging: AgingSlice[];
};

export function performancePdfFilename(companyName: string, today: string): string {
  const slug = companyName
    .trim()
    .replace(/[^\w]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today) ?? [];
  const stamp = month && day && year ? `${month}-${day}-${year.slice(2)}` : today;
  return `${slug || 'skyjet'}_performance_${stamp}.pdf`;
}
