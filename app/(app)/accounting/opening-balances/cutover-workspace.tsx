'use client';

/**
 * The cutover workspace.
 *
 * The validation results are the centre of this screen, not an afterthought.
 * Each check shows what was expected, what was found, and the difference, so a
 * failing check tells the user which figure to go and look at rather than
 * merely that something is wrong.
 *
 * The Post button stays disabled until every check passes. The database
 * refuses anyway, but a button that cannot fail is easier to trust than one
 * that produces an error.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createOpeningBatchAction,
  loadOpeningDataAction,
  postOpeningBalancesAction,
  validateOpeningBalancesAction,
} from '@/server/actions/accounting';
import { Alert, Amount, DataTable, Field, StatusBadge } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';
import { Money } from '@/lib/money';
import type { BatchSummary, ValidationResult } from '@/server/modules/accounting/opening-balances';

type Dataset = 'trial-balance' | 'receivables' | 'payables' | 'inventory';

const DATASETS: ReadonlyArray<{
  id: Dataset;
  label: string;
  columns: string;
  example: string;
}> = [
  {
    id: 'trial-balance',
    label: 'Trial balance',
    columns: 'account_code, debit, credit, memo',
    example: '1015,2500000,0,Bank balance per statement\n2010,0,1200000,Trade payables',
  },
  {
    id: 'receivables',
    label: 'Open receivables',
    columns:
      'customer_code, document_no, document_date, due_date, currency_code, amount_txn, amount_base',
    example: 'KQ001,INV-8801,2026-07-20,2026-08-19,KES,1100000,1100000',
  },
  {
    id: 'payables',
    label: 'Open payables',
    columns:
      'supplier_code, document_no, document_date, due_date, currency_code, amount_txn, amount_base',
    example: 'AVS001,AV-55021,2026-08-05,2026-09-19,USD,9000,1152000',
  },
  {
    id: 'inventory',
    label: 'Stock on hand',
    columns:
      'part_number, warehouse_code, bin_code, condition_code, serial_number, lot_number, quantity, unit_cost_base',
    example: 'BRK-PAD-737,MAIN,MAIN,NE,,LOT-2026-03,150,5000',
  },
];

export function CutoverWorkspace({
  batches,
  focusId,
  validation,
  mayPost,
  baseCurrency,
}: {
  batches: readonly BatchSummary[];
  focusId: string | null;
  validation: readonly ValidationResult[];
  mayPost: boolean;
  baseCurrency: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [results, setResults] = useState<readonly ValidationResult[]>(validation);
  const [confirmingPost, setConfirmingPost] = useState(false);

  const [cutoverDate, setCutoverDate] = useState('');
  const [dataset, setDataset] = useState<Dataset>('trial-balance');
  const [csv, setCsv] = useState('');

  const batch = batches.find((b) => b.id === focusId) ?? null;
  const failing = results.filter((r) => !r.passed);
  const allPassed = results.length > 0 && failing.length === 0;
  const isPosted = batch?.status === 'POSTED';
  const active = DATASETS.find((d) => d.id === dataset);

  function reset() {
    setError(null);
    setNotice(null);
  }

  if (!batch) {
    return (
      <div className="stack">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Field
          label="Cutover date"
          htmlFor="cutoverDate"
          required
          hint="The date the QuickBooks balances are as at. Normally the last day of a period you have already closed in QuickBooks."
        >
          <input
            id="cutoverDate"
            type="date"
            value={cutoverDate}
            onChange={(e) => setCutoverDate(e.target.value)}
            disabled={pending}
            style={{ maxWidth: 220 }}
          />
        </Field>

        <div>
          <button
            type="button"
            className="button--primary"
            disabled={pending || !cutoverDate}
            onClick={() => {
              reset();
              startTransition(async () => {
                const result = await createOpeningBatchAction({
                  cutoverDate,
                  sourceSystem: 'QuickBooks Desktop',
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.push(`/accounting/opening-balances?batch=${result.data.batchId}`);
                router.refresh();
              });
            }}
          >
            <BusyLabel pending={pending} idle="Create cutover batch" tone="inverse" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone={allPassed ? 'success' : 'warning'}>{notice}</Alert> : null}

      <div className="spread">
        <div>
          <h2>Cutover at {batch.cutoverDate}</h2>
          <p className="text-muted text-small">
            From {batch.sourceSystem} · created {batch.createdAt}
          </p>
        </div>
        <StatusBadge status={batch.status} />
      </div>

      <DataTable dense>
        <thead>
          <tr>
            <th>Staged data</th>
            <th className="numeric" style={{ width: 70 }}>
              Rows
            </th>
            <th className="numeric" style={{ width: 150 }}>
              Total ({baseCurrency})
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Trial balance</td>
            <td className="numeric cell-muted">{batch.counts.trialBalanceLines}</td>
            <td className="numeric">
              <Amount value={batch.totals.debits} dash />
            </td>
          </tr>
          <tr>
            <td>Open receivables</td>
            <td className="numeric cell-muted">{batch.counts.receivables}</td>
            <td className="numeric">
              <Amount value={batch.totals.receivables} dash />
            </td>
          </tr>
          <tr>
            <td>Open payables</td>
            <td className="numeric cell-muted">{batch.counts.payables}</td>
            <td className="numeric">
              <Amount value={batch.totals.payables} dash />
            </td>
          </tr>
          <tr>
            <td>Stock on hand</td>
            <td className="numeric cell-muted">{batch.counts.inventory}</td>
            <td className="numeric">
              <Amount value={batch.totals.inventory} dash />
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>Trial balance credits, for comparison</td>
            <td />
            <td className="numeric">
              <Amount value={batch.totals.credits} emphasis />
            </td>
          </tr>
        </tfoot>
      </DataTable>

      {!Money.from(batch.totals.debits).equals(batch.totals.credits) ? (
        <Alert tone="warning" title="The staged trial balance does not net to zero">
          Debits are <Amount value={batch.totals.debits} /> and credits{' '}
          <Amount value={batch.totals.credits} />, a difference of{' '}
          <Amount value={Money.from(batch.totals.debits).minus(batch.totals.credits)} />. Fix the
          export and load it again.
        </Alert>
      ) : null}

      {isPosted ? (
        <Alert tone="success" title="Posted">
          This batch was posted as {batch.journalEntryNo}. It can no longer be changed.
        </Alert>
      ) : (
        <>
          <div className="stack">
            <h3>Load staging data</h3>

            <div className="form-row">
              <Field label="Dataset" htmlFor="dataset">
                <select
                  id="dataset"
                  value={dataset}
                  onChange={(e) => setDataset(e.target.value as Dataset)}
                  disabled={pending}
                >
                  {DATASETS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field
              label="Pasted CSV, including the header row"
              htmlFor="csv"
              hint={`Required columns: ${active?.columns}. Loading replaces whatever was staged for this dataset, so a corrected export can simply be pasted again.`}
            >
              <textarea
                id="csv"
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                disabled={pending}
                rows={8}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                placeholder={`${active?.columns.replace(/, /g, ',')}\n${active?.example}`}
              />
            </Field>

            <div className="button-row">
              <button
                type="button"
                disabled={pending || csv.trim().length === 0}
                onClick={() => {
                  reset();
                  startTransition(async () => {
                    const result = await loadOpeningDataAction({
                      batchId: batch.id,
                      dataset,
                      csv,
                    });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setNotice([result.message, ...result.data.warnings].filter(Boolean).join(' '));
                    setCsv('');
                    setResults([]);
                    router.refresh();
                  });
                }}
              >
                <BusyLabel pending={pending} idle={`Load ${active?.label.toLowerCase()}`} />
              </button>
            </div>
          </div>

          <div className="stack">
            <h3>Validate</h3>
            <div className="button-row">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  reset();
                  startTransition(async () => {
                    const result = await validateOpeningBalancesAction({ batchId: batch.id });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setResults(result.data);
                    setNotice(result.message ?? null);
                  });
                }}
              >
                <BusyLabel pending={pending} idle="Run every check" />
              </button>
            </div>

            {results.length > 0 ? (
              <ul className="checklist">
                {results.map((check) => (
                  <li key={check.checkName} data-passed={check.passed}>
                    <span className="checklist__mark" aria-hidden="true">
                      {check.passed ? '✓' : '✕'}
                    </span>
                    <span>
                      <span className="checklist__name">{check.checkName}</span>
                      {!check.passed ? (
                        <span className="checklist__detail">
                          {check.expected !== null && check.actual !== null ? (
                            <>
                              {' '}
                              — control account says <Amount value={check.expected} />, detail
                              totals <Amount value={check.actual} />
                              {check.difference !== null ? (
                                <>
                                  , out by <Amount value={check.difference} emphasis />
                                </>
                              ) : null}
                            </>
                          ) : null}
                          {check.detail ? <> — {check.detail}</> : null}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {mayPost ? (
            <div className="stack">
              <h3>Post</h3>
              {confirmingPost ? (
                <Alert tone="warning" title="Post the opening balances?">
                  <p>
                    This writes the opening position of the business to the general ledger as at{' '}
                    {batch.cutoverDate}, along with the receivables, payables and stock detail. It
                    happens once and cannot be undone or repeated.
                  </p>
                  <div className="button-row" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="button--primary"
                      disabled={pending}
                      onClick={() => {
                        reset();
                        startTransition(async () => {
                          const result = await postOpeningBalancesAction({ batchId: batch.id });
                          setConfirmingPost(false);
                          if (!result.ok) {
                            setError(result.error);
                            return;
                          }
                          setNotice(result.message ?? null);
                          router.refresh();
                        });
                      }}
                    >
                      <BusyLabel pending={pending} idle="Yes, post the opening balances" tone="inverse" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingPost(false)}
                      disabled={pending}
                    >
                      Cancel
                    </button>
                  </div>
                </Alert>
              ) : (
                <div className="button-row">
                  <button
                    type="button"
                    className="button--primary"
                    disabled={pending || !allPassed}
                    onClick={() => setConfirmingPost(true)}
                  >
                    Post opening balances
                  </button>
                  <span className="text-muted text-small">
                    {results.length === 0
                      ? 'Run the validation first.'
                      : allPassed
                        ? 'Every check passed.'
                        : `${failing.length} check${failing.length === 1 ? '' : 's'} still failing.`}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted text-small">
              You can stage and validate this data, but posting the opening balances requires a
              permission you do not hold.
            </p>
          )}
        </>
      )}

      {batches.length > 1 ? (
        <div>
          <h3>Other batches</h3>
          <DataTable dense>
            <tbody>
              {batches
                .filter((b) => b.id !== batch.id)
                .map((b) => (
                  <tr key={b.id}>
                    <td className="cell-code">{b.cutoverDate}</td>
                    <td>{b.sourceSystem}</td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                    <td>
                      <a
                        href={`/accounting/opening-balances?batch=${b.id}`}
                        className="button button--small button--ghost"
                      >
                        Open
                      </a>
                    </td>
                  </tr>
                ))}
            </tbody>
          </DataTable>
        </div>
      ) : null}
    </div>
  );
}
