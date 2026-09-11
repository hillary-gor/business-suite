import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listCurrencies, listPaymentTerms } from '@/server/modules/inventory/masters';
import { Card, PageHeader } from '@/components/ui';
import { VendorForm } from './vendor-form';

export const metadata = { title: 'New supplier · SkyJet' };

export default async function NewVendorPage() {
  const { context, session, entity } = await authorise(Permission.MastersManageSuppliers);
  const [paymentTerms, currencies] = await Promise.all([
    listPaymentTerms(context),
    listCurrencies(context),
  ]);

  return (
    <>
      <PageHeader
        title="Add vendor"
        description="Creates the supplier. Bills and purchase orders will post against this record later."
      />
      <Card>
        <VendorForm
          currencies={currencies}
          paymentTerms={paymentTerms.map((t) => ({
            id: t.id,
            label: `${t.code} — ${t.name}`,
          }))}
          baseCurrency={entity.baseCurrency}
          canApprove={can(session, entity.entityId, Permission.MastersApproveSupplier)}
        />
      </Card>
    </>
  );
}
