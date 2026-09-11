import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { listBankAccounts, listCustomersForSelect } from '@/server/modules/sales/documents';
import { Alert, Card, PageHeader } from '@/components/ui';
import { RefundForm } from './refund-form';

export const metadata = { title: 'Refund · SkyJet' };

export default async function NewRefundPage() {
  const { context, entity } = await authorise(Permission.SalesPaymentCreate);
  const [customers, banks] = await Promise.all([
    listCustomersForSelect(context),
    listBankAccounts(context),
  ]);

  if (customers.length === 0) {
    return (
      <>
        <PageHeader title="Refund" />
        <Alert tone="warning" title="No customers yet">
          <Link href="/sales/customers/new">Add a customer</Link> first.
        </Alert>
      </>
    );
  }
  if (banks.length === 0) {
    return (
      <>
        <PageHeader title="Refund" />
        <Alert tone="warning" title="No cash or bank account">
          Add a postable cash or bank account before refunding.
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Refund receipt"
        description="Pays money out of cash/bank and reduces receivables."
      />
      <Card>
        <RefundForm
          customers={customers.map((c) => ({
            id: c.id,
            label: `${c.code} — ${c.legal_name}`,
            currencyCode: c.currency_code,
          }))}
          banks={banks.map((b) => ({
            id: b.id,
            label: `${b.code} — ${b.name}`,
          }))}
          baseCurrency={entity.baseCurrency}
        />
      </Card>
    </>
  );
}
