/**
 * SVG geometry for the cash flow overview chart.
 *
 * Pixel placement uses a 0–1 ratio of Money amounts. That ratio is not a
 * ledger figure; every amount still originates as Money.
 */
import { Money } from '@/lib/money';
import type { CashFlowChartPoint } from '@/lib/cash-flow';

export const FLOW_PLOT = {
  width: 720,
  height: 228,
  padX: 52,
  padY: 16,
  padRight: 12,
  padBottom: 28,
} as const;

export const FLOW_COLORS = {
  actual: '#2f9e44',
  projected: '#2f9e44',
  threshold: '#8e8e93',
  futureFill: '#f8d7da',
  moneyIn: '#8fd19e',
  moneyOut: '#1b6b5a',
} as const;

export type FlowPlotMode = 'balance' | 'inout';

export type FlowPlot = {
  width: number;
  height: number;
  plotX: number;
  plotY: number;
  plotW: number;
  plotH: number;
  grid: Array<{ y: number }>;
  yLabels: Array<{ x: number; y: number; text: string }>;
  xLabels: Array<{ x: number; y: number; text: string }>;
  thresholdY: number;
  future: { x: number; width: number } | null;
  actual: string;
  projected: string;
  bars: Array<{
    key: string;
    kind: 'in' | 'out';
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
};

function plotInner() {
  return {
    plotX: FLOW_PLOT.padX,
    plotY: FLOW_PLOT.padY,
    plotW: FLOW_PLOT.width - FLOW_PLOT.padX - FLOW_PLOT.padRight,
    plotH: FLOW_PLOT.height - FLOW_PLOT.padY - FLOW_PLOT.padBottom,
  };
}

function extent(values: readonly string[]): { min: Money; max: Money } {
  let min = Money.from('0');
  let max = Money.from('0');
  for (const value of values) {
    const amount = Money.from(value);
    if (amount.comparedTo(min) < 0) min = amount;
    if (amount.comparedTo(max) > 0) max = amount;
  }
  if (min.isPositive() || min.isZero()) min = Money.from('0');
  if (max.isNegative() || max.isZero()) max = Money.from('0');
  if (min.equals(max)) {
    min = Money.from('-1');
    max = Money.from('1');
  }
  return { min, max };
}

function xAt(index: number, total: number, plotX: number, plotW: number): number {
  if (total <= 1) return plotX + plotW / 2;
  return plotX + (index / (total - 1)) * plotW;
}

function yAt(amount: string, min: Money, max: Money, plotY: number, plotH: number): number {
  const span = max.minus(min);
  if (span.isZero()) return plotY + plotH;
  const ratio = Number(Money.from(amount).minus(min).dividedBy(span).toDecimal().toFixed(6));
  return plotY + plotH - Math.max(0, Math.min(1, ratio)) * plotH;
}

function axisLabel(amount: Money): string {
  const sign = amount.isNegative() ? '-' : '';
  const abs = amount.abs();
  if (abs.comparedTo(Money.from('1000000')) >= 0) {
    return `${sign}${abs.dividedBy('1000000').roundToCurrency(1).toDecimal().toFixed(1)}M`;
  }
  if (abs.comparedTo(Money.from('1000')) >= 0) {
    return `${sign}${abs.dividedBy('1000').roundToCurrency(0).toDecimal().toFixed(0)}k`;
  }
  return `${sign}${abs.roundToCurrency(0).toDecimal().toFixed(0)}`;
}

export function buildCashFlowPlot(
  series: readonly CashFlowChartPoint[],
  mode: FlowPlotMode,
  _currency: string,
): FlowPlot {
  const { width, height } = FLOW_PLOT;
  const { plotX, plotY, plotW, plotH } = plotInner();
  const values =
    mode === 'balance'
      ? series.flatMap((point) => [point.actual ?? point.projected, point.projected, '0'])
      : series.flatMap((point) => [
          point.moneyIn,
          Money.from(point.moneyOut).times(-1).toDecimal().toString(),
          '0',
        ]);
  const { min, max } = extent(values);
  const mid = min.plus(max).dividedBy(2);
  const firstFuture = series.findIndex((point) => point.future);
  const currentIndex = firstFuture > 0 ? firstFuture - 1 : firstFuture;
  const future =
    currentIndex >= 0 && series.length > 1
      ? {
          x: xAt(currentIndex, series.length, plotX, plotW),
          width: plotX + plotW - xAt(currentIndex, series.length, plotX, plotW),
        }
      : null;

  const actualPts = series
    .map((point, index) =>
      point.actual === null
        ? null
        : `${xAt(index, series.length, plotX, plotW).toFixed(1)},${yAt(point.actual, min, max, plotY, plotH).toFixed(1)}`,
    )
    .filter((point): point is string => point !== null);

  const projectedPts = series.map((point, index) => {
    const value =
      point.future || point.actual === null ? point.projected : (point.actual ?? point.projected);
    return `${xAt(index, series.length, plotX, plotW).toFixed(1)},${yAt(value, min, max, plotY, plotH).toFixed(1)}`;
  });

  const lastActualIndex =
    [...series.keys()].reverse().find((index) => series[index]?.actual !== null) ?? 0;
  const projectedLine = projectedPts.slice(lastActualIndex).join(' ');

  const groupW = series.length > 0 ? Math.max(8, Math.min(28, plotW / series.length - 10)) : 8;
  const barW = Math.max(3, groupW / 2 - 1);
  const zeroY = yAt('0', min, max, plotY, plotH);

  return {
    width,
    height,
    plotX,
    plotY,
    plotW,
    plotH,
    grid: [0, 0.5, 1].map((stop) => ({ y: plotY + plotH * (1 - stop) })),
    yLabels: [
      { x: 4, y: plotY + 8, text: axisLabel(max) },
      { x: 4, y: plotY + plotH / 2 + 4, text: axisLabel(mid) },
      { x: 4, y: plotY + plotH, text: axisLabel(min) },
    ],
    xLabels: series.map((point, index) => ({
      x: xAt(index, series.length, plotX, plotW),
      y: height - 6,
      text: point.label,
    })),
    thresholdY: zeroY,
    future,
    actual: actualPts.join(' '),
    projected: projectedLine,
    bars:
      mode === 'inout'
        ? series.flatMap((point, index) => {
            const cx = xAt(index, series.length, plotX, plotW);
            const inY = yAt(point.moneyIn, min, max, plotY, plotH);
            const outAmount = Money.from(point.moneyOut).times(-1).toDecimal().toString();
            const outY = yAt(outAmount, min, max, plotY, plotH);
            return [
              {
                key: `${point.key}-in`,
                kind: 'in' as const,
                x: cx - barW - 1,
                y: inY,
                width: barW,
                height: Math.max(0, zeroY - inY),
              },
              {
                key: `${point.key}-out`,
                kind: 'out' as const,
                x: cx + 1,
                y: zeroY,
                width: barW,
                height: Math.max(0, outY - zeroY),
              },
            ];
          })
        : [],
  };
}
