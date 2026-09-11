import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import {
  listBankAccounts,
  listOpenBillsForSupplier,
  listSuppliersForSelect,
} from '@/server/modules/purchasing/documents';
import { Alert, Card, PageHeader } from '@/components/ui';
import { PaymentForm } from './payment-form';

export const metadata = { title: 'Pay bills · SkyJet' };

export default async function NewSupplierPaymentPage() {
  const { context } = await authorise(Permission.FinancePaymentCreate);
  const [suppliers, banks] = await Promise.all([
    listSuppliersForSelect(context),
    listBankAccounts(context),
  ]);

  if (suppliers.length === 0) {
    return (
      <>
        <PageHeader title="Pay bills" />
        <Alert tone="warning" title="No vendors yet">
          <Link href="/purchasing/vendors/new">Add a vendor</Link> first.
        </Alert>
      </>
    );
  }

  if (banks.length === 0) {
    return (
      <>
        <PageHeader title="Pay bills" />
        <Alert tone="warning" title="No cash or bank account">
          The chart needs a postable cash or bank account before supplier payments can be drawn.
        </Alert>
      </>
    );
  }

  async function loadOpenBills(supplierId: string) {
    'use server';
    const { context: ctx } = await authorise(Permission.FinancePaymentCreate);
    const rows = await listOpenBillsForSupplier(ctx, supplierId);
    return rows.map((row) => ({
      id: row.id,
      billNo: row.bill_no,
      billDate: row.bill_date,
      outstanding: row.outstanding,
      currencyCode: row.currency_code,
    }));
  }

  return (
    <>
      <PageHeader
        title="Pay bills"
        description="Draws from cash or bank and debits AP. Allocations match open bills without posting again."
      />
      <Card>
        <PaymentForm
          suppliers={suppliers.map((s) => ({
            id: s.id,
            label: `${s.code} — ${s.legal_name}`,
            currencyCode: s.currency_code,
          }))}
          banks={banks.map((b) => ({
            id: b.id,
            label: `${b.code} — ${b.name}`,
          }))}
          loadOpenBills={loadOpenBills}
        />
      </Card>
    </>
  );
}
