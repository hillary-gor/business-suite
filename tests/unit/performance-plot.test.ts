import { describe, expect, it } from 'vitest';
import { buildDonutPlot, buildTimePlot, plotAxisLabel } from '@/lib/performance-plot';
import { Money } from '@/lib/money';

describe('performance plot', () => {
  it('places a later month higher on a rising series', () => {
    const plot = buildTimePlot(
      [
        { key: '2026-08', label: 'Aug', amount: '100.00', prior: '0' },
        { key: '2026-09', label: 'Sep', amount: '1000.00', prior: '0' },
      ],
      'Ksh',
      'line',
    );
    expect(plot.dots).toHaveLength(2);
    expect(plot.dots[1]!.cy).toBeLessThan(plot.dots[0]!.cy);
    expect(plot.current.split(' ')).toHaveLength(2);
    expect(plotAxisLabel(Money.from('10776075'), 'Ksh', true)).toBe('Ksh10.8M');
  });

  it('draws a bar from the baseline and a donut path for a single bucket', () => {
    const bars = buildTimePlot(
      [{ key: '2026-09', label: 'Sep', amount: '1876000.00', prior: '' }],
      'Ksh',
      'bar',
    );
    expect(bars.bars).toHaveLength(1);
    expect(bars.bars[0]!.height).toBeGreaterThan(0);

    const donut = buildDonutPlot([
      { bucket: 'current', label: 'Current', amount: '0' },
      { bucket: '1-7', label: '1-7 days', amount: '1200000.00' },
    ]);
    expect(donut.totalZero).toBe(false);
    expect(donut.arcs.find((arc) => arc.bucket === '1-7')?.path).toMatch(/^M /);
    expect(donut.arcs.find((arc) => arc.bucket === 'current')?.path).toBe('');
  });
});
