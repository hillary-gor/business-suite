import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { describe, expect, it } from 'vitest';
import { widgetFromMetric } from '@/lib/performance-centre';
import { PerformancePdf } from '@/server/pdf/performance-pdf';

describe('performance PDF', () => {
  it('renders line, bar, donut and cash charts into a downloadable pack', async () => {
    const buffer = await renderToBuffer(
      createElement(PerformancePdf, {
        companyName: 'Airzone Parts',
        currency: 'Ksh',
        updatedAt: '7:00pm 06/09/2026',
        payload: {
          asAt: '2026-09-06',
          pnlByMonth: {
            '2026-08': {
              revenue: '0',
              expenses: '0',
              cogs: '0',
              gross: '0',
              net: '0',
            },
            '2026-09': {
              revenue: '1876000.00',
              expenses: '0',
              cogs: '0',
              gross: '10776075.00',
              net: '10776075.00',
            },
          },
          cashByMonth: {
            '2026-09': {
              operating: '676000.00',
              investing: '0',
              financing: '0',
              net: '676000.00',
            },
          },
          ratioByMonth: {},
          arAging: [{ bucket: '1-7', label: '1-7 days', amount: '1200000.00' }],
          apAging: [],
        },
        charts: [
          widgetFromMetric('expenses', 1),
          widgetFromMetric('revenue', 2),
          widgetFromMetric('ar_aging', 3),
          widgetFromMetric('cash_flow', 4),
        ],
      }) as ReactElement<DocumentProps>,
    );
    expect(buffer.byteLength).toBeGreaterThan(4000);
  }, 30_000);
});
