import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listBatches, validate } from '@/server/modules/accounting/opening-balances';
import { Alert, Card, PageHeader } from '@/components/ui';
import { CutoverWorkspace } from './cutover-workspace';

export const metadata = { title: 'Opening balances · SkyJet' };

/**
 * The QuickBooks cutover.
 *
 * This screen exists to be used once, and it is designed around that fact.
 * There is no shortcut from a spreadsheet to a posted opening position: data
 * is staged, validated against the control accounts, shown in full, and only
 * then posted. The eight validation checks are the difference between a
 * migration that reconciles and years of unexplained differences.
 */
export default async function OpeningBalancesPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string }>;
}) {
  const { batch: selected } = await searchParams;

  const { context, session, entity } = await authorise(Permission.GlImportOpeningBalances);
  const batches = await listBatches(context);

  const focus = selected ? batches.find((b) => b.id === selected) : batches[0];
  const validation = focus && focus.status !== 'POSTED' ? await validate(context, focus.id) : [];
  const posted = batches.find((b) => b.status === 'POSTED');

  return (
    <>
      <PageHeader
        title="Opening balances"
        description={`Brings ${entity.name} across from QuickBooks Desktop as at a chosen cutover date. This is done once and cannot be repeated.`}
      />

      {posted ? (
        <Alert tone="success" title="Opening balances have been posted">
          The cutover was posted as <strong>{posted.journalEntryNo ?? 'a journal entry'}</strong> at{' '}
          {posted.cutoverDate}. A second cutover is refused by the database, so the opening position
          cannot be doubled.
        </Alert>
      ) : (
        <Alert tone="info" title="How this works">
          <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
            <li>Create a batch with the cutover date, normally the last day of a closed period.</li>
            <li>
              Load four exports: the trial balance, open receivables, open payables and stock on
              hand.
            </li>
            <li>
              Run the validation. It checks the trial balance nets to zero and that each
              sub-ledger&rsquo;s detail agrees with its control account to the cent.
            </li>
            <li>Post. Nothing is written to the ledger until every check passes.</li>
          </ol>
        </Alert>
      )}

      <Card>
        <CutoverWorkspace
          batches={batches}
          focusId={focus?.id ?? null}
          validation={validation}
          mayPost={can(session, entity.entityId, Permission.GlPostOpeningBalances)}
          baseCurrency={entity.baseCurrency}
        />
      </Card>
    </>
  );
}
