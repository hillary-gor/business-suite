import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { getPerformancePayload } from '@/server/modules/reports/performance';
import { displayCurrency } from '@/lib/inventory-overview';
import { PerformanceCentre } from './performance-centre';

export const metadata = { title: 'Performance centre · SkyJet' };

export default async function PerformanceCentrePage() {
  const { context, entity } = await authorise(Permission.ReportsView);
  const payload = await getPerformancePayload(context);

  return (
    <PerformanceCentre
      companyName={entity.name}
      currency={displayCurrency(entity.baseCurrency)}
      payload={payload}
    />
  );
}
