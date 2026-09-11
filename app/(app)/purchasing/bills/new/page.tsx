import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import {
  listExpenseAccounts,
  listPurchasableItems,
  listSuppliersForSelect,
  listTaxCodes,
} from '@/server/modules/purchasing/documents';
import { Alert, Card, PageHeader } from '@/components/ui';
import { BillForm } from './bill-form';

export const metadata = { title: 'New bill · SkyJet' };

export default async function NewBillPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string }>;
}) {
  const { context, entity } = await authorise(Permission.FinancePaymentCreate);
  const { supplierId } = await searchParams;
  const [suppliers, taxCodes, items, expenseAccounts] = await Promise.all([
    listSuppliersForSelect(context),
    listTaxCodes(context),
    listPurchasableItems(context),
    listExpenseAccounts(context),
  ]);

  if (suppliers.length === 0) {
    return (
      <>
        <PageHeader title="New bill" />
        <Alert tone="warning" title="No vendors yet">
          <Link href="/purchasing/vendors/new">Add a vendor</Link> first.
        </Alert>
      </>
    );
  }

  const defaultTax = taxCodes.find((t) => t.code === 'VAT16')?.id ?? taxCodes[0]?.id ?? null;

  return (
    <>
      <PageHeader
        title="New bill"
        description="Posts DR expense (or GRNI) / DR input tax / CR accounts payable."
      />
      <Card>
        <BillForm
          suppliers={suppliers.map((s) => ({
            id: s.id,
            label: `${s.code} — ${s.legal_name}`,
            currencyCode: s.currency_code,
          }))}
          taxCodes={taxCodes.map((t) => ({
            id: t.id,
            label: `${t.code} (${Number(t.rate) * 100}%)`,
            rate: t.rate,
          }))}
          items={items.map((i) => ({
            id: i.id,
            label: `${i.part_number} — ${i.description}`,
            description: i.description,
            partNumber: i.part_number,
          }))}
          expenseAccounts={expenseAccounts.map((a) => ({
            id: a.id,
            label: `${a.code} — ${a.name}`,
          }))}
          defaultTaxCodeId={defaultTax}
          baseCurrency={entity.baseCurrency}
          defaultSupplierId={supplierId}
        />
      </Card>
    </>
  );
}
