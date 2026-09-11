import { notFound } from 'next/navigation';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { runStandardReport } from '@/server/modules/reports/standard';
import { displayCurrency } from '@/lib/inventory-overview';
import { formatReportTimestamp, resolveReportQuery } from '@/lib/report-periods';
import { getStandardReport, reportAccountingMethod } from '@/lib/standard-reports';
import { ReportViewer } from '@/components/reports/report-viewer';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const report = getStandardReport(slug);
  return { title: `${report?.title ?? 'Report'} · SkyJet` };
}

export default async function StandardReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string; basis?: string }>;
}) {
  const { slug } = await params;
  const report = getStandardReport(slug);
  if (!report) notFound();

  const { context, entity } = await authorise(Permission.ReportsView);
  const raw = await searchParams;
  const resolved =
    report.dateMode === 'none'
      ? resolveReportQuery({ period: 'this_year_to_date', basis: raw.basis })
      : resolveReportQuery({
          period: raw.period ?? (report.dateMode === 'asOf' ? 'today' : 'this_year_to_date'),
          from: raw.from,
          to: raw.to,
          basis: raw.basis,
        });
  const method = reportAccountingMethod(report);
  const query =
    method === 'both'
      ? resolved
      : { ...resolved, basis: method === 'cash' ? ('CASH' as const) : ('ACCRUAL' as const) };
  const model = await runStandardReport(context, slug, query);

  return (
    <ReportViewer
      report={report}
      model={model}
      companyName={entity.name}
      currency={displayCurrency(entity.baseCurrency)}
      query={query}
      generatedAt={formatReportTimestamp()}
    />
  );
}
