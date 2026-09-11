/**
 * Shared plot geometry for the Performance centre board and the export PDF.
 *
 * Pixel placement uses a 0–1 ratio of Money amounts. That ratio is not a
 * ledger figure; every amount still originates as Money.
 */
import { Money, formatMoney } from '@/lib/money';
import { AGING_COLORS, type AgingBucketId, type AgingSlice } from '@/lib/performance-centre';
import type { TimePoint } from '@/lib/performance-view';

export const TIME_PLOT = {
  width: 560,
  height: 168,
  padX: 58,
  padY: 10,
} as const;

export const TIME_PLOT_INNER = {
  plotW: TIME_PLOT.width - TIME_PLOT.padX - 8,
  plotH: TIME_PLOT.height - TIME_PLOT.padY - 22,
} as const;

export const DONUT_PLOT = {
  size: 140,
  cx: 70,
  cy: 70,
  radius: 52,
  strokeWidth: 18,
} as const;

export const PLOT_COLORS = {
  brand: '#0071e3',
  line: '#e8e8ed',
  lineStrong: '#c7c7cc',
  axis: '#6e6e73',
  investing: '#34c759',
  financing: '#e6b800',
} as const;

export type PlotGridLine = { y: number };
export type PlotLabel = { x: number; y: number; text: string };
export type PlotBar = { key: string; x: number; y: number; width: number; height: number };
export type PlotDot = { key: string; cx: number; cy: number };

export type TimePlot = {
  width: number;
  height: number;
  grid: PlotGridLine[];
  yLabels: PlotLabel[];
  xLabels: PlotLabel[];
  style: 'line' | 'bar';
  bars: PlotBar[];
  current: string;
  prior: string;
  dots: PlotDot[];
};

export type CashPlot = {
  width: number;
  height: number;
  grid: PlotGridLine[];
  yLabels: PlotLabel[];
  xLabels: PlotLabel[];
  operating: string;
  investing: string;
  financing: string;
};

export type DonutArcPlot = {
  bucket: string;
  label: string;
  color: string;
  dash: number;
  gap: number;
  offset: number;
  full: boolean;
  path: string;
};

function extent(values: readonly string[]): { min: Money; max: Money } {
  let min = Money.from('0');
  let max = Money.from('0');
  for (const value of values) {
    if (value === '') continue;
    const amount = Money.from(value);
    if (amount.comparedTo(min) < 0) min = amount;
    if (amount.comparedTo(max) > 0) max = amount;
  }
  if (min.isPositive() || min.isZero()) min = Money.from('0');
  if (max.isNegative() || max.isZero()) max = Money.from('0');
  if (min.equals(max)) max = min.plus('1');
  return { min, max };
}

function xAt(index: number, total: number): number {
  const { padX } = TIME_PLOT;
  const { plotW } = TIME_PLOT_INNER;
  if (total <= 1) return padX + plotW / 2;
  return padX + (index / (total - 1)) * plotW;
}

function yAt(amount: string, min: Money, max: Money): number {
  const { padY } = TIME_PLOT;
  const { plotH } = TIME_PLOT_INNER;
  const span = max.minus(min);
  if (span.isZero()) return padY + plotH;
  const ratio = Number(
    Money.from(amount || '0')
      .minus(min)
      .dividedBy(span)
      .toDecimal()
      .toFixed(6),
  );
  return padY + plotH - Math.max(0, Math.min(1, ratio)) * plotH;
}

export function plotAxisLabel(amount: Money, currency: string, isMoney: boolean): string {
  if (!isMoney) return amount.toDecimal().toFixed(2);
  const abs = amount.abs();
  if (abs.comparedTo(Money.from('1000000')) >= 0) {
    return `${currency}${amount.dividedBy('1000000').roundToCurrency(1).toDecimal().toFixed(1)}M`;
  }
  if (abs.comparedTo(Money.from('1000')) >= 0) {
    return `${currency}${amount.dividedBy('1000').roundToCurrency(1).toDecimal().toFixed(1)}K`;
  }
  return formatMoney(amount, { currency, showCurrency: true, minorUnits: 0 }).replace(' ', '');
}

function gridAndAxes(
  min: Money,
  max: Money,
  series: readonly TimePoint[],
  currency: string,
  isMoney: boolean,
): Pick<TimePlot, 'width' | 'height' | 'grid' | 'yLabels' | 'xLabels'> {
  const { width, height, padY } = TIME_PLOT;
  const { plotH } = TIME_PLOT_INNER;
  const mid = min.plus(max).dividedBy(2);
  return {
    width,
    height,
    grid: [0, 0.5, 1].map((stop) => ({ y: padY + plotH * (1 - stop) })),
    yLabels: [
      { x: 4, y: padY + 8, text: plotAxisLabel(max, currency, isMoney) },
      { x: 4, y: padY + plotH / 2 + 4, text: plotAxisLabel(mid, currency, isMoney) },
      { x: 4, y: padY + plotH, text: plotAxisLabel(min, currency, isMoney) },
    ],
    xLabels: series.map((point, index) => ({
      x: xAt(index, series.length),
      y: height - 2,
      text: point.label,
    })),
  };
}

function polyline(points: readonly TimePoint[], min: Money, max: Money): string {
  return points
    .map(
      (point, index) =>
        `${xAt(index, points.length).toFixed(1)},${yAt(point.amount || '0', min, max).toFixed(1)}`,
    )
    .join(' ');
}

export function buildTimePlot(
  series: readonly TimePoint[],
  currency: string,
  style: 'line' | 'bar',
  isMoney = true,
): TimePlot {
  const { padY } = TIME_PLOT;
  const { plotH, plotW } = TIME_PLOT_INNER;
  const values = series.flatMap((point) => [point.amount || '0', point.prior || '0']);
  const { min, max } = extent(values);
  const axes = gridAndAxes(min, max, series, currency, isMoney);
  const barW = series.length > 0 ? Math.max(6, Math.min(28, plotW / series.length - 8)) : 8;
  const current = series
    .map(
      (point, index) =>
        `${xAt(index, series.length).toFixed(1)},${yAt(point.amount || '0', min, max).toFixed(1)}`,
    )
    .join(' ');
  const prior = series.some((point) => point.prior !== '')
    ? series
        .map(
          (point, index) =>
            `${xAt(index, series.length).toFixed(1)},${yAt(point.prior || '0', min, max).toFixed(1)}`,
        )
        .join(' ')
    : '';

  return {
    ...axes,
    style,
    bars:
      style === 'bar'
        ? series.map((point, index) => {
            const y = yAt(point.amount || '0', min, max);
            return {
              key: point.key,
              x: xAt(index, series.length) - barW / 2,
              y,
              width: barW,
              height: Math.max(0, padY + plotH - y),
            };
          })
        : [],
    current,
    prior,
    dots:
      style === 'line'
        ? series.flatMap((point, index) =>
            point.amount === ''
              ? []
              : [
                  {
                    key: point.key,
                    cx: xAt(index, series.length),
                    cy: yAt(point.amount || '0', min, max),
                  },
                ],
          )
        : [],
  };
}

export function buildCashPlot(
  operating: readonly TimePoint[],
  investing: readonly TimePoint[],
  financing: readonly TimePoint[],
  currency: string,
): CashPlot {
  const values = [...operating, ...investing, ...financing].map((point) => point.amount || '0');
  const { min, max } = extent(values);
  const axes = gridAndAxes(min, max, operating, currency, true);
  return {
    width: axes.width,
    height: axes.height,
    grid: axes.grid,
    yLabels: axes.yLabels,
    xLabels: axes.xLabels,
    operating: polyline(operating, min, max),
    investing: polyline(investing, min, max),
    financing: polyline(financing, min, max),
  };
}

function polar(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

function strokeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polar(cx, cy, radius, startAngle);
  const end = polar(cx, cy, radius, endAngle);
  const delta = endAngle - startAngle;
  const large = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta > 0 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${large} ${sweep} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function fullCirclePath(cx: number, cy: number, radius: number): string {
  return `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx} ${cy + radius} A ${radius} ${radius} 0 1 1 ${cx} ${cy - radius}`;
}

export function buildDonutPlot(slices: readonly AgingSlice[]): {
  totalZero: boolean;
  arcs: DonutArcPlot[];
} {
  const total = Money.sum(slices.map((slice) => slice.amount));
  const { cx, cy, radius } = DONUT_PLOT;
  const circ = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = slices.map((slice) => {
    const share = total.isZero()
      ? 0
      : Number(Money.from(slice.amount).dividedBy(total).toDecimal().toFixed(6));
    const dash = share * circ;
    const gap = circ - dash;
    const startAngle = -Math.PI / 2 + (circ === 0 ? 0 : (offset / circ) * 2 * Math.PI);
    const endAngle = -Math.PI / 2 + (circ === 0 ? 0 : ((offset + dash) / circ) * 2 * Math.PI);
    const full = dash > 0 && gap <= 0.5;
    const arc: DonutArcPlot = {
      bucket: slice.bucket,
      label: slice.label,
      color: AGING_COLORS[slice.bucket as AgingBucketId],
      dash,
      gap,
      offset,
      full,
      path:
        dash <= 0
          ? ''
          : full
            ? fullCirclePath(cx, cy, radius)
            : strokeArc(cx, cy, radius, startAngle, endAngle),
    };
    offset += dash;
    return arc;
  });
  return { totalZero: total.isZero(), arcs };
}
