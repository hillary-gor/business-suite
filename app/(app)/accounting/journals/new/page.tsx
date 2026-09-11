import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { listAccounts, listPeriods } from '@/server/modules/accounting/queries';
import { withReadOnlyTransaction } from '@/server/db/transaction';
import { Alert, Card, PageHeader } from '@/components/ui';
import { JournalForm } from './journal-form';

export const metadata = { title: 'New journal · SkyJet' };

export default async function NewJournalPage() {
  const { context, entity } = await authorise(Permission.GlPostJournal);

  const [accounts, periods, currencies] = await Promise.all([
    listAccounts(context),
    listPeriods(context),
    withReadOnlyTransaction(context, async (tx) => {
      const rows = await tx.query<{ code: string; name: string; minor_units: number }>(
        `select c.code, c.name, c.minor_units
           from app.currencies c
          where c.is_active
          order by (c.code = $1) desc, c.code`,
        [entity.baseCurrency],
      );
      return rows.map((r) => ({ code: r.code, name: r.name, minorUnits: Number(r.minor_units) }));
    }),
  ]);

  const openPeriods = periods.filter((p) => p.status === 'OPEN');
  const postable = accounts.filter((a) => !a.isSummary && a.isActive);

  if (openPeriods.length === 0) {
    return (
      <>
        <PageHeader title="New journal entry" />
        <Alert tone="warning" title="No period is open">
          Every fiscal period is closed, so nothing can be posted. A period has to be opened before
          a journal can be entered.
        </Alert>
        <Link href="/accounting/periods" className="button">
          Go to periods
        </Link>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New journal entry"
        description={`Posts directly to the general ledger. It cannot be amended afterwards, only reversed. Open periods: ${openPeriods
          .map((p) => p.name)
          .join(', ')}.`}
        actions={
          <Link href="/accounting/journals" className="button">
            Cancel
          </Link>
        }
      />

      <Card>
        <JournalForm
          accounts={postable.map((a) => ({
            id: a.id,
            code: a.code,
            name: a.name,
            currencyCode: a.currencyCode,
            requiresCustomer: a.requiresCustomer,
            requiresSupplier: a.requiresSupplier,
            requiresWarehouse: a.requiresWarehouse,
          }))}
          currencies={currencies}
          baseCurrency={entity.baseCurrency}
          openPeriods={openPeriods.map((p) => ({
            name: p.name,
            startDate: p.startDate,
            endDate: p.endDate,
          }))}
        />
      </Card>
    </>
  );
}
