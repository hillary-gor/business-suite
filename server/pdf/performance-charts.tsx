import { Circle, G, Path, Polyline, Rect, Svg, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatMoney } from '@/lib/money';
import type { AgingSlice } from '@/lib/performance-centre';
import {
  DONUT_PLOT,
  PLOT_COLORS,
  TIME_PLOT,
  TIME_PLOT_INNER,
  buildCashPlot,
  buildDonutPlot,
  buildTimePlot,
} from '@/lib/performance-plot';
import type { TimePoint, WidgetView } from '@/lib/performance-view';

const styles = StyleSheet.create({
  chart: {
    width: '90%',
    alignSelf: 'center',
    marginBottom: 16,
  },
  donut: {
    width: '90%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  ring: {
    marginLeft: 16,
  },
  legend: {
    flex: 1,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
    marginRight: 6,
  },
  legendLabel: {
    flex: 1,
    fontSize: 8,
    color: PLOT_COLORS.axis,
  },
  legendValue: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
});

const axisStyle = { fontSize: 8, fill: PLOT_COLORS.axis } as never;

function TimeSvg({
  series,
  currency,
  style,
  isMoney,
}: {
  series: readonly TimePoint[];
  currency: string;
  style: 'line' | 'bar';
  isMoney: boolean;
}) {
  const plot = buildTimePlot(series, currency, style, isMoney);
  return (
    <View style={styles.chart}>
      <Svg viewBox={`0 0 ${plot.width} ${plot.height}`} width={515} height={154}>
        {plot.grid.map((line) => (
          <Rect
            key={`g-${line.y}`}
            x={TIME_PLOT.padX}
            y={line.y}
            width={TIME_PLOT_INNER.plotW}
            height={0.6}
            fill={PLOT_COLORS.line}
          />
        ))}
        {plot.yLabels.map((label) => (
          <Text key={`y-${label.y}`} x={label.x} y={label.y} style={axisStyle}>
            {label.text}
          </Text>
        ))}
        {plot.style === 'bar' ? (
          plot.bars.map((bar) => (
            <Rect
              key={bar.key}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={Math.max(bar.height, 0.5)}
              rx={2}
              fill={PLOT_COLORS.brand}
            />
          ))
        ) : (
          <G>
            {plot.prior ? (
              <Polyline
                points={plot.prior}
                fill="none"
                stroke={PLOT_COLORS.lineStrong}
                strokeWidth={2}
                strokeDasharray="5 4"
              />
            ) : null}
            <Polyline
              points={plot.current}
              fill="none"
              stroke={PLOT_COLORS.brand}
              strokeWidth={2.4}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {plot.dots.map((dot) => (
              <Circle key={dot.key} cx={dot.cx} cy={dot.cy} r={3.2} fill={PLOT_COLORS.brand} />
            ))}
          </G>
        )}
        {plot.xLabels.map((label) => (
          <Text
            key={`x-${label.x}-${label.text}`}
            x={label.x}
            y={label.y}
            style={axisStyle}
            textAnchor="middle"
          >
            {label.text}
          </Text>
        ))}
      </Svg>
    </View>
  );
}

function CashSvg({
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
    <View style={styles.chart}>
      <Svg viewBox={`0 0 ${plot.width} ${plot.height}`} width={515} height={154}>
        {plot.grid.map((line) => (
          <Rect
            key={`g-${line.y}`}
            x={TIME_PLOT.padX}
            y={line.y}
            width={TIME_PLOT_INNER.plotW}
            height={0.6}
            fill={PLOT_COLORS.line}
          />
        ))}
        {plot.yLabels.map((label) => (
          <Text key={`y-${label.y}`} x={label.x} y={label.y} style={axisStyle}>
            {label.text}
          </Text>
        ))}
        <Polyline
          points={plot.investing}
          fill="none"
          stroke={PLOT_COLORS.investing}
          strokeWidth={2.2}
        />
        <Polyline
          points={plot.operating}
          fill="none"
          stroke={PLOT_COLORS.brand}
          strokeWidth={2.2}
        />
        <Polyline
          points={plot.financing}
          fill="none"
          stroke={PLOT_COLORS.financing}
          strokeWidth={2.2}
        />
        {plot.xLabels.map((label) => (
          <Text
            key={`x-${label.x}-${label.text}`}
            x={label.x}
            y={label.y}
            style={axisStyle}
            textAnchor="middle"
          >
            {label.text}
          </Text>
        ))}
      </Svg>
    </View>
  );
}

function DonutSvg({ slices, currency }: { slices: readonly AgingSlice[]; currency: string }) {
  const { totalZero, arcs } = buildDonutPlot(slices);
  const { cx, cy, radius, size, strokeWidth } = DONUT_PLOT;
  return (
    <View style={styles.donut}>
      <View style={styles.legend}>
        {slices.map((slice) => {
          const color = arcs.find((arc) => arc.bucket === slice.bucket)?.color ?? PLOT_COLORS.axis;
          return (
            <View key={slice.bucket} style={styles.legendRow}>
              <View style={[styles.swatch, { backgroundColor: color }]} />
              <Text style={styles.legendLabel}>{slice.label}</Text>
              <Text style={styles.legendValue}>
                {formatMoney(slice.amount, { currency, showCurrency: true })}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={styles.ring}>
        <Svg viewBox={`0 0 ${size} ${size}`} width={120} height={120}>
          <Circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={PLOT_COLORS.line}
            strokeWidth={strokeWidth}
          />
          {totalZero
            ? null
            : arcs.map((arc) =>
                arc.path ? (
                  <Path
                    key={arc.bucket}
                    d={arc.path}
                    fill="none"
                    stroke={arc.color}
                    strokeWidth={strokeWidth}
                  />
                ) : null,
              )}
        </Svg>
      </View>
    </View>
  );
}

export function PerformancePdfChart({
  view,
  style,
  currency,
}: {
  view: WidgetView;
  style: 'line' | 'bar' | 'donut';
  currency: string;
}) {
  if (view.aging) {
    return <DonutSvg slices={view.aging} currency={currency} />;
  }
  if (view.cash) {
    return (
      <CashSvg
        operating={view.cash.operating}
        investing={view.cash.investing}
        financing={view.cash.financing}
        currency={currency}
      />
    );
  }
  return (
    <TimeSvg
      series={view.series}
      currency={currency}
      style={style === 'bar' ? 'bar' : 'line'}
      isMoney={view.isMoney}
    />
  );
}
