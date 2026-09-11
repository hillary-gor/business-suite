import { formatMoney } from '@/lib/money';
import { type AgingSlice } from '@/lib/performance-centre';
import {
  DONUT_PLOT,
  TIME_PLOT,
  TIME_PLOT_INNER,
  buildCashPlot,
  buildDonutPlot,
  buildTimePlot,
} from '@/lib/performance-plot';
import type { TimePoint } from '@/lib/performance-view';

export function TimeChart({
  series,
  currency,
  style,
  isMoney = true,
}: {
  series: readonly TimePoint[];
  currency: string;
  style: 'line' | 'bar';
  isMoney?: boolean;
}) {
  const plot = buildTimePlot(series, currency, style, isMoney);
  return (
    <svg className="perf-chart" viewBox={`0 0 ${plot.width} ${plot.height}`} role="img">
      {plot.grid.map((line) => (
        <line
          key={line.y}
          x1={TIME_PLOT.padX}
          x2={TIME_PLOT.padX + TIME_PLOT_INNER.plotW}
          y1={line.y}
          y2={line.y}
          stroke="var(--line)"
        />
      ))}
      {plot.yLabels.map((label) => (
        <text key={`${label.y}-${label.text}`} x={label.x} y={label.y} className="perf-chart__axis">
          {label.text}
        </text>
      ))}
      {plot.style === 'bar' ? (
        plot.bars.map((bar) => (
          <rect
            key={bar.key}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx="2"
            fill="var(--brand)"
          />
        ))
      ) : (
        <>
          {plot.prior ? (
            <polyline
              points={plot.prior}
              fill="none"
              stroke="var(--line-strong)"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
          ) : null}
          <polyline
            points={plot.current}
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2.4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {plot.dots.map((dot) => (
            <circle key={dot.key} cx={dot.cx} cy={dot.cy} r="3.2" fill="var(--brand)" />
          ))}
        </>
      )}
      {plot.xLabels.map((label) => (
        <text
          key={`t-${label.x}-${label.text}`}
          x={label.x}
          y={label.y}
          textAnchor="middle"
          className="perf-chart__axis"
        >
          {label.text}
        </text>
      ))}
    </svg>
  );
}

export function CashChart({
  operating,
  investing,
  financing,
  currency,
}: {
  operating: readonly TimePoint[];
  investing: readonly TimePoint[];
  financing: readonly TimePoint[];
  currency: string;
}) {
  const plot = buildCashPlot(operating, investing, financing, currency);
  return (
    <svg className="perf-chart" viewBox={`0 0 ${plot.width} ${plot.height}`} role="img">
      {plot.grid.map((line) => (
        <line
          key={line.y}
          x1={TIME_PLOT.padX}
          x2={TIME_PLOT.padX + TIME_PLOT_INNER.plotW}
          y1={line.y}
          y2={line.y}
          stroke="var(--line)"
        />
      ))}
      {plot.yLabels.map((label) => (
        <text key={`${label.y}-${label.text}`} x={label.x} y={label.y} className="perf-chart__axis">
          {label.text}
        </text>
      ))}
      <polyline points={plot.investing} fill="none" stroke="#34c759" strokeWidth="2.2" />
      <polyline points={plot.operating} fill="none" stroke="var(--brand)" strokeWidth="2.2" />
      <polyline points={plot.financing} fill="none" stroke="#e6b800" strokeWidth="2.2" />
      {plot.xLabels.map((label) => (
        <text
          key={label.text}
          x={label.x}
          y={label.y}
          textAnchor="middle"
          className="perf-chart__axis"
        >
          {label.text}
        </text>
      ))}
    </svg>
  );
}

export function DonutChart({
  slices,
  currency,
}: {
  slices: readonly AgingSlice[];
  currency: string;
}) {
  const { totalZero, arcs } = buildDonutPlot(slices);
  const { cx, cy, radius, size, strokeWidth } = DONUT_PLOT;
  return (
    <div className="perf-donut">
      <ul className="perf-donut__legend">
        {slices.map((slice) => (
          <li key={slice.bucket}>
            <span
              className="perf-donut__swatch"
              style={{ background: arcs.find((arc) => arc.bucket === slice.bucket)?.color }}
            />
            <span>{slice.label}</span>
            <strong>{formatMoney(slice.amount, { currency, showCurrency: true })}</strong>
          </li>
        ))}
      </ul>
      <svg viewBox={`0 0 ${size} ${size}`} className="perf-donut__ring" aria-hidden="true">
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={strokeWidth}
        />
        {totalZero
          ? null
          : arcs.map((arc) => {
              if (arc.dash <= 0) return null;
              return (
                <circle
                  key={arc.bucket}
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={arc.full ? undefined : `${arc.dash} ${arc.gap}`}
                  strokeDashoffset={arc.full ? undefined : -arc.offset}
                  transform={`rotate(-90 ${cx} ${cy})`}
                />
              );
            })}
      </svg>
    </div>
  );
}
