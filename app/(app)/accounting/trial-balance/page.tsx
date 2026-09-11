import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import {
  getCurrentPeriod,
  getTrialBalance,
  listPeriods,
} from '@/server/modules/accounting/queries';
import { Money } from '@/lib/money';
import {
  Alert,
  Amount,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  StatusBadge,
} from '@/components/ui';

export const metadata = { title: 'Trial balance · SkyJet' };

/**
 * The trial balance.
 *
 * The important element on this page is the footer. If total debits do not
 * equal total credits then something has gone very wrong at a level below this
 * screen, and saying so loudly is more useful than rendering a tidy report
 * that happens to be wrong. The database enforces the invariant, so this is a
 * check on the system rather than on the bookkeeping — but a report that
 * cannot tell you it is broken is not worth reading.
 */
export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; zeros?: string }>;
}) {
  const { period: requestedPeriod, zeros } = await searchParams;
  const includeZeroBalances = zeros === '1';

  const { context, entity } = await authorise(Permission.ReportsView);

  const periods = await listPeriods(context);
  const current = requestedPeriod
    ? periods.find((p) => p.id === requestedPeriod)
    : await getCurrentPeriod(context);

  if (!current) {
    return (
      <>
        <PageHeader title="Trial balance" />
        <EmptyState
          title="No fiscal periods"
          description="A fiscal year has to be created before there is anything to report on."
        />
      </>
    );
  }

  const { rows, totalDebits, totalCredits } = await getTrialBalance(context, current.id, {
    includeZeroBalances,
  });

  const difference = Money.from(totalDebits).minus(totalCredits);
  const closingSum = Money.sum(rows.map((r) => r.closingBase));

  return (
    <>
      <PageHeader
        title="Trial balance"
        description={`${current.name} · ${current.startDate} to ${current.endDate} · all figures in ${entity.baseCurrency}`}
        actions={<StatusBadge status={current.status} />}
      />

      <Card>
        <form className="filter-bar" method="get">
          <div className="field">
            <label htmlFor="period">Period</label>
            <select id="period" name="period" defaultValue={current.id}>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.status.toLowerCase()})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="zeros">Rows</label>
            <select id="zeros" name="zeros" defaultValue={includeZeroBalances ? '1' : '0'}>
              <option value="0">With movement or balance</option>
              <option value="1">Every account</option>
            </select>
          </div>
          <button type="submit" className="button--primary">
            Show
          </button>
        </form>
      </Card>

      {!difference.isZero() ? (
        <Alert tone="danger" title="The trial balance does not balance">
          Debits and credits differ by <Amount value={difference} showCurrency />. The database
          enforces that every entry balances, so this should be impossible. Do not rely on any
          report until it has been investigated.
        </Alert>
      ) : null}

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing posted in this period"
            description="No account has an opening balance or any movement in the selected period."
          />
        ) : (
          <DataTable dense>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Code</th>
                <th>Account</th>
                <th className="numeric" style={{ width: 130 }}>
                  Opening
                </th>
                <th className="numeric" style={{ width: 130 }}>
                  Debits
                </th>
                <th className="numeric" style={{ width: 130 }}>
                  Credits
                </th>
                <th className="numeric" style={{ width: 130 }}>
                  Closing
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.accountId}>
                  <td className="cell-code">{row.accountCode}</td>
                  <td>
                    <Link
                      href={`/accounting/ledger/${row.accountId}?from=${current.startDate}&to=${current.endDate}`}
                    >
                      {row.accountName}
                    </Link>
                  </td>
                  <td className="numeric">
                    <Amount value={row.openingBase} dash />
                  </td>
                  <td className="numeric">
                    <Amount value={row.periodDebit} dash />
                  </td>
                  <td className="numeric">
                    <Amount value={row.periodCredit} dash />
                  </td>
                  <td className="numeric">
                    <Amount value={row.closingBase} dash />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Totals for {current.name}</td>
                <td className="numeric">
                  <Amount value={totalDebits} emphasis />
                </td>
                <td className="numeric">
                  <Amount value={totalCredits} emphasis />
                </td>
                <td className="numeric">
                  <Amount value={closingSum} emphasis />
                </td>
              </tr>
            </tfoot>
          </DataTable>
        )}
      </Card>

      <p className="text-muted text-small">
        Closing balances are signed: a positive figure is a debit balance and a negative figure a
        credit balance. They sum to zero across every account, which is the same statement as
        &ldquo;the books balance&rdquo;.
      </p>
    </>
  );
}
