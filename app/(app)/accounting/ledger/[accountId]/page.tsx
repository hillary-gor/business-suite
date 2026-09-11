import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { getLedgerDetail, listAccounts } from '@/server/modules/accounting/queries';
import { Money } from '@/lib/money';
import { Amount, Badge, Card, DataTable, EmptyState, PageHeader, Statistic } from '@/components/ui';

export const metadata = { title: 'General ledger · SkyJet' };

/**
 * The detail behind a balance.
 *
 * This is the page that answers "why is this account this number", and it is
 * the reason the whole system is built the way it is: every figure on a report
 * drills to the transactions that produced it, each of which names the user
 * who posted it and the moment they did.
 *
 * The running balance comes from the database rather than being accumulated
 * here, so the last line of this page and the closing balance on the trial
 * balance are the same arithmetic and cannot disagree.
 */
export default async function LedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ from?: string; to?: string; page?: string }>;
}) {
  const { accountId } = await params;
  const { from, to, page: pageParam } = await searchParams;

  const { context, entity } = await authorise(Permission.ReportsView);

  const accounts = await listAccounts(context, { includeInactive: true });
  const account = accounts.find((a) => a.id === accountId);
  if (!account) notFound();

  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFrom = new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10);

  const fromDate = from ?? defaultFrom;
  const toDate = to ?? defaultTo;
  const page = Math.max(1, Number(pageParam ?? '1') || 1);
  const pageSize = 100;

  const { lines, openingBalance, total } = await getLedgerDetail(context, {
    accountId,
    fromDate,
    toDate,
    page,
    pageSize,
  });

  const periodDebits = Money.sum(lines.map((l) => l.debitBase));
  const periodCredits = Money.sum(lines.map((l) => l.creditBase));
  const closing = lines.at(-1)?.runningBalance ?? openingBalance;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader
        title={`${account.code} — ${account.name}`}
        description={`${account.accountType.toLowerCase()} · normal balance ${
          account.normalBalance === 'DEBIT' ? 'debit' : 'credit'
        } · figures in ${entity.baseCurrency}`}
        actions={
          <Link href="/accounting/accounts" className="button">
            Back to accounts
          </Link>
        }
      />

      <div className="grid grid--stats">
        <Statistic label={`Opening at ${fromDate}`} value={<Amount value={openingBalance} />} />
        <Statistic label="Debits in range" value={<Amount value={periodDebits} />} />
        <Statistic label="Credits in range" value={<Amount value={periodCredits} />} />
        <Statistic
          label={`Closing at ${toDate}`}
          value={<Amount value={closing} emphasis />}
          tone={Money.from(closing).isNegative() ? 'warning' : 'neutral'}
        />
      </div>

      <Card>
        <form className="filter-bar" method="get">
          <div className="field">
            <label htmlFor="from">From</label>
            <input id="from" name="from" type="date" defaultValue={fromDate} />
          </div>
          <div className="field">
            <label htmlFor="to">To</label>
            <input id="to" name="to" type="date" defaultValue={toDate} />
          </div>
          <button type="submit" className="button--primary">
            Show
          </button>
        </form>
      </Card>

      <Card>
        {lines.length === 0 ? (
          <EmptyState
            title="Nothing posted in this range"
            description={`No transaction hit ${account.code} between ${fromDate} and ${toDate}.`}
          />
        ) : (
          <DataTable dense>
            <thead>
              <tr>
                <th style={{ width: 96 }}>Date</th>
                <th style={{ width: 120 }}>Entry</th>
                <th>Narrative</th>
                <th style={{ width: 150 }}>Counterparty</th>
                <th className="numeric" style={{ width: 120 }}>
                  Debit
                </th>
                <th className="numeric" style={{ width: 120 }}>
                  Credit
                </th>
                <th className="numeric" style={{ width: 130 }}>
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.lineId} className={line.isReversal ? 'row--reversal' : undefined}>
                  <td className="cell-code">{line.entryDate}</td>
                  <td>
                    <Link href={`/accounting/journals/${line.entryId}`} className="cell-code">
                      {line.entryNo}
                    </Link>
                  </td>
                  <td className="cell-wrap">
                    {line.lineDescription ?? line.description}
                    {line.reference ? (
                      <span className="cell-muted"> · {line.reference}</span>
                    ) : null}
                    {line.currencyCode !== entity.baseCurrency ? (
                      <span className="cell-muted">
                        {' '}
                        · {line.currencyCode}{' '}
                        {Money.from(line.debitTxn).isPositive() ? line.debitTxn : line.creditTxn}
                      </span>
                    ) : null}
                    {line.isReversal ? <Badge tone="neutral">reversal</Badge> : null}
                  </td>
                  <td className="cell-muted">{line.counterparty ?? '—'}</td>
                  <td className="numeric">
                    <Amount value={line.debitBase} dash />
                  </td>
                  <td className="numeric">
                    <Amount value={line.creditBase} dash />
                  </td>
                  <td className="numeric">
                    <Amount value={line.runningBalance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

        {pageCount > 1 ? (
          <div className="pagination">
            <span>
              {total} lines · page {page} of {pageCount}
            </span>
            <div className="button-row">
              {page > 1 ? (
                <Link
                  className="button button--small"
                  href={`/accounting/ledger/${accountId}?from=${fromDate}&to=${toDate}&page=${page - 1}`}
                >
                  Previous
                </Link>
              ) : null}
              {page < pageCount ? (
                <Link
                  className="button button--small"
                  href={`/accounting/ledger/${accountId}?from=${fromDate}&to=${toDate}&page=${page + 1}`}
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>

      {pageCount > 1 ? (
        <p className="text-muted text-small">
          The balance column continues across pages: it starts from the opening balance at{' '}
          {fromDate}, not from the first line shown.
        </p>
      ) : null}
    </>
  );
}
