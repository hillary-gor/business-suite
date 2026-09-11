import { formatMoney, Money } from '@/lib/money';
import { chartDayLabel, pickChartTicks } from '@/lib/sales-overview';

export function IncomeChart({
  series,
  prior,
  currency,
}: {
  series: readonly { day: string; amount: string }[];
  prior?: readonly { day: string; amount: string }[];
  currency: string;
}) {
  const width = 640;
  const height = 180;
  const padX = 72;
  const padY = 16;
  const plotW = width - padX - 12;
  const plotH = height - padY - 24;

  let max = Money.from('0');
  for (const point of [...series, ...(prior ?? [])]) {
    const value = Money.from(point.amount).abs();
    if (value.comparedTo(max) > 0) max = value;
  }

  function xAt(index: number, total: number): number {
    if (total <= 1) return padX;
    return padX + (index / (total - 1)) * plotW;
  }

  function yAt(amount: string): number {
    if (max.isZero()) return padY + plotH;
    const ratio = Number(Money.from(amount).dividedBy(max).toDecimal().toFixed(6));
    return padY + plotH - Math.max(0, Math.min(1, ratio)) * plotH;
  }

  function pointsFor(points: readonly { day: string; amount: string }[]): string {
    return points
      .map(
        (point, index) => `${xAt(index, points.length).toFixed(1)},${yAt(point.amount).toFixed(1)}`,
      )
      .join(' ');
  }

  const ticks = pickChartTicks(series.map((point) => point.day));
  const mid = max.dividedBy(2);
  const currentPoints = series.length > 0 ? pointsFor(series) : '';
  const priorPoints = prior && prior.length > 0 ? pointsFor(prior) : '';
  const showDots = series.length > 0 && series.length <= 32;

  return (
    <svg
      className="sales-ov__chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Income over time in ${currency}`}
    >
      <line
        x1={padX}
        y1={padY}
        x2={padX}
        y2={padY + plotH}
        stroke="currentColor"
        strokeOpacity="0.2"
      />
      <line
        x1={padX}
        y1={padY + plotH}
        x2={padX + plotW}
        y2={padY + plotH}
        stroke="currentColor"
        strokeOpacity="0.2"
      />
      <text x={8} y={padY + 4} className="sales-ov__axis">
        {axisLabel(max, currency)}
      </text>
      <text x={8} y={padY + plotH / 2} className="sales-ov__axis">
        {axisLabel(mid, currency)}
      </text>
      <text x={8} y={padY + plotH} className="sales-ov__axis">
        {axisLabel(Money.from('0'), currency)}
      </text>
      {priorPoints ? (
        <polyline
          points={priorPoints}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {currentPoints ? (
        <polyline
          points={currentPoints}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {showDots
        ? series.map((point, index) => (
            <circle
              key={point.day}
              cx={xAt(index, series.length)}
              cy={yAt(point.amount)}
              r="3"
              fill="var(--brand)"
            />
          ))
        : null}
      {ticks.map((day) => {
        const index = series.findIndex((point) => point.day === day);
        if (index < 0) return null;
        return (
          <text
            key={day}
            x={xAt(index, series.length)}
            y={height - 4}
            textAnchor="middle"
            className="sales-ov__axis"
          >
            {chartDayLabel(day)}
          </text>
        );
      })}
    </svg>
  );
}

function axisLabel(amount: Money, currency: string): string {
  return formatMoney(amount, { currency, showCurrency: true, minorUnits: 0 });
}
