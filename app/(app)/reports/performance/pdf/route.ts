import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { z } from 'zod';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { getPerformancePayload } from '@/server/modules/reports/performance';
import { PerformancePdf } from '@/server/pdf/performance-pdf';
import { pdfFileResponse, pdfRouteError } from '@/server/pdf/http';
import { displayCurrency } from '@/lib/inventory-overview';
import { nairobiToday } from '@/lib/payables';
import {
  CHART_METRICS,
  MAX_PERFORMANCE_CHARTS,
  PERFORMANCE_PERIODS,
  parsePerformanceWidgets,
  performancePdfFilename,
} from '@/lib/performance-centre';

export const dynamic = 'force-dynamic';

const pdfPeriods = ['today', ...PERFORMANCE_PERIODS] as const;

const bodySchema = z.object({
  charts: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        metric: z.enum(CHART_METRICS),
        name: z.string().min(1).max(80),
        period: z.enum(pdfPeriods),
        style: z.enum(['line', 'bar', 'donut']),
      }),
    )
    .min(1)
    .max(MAX_PERFORMANCE_CHARTS),
});

export async function POST(request: Request) {
  try {
    const json: unknown = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ error: 'Choose at least one chart to export.' }, { status: 400 });
    }
    const charts = parsePerformanceWidgets(parsed.data.charts);
    if (!charts || charts.length === 0) {
      return Response.json({ error: 'Choose at least one chart to export.' }, { status: 400 });
    }

    const { context, entity } = await authorise(Permission.ReportsView);
    const payload = await getPerformancePayload(context);
    const buffer = await renderToBuffer(
      createElement(PerformancePdf, {
        companyName: entity.name,
        currency: displayCurrency(entity.baseCurrency),
        updatedAt: pdfStamp(),
        payload,
        charts,
      }) as ReactElement<DocumentProps>,
    );
    return pdfFileResponse(
      Buffer.from(buffer),
      performancePdfFilename(entity.name, nairobiToday()),
      'attachment',
    );
  } catch (error) {
    return pdfRouteError(error);
  }
}

function pdfStamp(at = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const hour = value('hour');
  const minute = value('minute');
  const dayPeriod = value('dayPeriod').toLowerCase().replace(/\s/g, '');
  return `${hour}:${minute}${dayPeriod} ${value('day')}/${value('month')}/${value('year')}`;
}
