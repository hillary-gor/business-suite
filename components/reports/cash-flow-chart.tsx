import { FLOW_COLORS, buildCashFlowPlot, type FlowPlotMode } from '@/lib/cash-flow-plot';
import type { CashFlowChartPoint } from '@/lib/cash-flow';

export function CashFlowChart({
  series,
  mode,
  currency,
}: {
  series: readonly CashFlowChartPoint[];
  mode: FlowPlotMode;
  currency: string;
}) {
  const plot = buildCashFlowPlot(series, mode, currency);
  return (
    <svg
      className="cflo-chart"
      viewBox={`0 0 ${plot.width} ${plot.height}`}
      role="img"
      aria-label={
        mode === 'balance' ? 'Cash balance over time' : 'Money in and money out over time'
      }
    >
      {plot.future ? (
        <rect
          x={plot.future.x}
          y={plot.plotY}
          width={Math.max(0, plot.future.width)}
          height={plot.plotH}
          fill={FLOW_COLORS.futureFill}
          opacity="0.7"
        />
      ) : null}
      {plot.grid.map((line) => (
        <line
          key={line.y}
          x1={plot.plotX}
          x2={plot.plotX + plot.plotW}
          y1={line.y}
          y2={line.y}
          stroke="var(--line)"
        />
      ))}
      <line
        x1={plot.plotX}
        x2={plot.plotX + plot.plotW}
        y1={plot.thresholdY}
        y2={plot.thresholdY}
        stroke={FLOW_COLORS.threshold}
        strokeWidth="1.2"
      />
      {plot.yLabels.map((label) => (
        <text key={`${label.y}-${label.text}`} x={label.x} y={label.y} className="cflo-chart__axis">
          {label.text}
        </text>
      ))}
      {mode === 'inout' ? (
        plot.bars.map((bar) => (
          <rect
            key={bar.key}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx="1"
            fill={bar.kind === 'in' ? FLOW_COLORS.moneyIn : FLOW_COLORS.moneyOut}
          />
        ))
      ) : (
        <>
          {plot.projected ? (
            <polyline
              points={plot.projected}
              fill="none"
              stroke={FLOW_COLORS.projected}
              strokeWidth="2"
              strokeDasharray="5 4"
              strokeLinejoin="round"
            />
          ) : null}
          {plot.actual ? (
            <polyline
              points={plot.actual}
              fill="none"
              stroke={FLOW_COLORS.actual}
              strokeWidth="2.4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
        </>
      )}
      {plot.xLabels.map((label) => (
        <text
          key={`t-${label.x}-${label.text}`}
          x={label.x}
          y={label.y}
          textAnchor="middle"
          className="cflo-chart__axis"
        >
          {label.text}
        </text>
      ))}
    </svg>
  );
}
