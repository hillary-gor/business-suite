import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { getJournalEntry } from '@/server/modules/accounting/queries';
import { Money } from '@/lib/money';
import { Alert, Amount, Badge, Card, DataTable, PageHeader } from '@/components/ui';
import { ReverseEntryForm } from './reverse-form';

export const metadata = { title: 'Journal entry · SkyJet' };

/**
 * One journal entry, in full.
 *
 * There is no edit button on this page and there never will be. A posted entry
 * is a historical fact; the correction for a wrong one is a reversal, which
 * leaves both entries visible and lets a reviewer see what happened rather
 * than only the tidied-up result.
 */
export default async function JournalEntryPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;

  const { context, session, entity } = await authorise(Permission.FinanceJournalView);
  const result = await getJournalEntry(context, entryId);
  if (!result) notFound();

  const { entry, lines } = result;
  const debits = Money.sum(lines.map((l) => l.debitBase));
  const credits = Money.sum(lines.map((l) => l.creditBase));
  const isForeign = entry.currencyCode !== entity.baseCurrency;

  const mayReverse =
    can(session, entity.entityId, Permission.GlReverseJournal) &&
    !entry.isReversed &&
    !entry.isReversal;

  return (
    <>
      <PageHeader
        title={entry.entryNo}
        description={`${entry.entryDate} · ${entry.sourceType.replace(/_/g, ' ').toLowerCase()} · posted by ${entry.postedByName} at ${entry.postedAt}`}
        actions={
          <Link href="/accounting/journals" className="button">
            Back to journals
          </Link>
        }
      />

      {entry.isReversal && entry.reversalOfEntryNo ? (
        <Alert tone="info" title="This entry is a reversal">
          It was posted to reverse <strong>{entry.reversalOfEntryNo}</strong>. Both entries remain
          on the ledger.
        </Alert>
      ) : null}

      {entry.isReversed && entry.reversedByEntryNo ? (
        <Alert tone="warning" title="This entry has been reversed">
          It was reversed by <strong>{entry.reversedByEntryNo}</strong>. Its effect on the ledger
          has been cancelled, but the entry itself remains as a record of what was originally
          posted.
        </Alert>
      ) : null}

      <Card>
        <div className="stack">
          <div>
            <div className="statistic__label">Narrative</div>
            <p>{entry.description}</p>
          </div>
          {entry.reference ? (
            <div>
              <div className="statistic__label">Reference</div>
              <p className="cell-code">{entry.reference}</p>
            </div>
          ) : null}
          <div className="inline">
            <Badge tone="info">{entry.currencyCode}</Badge>
            {entry.isReversal ? <Badge tone="neutral">reversal</Badge> : null}
            {entry.isReversed ? <Badge tone="warning">reversed</Badge> : null}
          </div>
        </div>
      </Card>

      <Card title="Lines">
        <DataTable dense>
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th style={{ width: 90 }}>Code</th>
              <th>Account</th>
              <th>Narrative</th>
              <th style={{ width: 140 }}>Dimension</th>
              {isForeign ? (
                <>
                  <th className="numeric" style={{ width: 110 }}>
                    Debit {entry.currencyCode}
                  </th>
                  <th className="numeric" style={{ width: 110 }}>
                    Credit {entry.currencyCode}
                  </th>
                  <th className="numeric" style={{ width: 90 }}>
                    Rate
                  </th>
                </>
              ) : null}
              <th className="numeric" style={{ width: 120 }}>
                Debit {entity.baseCurrency}
              </th>
              <th className="numeric" style={{ width: 120 }}>
                Credit {entity.baseCurrency}
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.lineNo}>
                <td className="cell-muted">{line.lineNo}</td>
                <td className="cell-code">{line.accountCode}</td>
                <td>{line.accountName}</td>
                <td className="cell-wrap cell-muted">{line.description ?? '—'}</td>
                <td className="cell-muted">{line.counterparty ?? '—'}</td>
                {isForeign ? (
                  <>
                    <td className="numeric">
                      <Amount value={line.debitTxn} dash />
                    </td>
                    <td className="numeric">
                      <Amount value={line.creditTxn} dash />
                    </td>
                    <td className="numeric cell-code">{line.fxRate}</td>
                  </>
                ) : null}
                <td className="numeric">
                  <Amount value={line.debitBase} dash />
                </td>
                <td className="numeric">
                  <Amount value={line.creditBase} dash />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={isForeign ? 8 : 5}>Totals</td>
              <td className="numeric">
                <Amount value={debits} emphasis />
              </td>
              <td className="numeric">
                <Amount value={credits} emphasis />
              </td>
            </tr>
          </tfoot>
        </DataTable>
      </Card>

      {mayReverse ? (
        <Card
          title="Reverse this entry"
          description="Posts a mirror-image entry that cancels this one. Nothing is deleted and this entry stays exactly as it is."
        >
          <ReverseEntryForm entryId={entry.id} entryNo={entry.entryNo} />
        </Card>
      ) : null}

      {!isForeign ? null : (
        <p className="text-muted text-small">
          Transaction amounts are in {entry.currencyCode} at the rate shown; {entity.baseCurrency}{' '}
          amounts are what the ledger and every report are built from.
        </p>
      )}
    </>
  );
}
