import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { getCashFlowPayload } from '@/server/modules/reports/cash-flow';
import { displayCurrency } from '@/lib/inventory-overview';
import { CashFlowOverview } from './overview';

export const metadata = { title: 'Cash flow overview · SkyJet' };

export default async function CashFlowOverviewPage() {
  const { context, entity } = await authorise(Permission.ReportsView);
  const payload = await getCashFlowPayload(context);

  return <CashFlowOverview currency={displayCurrency(entity.baseCurrency)} payload={payload} />;
}
