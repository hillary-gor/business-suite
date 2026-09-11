import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listJournalEntries } from '@/server/modules/accounting/queries';
import { Amount, Badge, Card, DataTable, EmptyState, PageHeader } from '@/components/ui';

export const metadata = { title: 'Journal entries · SkyJet' };

const SOURCE_TYPES = [
  'MANUAL_JOURNAL',
  'OPENING_BALANCE',
  'SALES_INVOICE',
  'SALES_CREDIT_NOTE',
  'CUSTOMER_RECEIPT',
  'PURCHASE_BILL',
  'SUPPLIER_PAYMENT',
  'INVENTORY_MOVEMENT',
  'FX_REVALUATION',
  'PERIOD_CLOSE',
  'REVERSAL',
];

/**
 * Every journal entry, in date order, newest first.
 *
 * This is the audit view of the whole system: nothing reaches the general
 * ledger without appearing here, whether it came from a sales invoice, a
 * stock movement, a revaluation or somebody typing a journal. Each row names
 * who posted it and when.
 */
export default async function JournalsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    q?: string;
    source?: string;
    page?: string;
  }>;
}) {
  const { from, to, q, source, page: pageParam } = await searchParams;

  const { context, session, entity } = await authorise(Permission.FinanceJournalView);

  const page = Math.max(1, Number(pageParam ?? '1') || 1);
  const pageSize = 50;

  const { entries, total } = await listJournalEntries(context, {
    fromDate: from,
    toDate: to,
    search: q,
    sourceType: source,
    page,
    pageSize,
  });

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const query = new URLSearchParams(
    Object.entries({ from, to, q, source }).filter(([, v]) => Boolean(v)) as [string, string][],
  );

  return (
    <>
      <PageHeader
        title="Journal entries"
        description="Everything that has reached the general ledger, from whatever source. Entries cannot be amended or deleted; a mistake is corrected by posting a reversal."
        actions={
          can(session, entity.entityId, Permission.GlPostJournal) ? (
            <Link href="/accounting/journals/new" className="button button--primary">
              New journal
            </Link>
          ) : null
        }
      />

      <Card>
        <form className="filter-bar" method="get">
          <div className="field">
            <label htmlFor="q">Search</label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q ?? ''}
              placeholder="Entry number, narrative or reference"
              style={{ minWidth: 240 }}
            />
          </div>
          <div className="field">
            <label htmlFor="from">From</label>
            <input id="from" name="from" type="date" defaultValue={from ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="to">To</label>
            <input id="to" name="to" type="date" defaultValue={to ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="source">Source</label>
            <select id="source" name="source" defaultValue={source ?? ''}>
              <option value="">Any</option>
              {SOURCE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ').toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="button--primary">
            Search
          </button>
          {query.size > 0 ? (
            <Link href="/accounting/journals" className="button button--ghost">
              Clear
            </Link>
          ) : null}
        </form>
      </Card>

      <Card>
        {entries.length === 0 ? (
          <EmptyState
            title="No entries found"
            description={
              query.size > 0
                ? 'Nothing matches those filters. Try widening the date range.'
                : 'Nothing has been posted to the general ledger yet.'
            }
          />
        ) : (
          <DataTable dense>
            <thead>
              <tr>
                <th style={{ width: 96 }}>Date</th>
                <th style={{ width: 120 }}>Entry</th>
                <th>Narrative</th>
                <th style={{ width: 130 }}>Source</th>
                <th className="numeric" style={{ width: 50 }}>
                  Lines
                </th>
                <th className="numeric" style={{ width: 130 }}>
                  Value
                </th>
                <th style={{ width: 150 }}>Posted by</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className={e.isReversal ? 'row--reversal' : undefined}>
                  <td className="cell-code">{e.entryDate}</td>
                  <td>
                    <Link href={`/accounting/journals/${e.id}`} className="cell-code">
                      {e.entryNo}
                    </Link>
                  </td>
                  <td className="cell-wrap">
                    {e.description}
                    {e.reference ? <span className="cell-muted"> · {e.reference}</span> : null}
                    <div className="inline">
                      {e.isReversal ? <Badge tone="neutral">reversal</Badge> : null}
                      {e.isReversed ? <Badge tone="warning">reversed</Badge> : null}
                      {e.currencyCode !== entity.baseCurrency ? (
                        <Badge tone="info">{e.currencyCode}</Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="cell-muted">{e.sourceType.replace(/_/g, ' ').toLowerCase()}</td>
                  <td className="numeric cell-muted">{e.lineCount}</td>
                  <td className="numeric">
                    <Amount value={e.totalBase} />
                  </td>
                  <td className="cell-muted">
                    {e.postedByName}
                    <div className="text-small">{e.postedAt}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

        {pageCount > 1 ? (
          <div className="pagination">
            <span>
              {total} entries · page {page} of {pageCount}
            </span>
            <div className="button-row">
              {page > 1 ? (
                <Link
                  className="button button--small"
                  href={`/accounting/journals?${query}&page=${page - 1}`}
                >
                  Previous
                </Link>
              ) : null}
              {page < pageCount ? (
                <Link
                  className="button button--small"
                  href={`/accounting/journals?${query}&page=${page + 1}`}
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>
    </>
  );
}
