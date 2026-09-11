import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { listPaymentTerms } from '@/server/modules/sales/documents';
import { withReadOnlyTransaction } from '@/server/db/transaction';
import { Card, PageHeader } from '@/components/ui';
import { CustomerForm } from './customer-form';

export const metadata = { title: 'Add customer · SkyJet' };

export default async function NewCustomerPage() {
  const { context, entity } = await authorise(Permission.MastersManageCustomers);
  const [paymentTerms, currencies] = await Promise.all([
    listPaymentTerms(context),
    withReadOnlyTransaction(context, (tx) =>
      tx.query<{ code: string; name: string }>(
        `select code, name from app.currencies where is_active order by code`,
      ),
    ),
  ]);

  return (
    <>
      <PageHeader title="Add customer" description="Creates the trading partner. It does not open an account balance." />
      <Card>
        <CustomerForm
          currencies={currencies}
          paymentTerms={paymentTerms.map((t) => ({
            id: t.id,
            label: `${t.code} — ${t.name}`,
          }))}
          baseCurrency={entity.baseCurrency}
        />
      </Card>
    </>
  );
}
