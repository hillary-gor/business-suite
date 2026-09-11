import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import {
  listBankAccounts,
  listExpenseAccounts,
  listSuppliersForSelect,
  listTaxCodes,
} from '@/server/modules/purchasing/documents';
import { Alert, Card, PageHeader } from '@/components/ui';
import { ExpenseForm } from './expense-form';

export const metadata = { title: 'New expense · SkyJet' };

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string }>;
}) {
  const { context, entity } = await authorise(Permission.FinancePaymentCreate);
  const { supplierId } = await searchParams;
  const [suppliers, taxCodes, expenseAccounts, banks] = await Promise.all([
    listSuppliersForSelect(context),
    listTaxCodes(context),
    listExpenseAccounts(context),
    listBankAccounts(context),
  ]);

  if (suppliers.length === 0) {
    return (
      <>
        <PageHeader title="New expense" />
        <Alert tone="warning" title="No suppliers yet">
          <Link href="/purchasing/vendors/new">Add a supplier</Link> first.
        </Alert>
      </>
    );
  }

  if (banks.length === 0) {
    return (
      <>
        <PageHeader title="New expense" />
        <Alert tone="warning" title="No cash or bank account">
          The chart needs a postable cash or bank account before an expense can be paid.
        </Alert>
      </>
    );
  }

  const defaultTax = taxCodes.find((t) => t.code === 'VAT16')?.id ?? taxCodes[0]?.id ?? null;

  return (
    <>
      <PageHeader
        title="New expense"
        description="Posts the expense to the ledger and pays it from cash or bank in one step."
      />
      <Card>
        <ExpenseForm
          suppliers={suppliers.map((s) => ({
            id: s.id,
            label: `${s.code} — ${s.legal_name}`,
            currencyCode: s.currency_code,
          }))}
          banks={banks.map((b) => ({
            id: b.id,
            label: `${b.code} — ${b.name}`,
          }))}
          taxCodes={taxCodes.map((t) => ({
            id: t.id,
            label: `${t.code} (${Number(t.rate) * 100}%)`,
            rate: t.rate,
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
