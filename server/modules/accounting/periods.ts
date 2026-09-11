/**
 * Period control and FX revaluation.
 *
 * Closing a period is the moment the numbers become the numbers. Everything
 * here is a thin call into the database function that does the real work,
 * because a period must close identically whether it was closed from this
 * screen, a scheduled job, or a console.
 */
import {
  withTransaction,
  withReadOnlyTransaction,
  type RequestContext,
} from '@/server/db/transaction';

export interface CloseResult {
  readonly periodId: string;
  readonly periodName: string;
  readonly snapshotAccounts: number;
}

export async function closePeriod(context: RequestContext, periodId: string): Promise<CloseResult> {
  return withTransaction(context, async (tx) => {
    await tx.query('select gl.close_period($1)', [periodId]);

    const row = await tx.one<{ name: string; snapshot_accounts: string }>(
      `select p.name,
              (select count(*) from gl.period_close_snapshot s where s.period_id = p.id)
                as snapshot_accounts
         from gl.fiscal_periods p where p.id = $1`,
      [periodId],
    );

    return {
      periodId,
      periodName: row.name,
      snapshotAccounts: Number(row.snapshot_accounts),
    };
  });
}

export async function reopenPeriod(
  context: RequestContext,
  periodId: string,
  reason: string,
): Promise<void> {
  await withTransaction(context, async (tx) => {
    await tx.query('select gl.reopen_period($1, $2)', [periodId, reason]);
  });
}

export async function openPeriod(context: RequestContext, periodId: string): Promise<void> {
  await withTransaction(context, async (tx) => {
    await tx.query('select gl.open_period($1)', [periodId]);
  });
}

/**
 * Creates a fiscal year with its twelve trading periods and the thirteenth
 * adjustment period on the final day.
 *
 * `openFirst` is false by default: a year is created closed and periods are
 * opened deliberately, so a newly created year cannot silently become a place
 * postings land by accident.
 */
export async function createFiscalYear(
  context: RequestContext,
  startDate: string,
  options: { code?: string; openFirst?: boolean } = {},
): Promise<string> {
  return withTransaction(context, async (tx) =>
    tx.scalar<string>('select gl.create_fiscal_year($1, $2::date, $3, $4)', [
      context.entityId,
      startDate,
      options.code ?? null,
      options.openFirst ?? false,
    ]),
  );
}

export interface RevaluationSummary {
  readonly runId: string;
  readonly entryNo: string | null;
  readonly asAt: string;
  readonly rateType: string;
  readonly netGain: string;
  readonly positions: Array<{
    accountCode: string;
    accountName: string;
    currencyCode: string;
    cumulativeAdjustment: string;
  }>;
}

/**
 * Revalues foreign currency balances at the period-end rate.
 *
 * Every monetary balance held in a foreign currency is restated at the closing
 * rate and the difference goes to unrealised gain or loss. Skipping this does
 * not make the exposure go away; it leaves it hidden inside a balance still
 * translated at rates from months ago.
 *
 * The date comes from the period rather than being passed in, so a revaluation
 * cannot be run at a date that does not belong to the period it is recorded
 * against. What the caller chooses is the rate type — normally the closing
 * rate, which is what the accounts are prepared on.
 */
export async function revalueFx(
  context: RequestContext,
  periodId: string,
  options: { rateType?: string } = {},
): Promise<RevaluationSummary> {
  return withTransaction(context, async (tx) => {
    const runId = await tx.scalar<string>('select gl.revalue_fx($1, $2, $3)', [
      context.entityId,
      periodId,
      options.rateType ?? 'CLOSING',
    ]);

    const run = await tx.one<{
      entry_no: string | null;
      as_at: string;
      rate_type: string;
      net_gain_base: string;
    }>(
      `select e.entry_no,
              to_char(r.as_at, 'YYYY-MM-DD') as as_at,
              r.rate_type,
              r.net_gain_base
         from gl.fx_revaluation_run r
         left join gl.journal_entry e on e.id = r.journal_entry_id
        where r.id = $1`,
      [runId],
    );

    // The position table carries the running total of adjustments made to each
    // account and currency, with last_run_id pointing at the run that most
    // recently touched it. Reading it back filtered on this run shows exactly
    // what this revaluation moved.
    const positions = await tx.query<{
      account_code: string;
      account_name: string;
      currency_code: string;
      cumulative_adjustment_base: string;
    }>(
      `select a.code as account_code,
              a.name as account_name,
              p.currency_code,
              p.cumulative_adjustment_base
         from gl.fx_revaluation_position p
         join gl.accounts a on a.id = p.account_id
        where p.entity_id = $1 and p.last_run_id = $2
        order by a.code, p.currency_code`,
      [context.entityId, runId],
    );

    return {
      runId,
      entryNo: run.entry_no,
      asAt: run.as_at,
      rateType: run.rate_type,
      netGain: run.net_gain_base,
      positions: positions.map((p) => ({
        accountCode: p.account_code,
        accountName: p.account_name,
        currencyCode: p.currency_code,
        cumulativeAdjustment: p.cumulative_adjustment_base,
      })),
    };
  });
}

export interface CloseReadiness {
  readonly check: string;
  readonly passed: boolean;
  readonly detail: string;
}

/**
 * What would stop this period closing.
 *
 * `gl.close_period` refuses for any of these reasons, but discovering them one
 * at a time by pressing a button and reading an error is a poor way to spend a
 * month end. This reports them all at once, before anyone commits.
 */
export async function checkCloseReadiness(
  context: RequestContext,
  periodId: string,
): Promise<CloseReadiness[]> {
  return withReadOnlyTransaction(context, async (tx) => {
    const checks: CloseReadiness[] = [];

    const period = await tx.one<{ name: string; status: string; end_date: string }>(
      `select name, status::text as status, to_char(end_date, 'YYYY-MM-DD') as end_date
         from gl.fiscal_periods where id = $1 and entity_id = $2`,
      [periodId, context.entityId],
    );

    checks.push({
      check: 'The period is open',
      passed: period.status === 'OPEN',
      detail: `${period.name} is ${period.status.toLowerCase()}`,
    });

    const earlier = await tx.query<{ name: string }>(
      `select p.name
         from gl.fiscal_periods p
        where p.entity_id = $1
          and p.status <> 'CLOSED'
          and p.end_date < (select end_date from gl.fiscal_periods where id = $2)
        order by p.start_date`,
      [context.entityId, periodId],
    );

    checks.push({
      check: 'Every earlier period is closed',
      passed: earlier.length === 0,
      detail:
        earlier.length === 0
          ? 'No earlier period is still open'
          : `Still open: ${earlier.map((e) => e.name).join(', ')}`,
    });

    const imbalance = await tx.scalar<string>(
      `select coalesce(sum(l.debit_base - l.credit_base), 0)
         from gl.journal_entry_line l
        where l.entity_id = $1 and l.period_id = $2`,
      [context.entityId, periodId],
    );

    checks.push({
      check: 'The period balances',
      passed: Number(imbalance) === 0,
      detail:
        Number(imbalance) === 0
          ? 'Debits equal credits'
          : `Out by ${imbalance}. This should be impossible; investigate before closing.`,
    });

    const tie = await tx.maybeOne<{ difference: string }>(
      'select difference from inv.verify_inventory_ties_to_gl($1, (select end_date from gl.fiscal_periods where id = $2))',
      [context.entityId, periodId],
    );

    checks.push({
      check: 'Stock ties to the general ledger',
      passed: tie === null || Number(tie.difference) === 0,
      detail:
        tie === null || Number(tie.difference) === 0
          ? 'The stock sub-ledger agrees with the inventory control account'
          : `Out by ${tie.difference}`,
    });

    // A fiscal document points at the business document it was raised for
    // rather than at the journal entry, so the two are matched on the source
    // they share. That indirection is deliberate in the schema: a document is
    // fiscalised once even if it is later reversed and reposted.
    const unfiscalised = await tx.scalar<string>(
      `select count(*)
         from integration.etims_document d
         join gl.journal_entry e
           on e.entity_id = d.entity_id
          and e.source_type = d.source_type
          and e.source_id = d.source_id
        where d.entity_id = $1
          and e.period_id = $2
          and d.status <> 'ACCEPTED'`,
      [context.entityId, periodId],
    );

    checks.push({
      check: 'Every invoice has been fiscalised',
      passed: Number(unfiscalised) === 0,
      detail:
        Number(unfiscalised) === 0
          ? 'Nothing is waiting on eTIMS'
          : `${unfiscalised} document(s) are not yet accepted by eTIMS. ` +
            'The period can still be closed, but the backlog will need clearing.',
    });

    const unrevalued = await tx.scalar<string>(
      `select count(*)
         from gl.journal_entry_line l
         join gl.accounts a on a.id = l.account_id
        where l.entity_id = $1
          and l.period_id = $2
          and l.currency_code <> 'KES'
          and a.is_monetary
          and not exists (
            select 1 from gl.fx_revaluation_run r
             where r.entity_id = $1 and r.period_id = $2 and r.journal_entry_id is not null
          )`,
      [context.entityId, periodId],
    );

    checks.push({
      check: 'Foreign currency balances have been revalued',
      passed: Number(unrevalued) === 0,
      detail:
        Number(unrevalued) === 0
          ? 'No unrevalued foreign currency exposure'
          : 'There are foreign currency balances and no revaluation has been run for this period',
    });

    return checks;
  });
}
