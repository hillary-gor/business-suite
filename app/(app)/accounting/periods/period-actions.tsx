'use client';

/**
 * Closing, reopening and revaluing.
 *
 * Reopening a closed period is treated as the exceptional act it is: it needs
 * a separate permission, a written reason of real length, and an explicit
 * confirmation. The database logs it against the user's name in
 * gl.period_reopen_log, which is the record an auditor will ask for when a
 * previously reported figure has changed.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  closePeriodAction,
  reopenPeriodAction,
  revalueFxAction,
} from '@/server/actions/accounting';
import { Alert, Amount, Card, DataTable, Field, StatusBadge } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';
import type { CloseReadiness, RevaluationSummary } from '@/server/modules/accounting/periods';

export function PeriodActions({
  period,
  readiness,
  mayClose,
  mayReopen,
  mayRevalue,
}: {
  period: { id: string; name: string; status: string; endDate: string };
  readiness: readonly CloseReadiness[];
  mayClose: boolean;
  mayReopen: boolean;
  mayRevalue: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [confirmingReopen, setConfirmingReopen] = useState(false);
  const [revaluation, setRevaluation] = useState<RevaluationSummary | null>(null);

  const blocking = readiness.filter((r) => !r.passed);
  // The eTIMS backlog is worth knowing about but does not stop a close: the
  // revenue is earned whether or not KRA has acknowledged the document yet.
  const hardBlocking = blocking.filter((r) => r.check !== 'Every invoice has been fiscalised');

  function reset() {
    setError(null);
    setNotice(null);
  }

  return (
    <div className="stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <Card title={`${period.name}`} description={`Ends ${period.endDate}.`}>
        <div className="spread" style={{ marginBottom: 14 }}>
          <StatusBadge status={period.status} />
        </div>

        {period.status === 'OPEN' ? (
          <>
            <ul className="checklist">
              {readiness.map((check) => (
                <li key={check.check} data-passed={check.passed}>
                  <span className="checklist__mark" aria-hidden="true">
                    {check.passed ? '✓' : '✕'}
                  </span>
                  <span>
                    <span className="checklist__name">{check.check}</span>
                    <span className="checklist__detail"> — {check.detail}</span>
                  </span>
                </li>
              ))}
            </ul>

            {mayRevalue ? (
              <div className="button-row" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    reset();
                    startTransition(async () => {
                      const result = await revalueFxAction({
                        periodId: period.id,
                        rateType: 'CLOSING',
                      });
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      setRevaluation(result.data);
                      setNotice(result.message ?? null);
                      router.refresh();
                    });
                  }}
                >
                  <BusyLabel pending={pending} idle={`Revalue foreign currency at ${period.endDate}`} />
                </button>
                <span className="text-muted text-small">
                  Restates foreign currency balances at the closing rate and posts the unrealised
                  difference.
                </span>
              </div>
            ) : null}

            {mayClose ? (
              <div style={{ marginTop: 18 }}>
                {confirmingClose ? (
                  <Alert tone="warning" title={`Close ${period.name}?`}>
                    <p>
                      Nothing can be posted into this period afterwards without a separate
                      permission to reopen it. Account balances will be snapshotted as they stand.
                    </p>
                    <div className="button-row" style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        className="button--primary"
                        disabled={pending}
                        onClick={() => {
                          reset();
                          startTransition(async () => {
                            const result = await closePeriodAction({ periodId: period.id });
                            setConfirmingClose(false);
                            if (!result.ok) {
                              setError(result.error);
                              return;
                            }
                            setNotice(result.message ?? null);
                            router.refresh();
                          });
                        }}
                      >
                        <BusyLabel pending={pending} idle={`Yes, close ${period.name}`} tone="inverse" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingClose(false)}
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
                      disabled={pending || hardBlocking.length > 0}
                      onClick={() => setConfirmingClose(true)}
                    >
                      Close {period.name}
                    </button>
                    {hardBlocking.length > 0 ? (
                      <span className="text-muted text-small">
                        {hardBlocking.length} check
                        {hardBlocking.length === 1 ? '' : 's'} must pass first.
                      </span>
                    ) : blocking.length > 0 ? (
                      <span className="text-muted text-small">
                        The eTIMS backlog will not stop the close, but it still needs clearing.
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted text-small" style={{ marginTop: 14 }}>
                You do not have permission to close a period.
              </p>
            )}
          </>
        ) : null}

        {period.status === 'CLOSED' ? (
          mayReopen ? (
            <div className="stack">
              <Alert tone="warning" title="This period is closed">
                Reopening it allows postings that will change figures already reported. The reason
                you give is recorded permanently against your name.
              </Alert>

              <Field
                label="Why does this period need reopening?"
                htmlFor="reopenReason"
                required
                hint="At least a couple of sentences. This is the record an auditor will read."
              >
                <textarea
                  id="reopenReason"
                  value={reopenReason}
                  onChange={(e) => {
                    setReopenReason(e.target.value);
                    setConfirmingReopen(false);
                  }}
                  disabled={pending}
                  placeholder="Supplier invoice AV-55021 for September freight arrived after close and must be accrued in the period it relates to. Approved by the Financial Controller."
                />
              </Field>

              {confirmingReopen ? (
                <Alert tone="danger" title={`Reopen ${period.name}?`}>
                  <div className="button-row" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="button--danger"
                      disabled={pending}
                      onClick={() => {
                        reset();
                        startTransition(async () => {
                          const result = await reopenPeriodAction({
                            periodId: period.id,
                            reason: reopenReason,
                          });
                          setConfirmingReopen(false);
                          if (!result.ok) {
                            setError(result.error);
                            return;
                          }
                          setNotice(result.message ?? null);
                          setReopenReason('');
                          router.refresh();
                        });
                      }}
                    >
                      <BusyLabel pending={pending} idle={`Yes, reopen ${period.name}`} tone="inverse" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingReopen(false)}
                      disabled={pending}
                    >
                      Cancel
                    </button>
                  </div>
                </Alert>
              ) : (
                <div>
                  <button
                    type="button"
                    className="button--danger"
                    disabled={pending || reopenReason.trim().length < 20}
                    onClick={() => setConfirmingReopen(true)}
                  >
                    Reopen {period.name}
                  </button>
                  {reopenReason.trim().length < 20 ? (
                    <p className="field__hint" style={{ marginTop: 6 }}>
                      Write the reason first.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted">
              This period is closed. Reopening it requires a permission you do not hold.
            </p>
          )
        ) : null}
      </Card>

      {revaluation ? (
        <Card
          title="Revaluation result"
          description={`At the ${revaluation.rateType.toLowerCase()} rate as at ${revaluation.asAt}. ${
            revaluation.entryNo
              ? `Posted as ${revaluation.entryNo}.`
              : 'No adjustment was needed, so no entry was posted.'
          }`}
        >
          {revaluation.positions.length === 0 ? (
            <p className="text-muted">No foreign currency balances were held at that date.</p>
          ) : (
            <DataTable dense>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Code</th>
                  <th>Account</th>
                  <th style={{ width: 80 }}>Currency</th>
                  <th className="numeric" style={{ width: 170 }}>
                    Cumulative adjustment
                  </th>
                </tr>
              </thead>
              <tbody>
                {revaluation.positions.map((p) => (
                  <tr key={`${p.accountCode}-${p.currencyCode}`}>
                    <td className="cell-code">{p.accountCode}</td>
                    <td>{p.accountName}</td>
                    <td className="cell-code">{p.currencyCode}</td>
                    <td className="numeric">
                      <Amount value={p.cumulativeAdjustment} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Unrealised gain or loss posted by this run</td>
                  <td className="numeric">
                    <Amount value={revaluation.netGain} emphasis />
                  </td>
                </tr>
              </tfoot>
            </DataTable>
          )}
          <p className="text-muted text-small" style={{ marginTop: 10 }}>
            The cumulative column is the total adjustment made to each balance since the ledger
            began, which is what reverses out when the position is settled.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
