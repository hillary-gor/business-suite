'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approvePoAction, cancelPoAction } from '@/server/actions/purchasing';
import { Alert, Field } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';

export function PoActions({
  poId,
  canApprove,
  canCancel,
}: {
  poId: string;
  canApprove: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approvePoAction({ poId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelPoAction({ poId, reason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (!canApprove && !canCancel) return null;

  return (
    <div className="stack">
      {error ? <Alert title="Could not update">{error}</Alert> : null}
      <div className="button-row">
        {canApprove ? (
          <button type="button" className="button button--primary" disabled={pending} onClick={approve}>
            <BusyLabel pending={pending} idle="Approve" tone="inverse" />
          </button>
        ) : null}
      </div>
      {canCancel ? (
        <>
          <Field label="Cancel reason" htmlFor="cancelReason" required>
            <textarea
              id="cancelReason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="At least five characters"
            />
          </Field>
          <button type="button" className="button" disabled={pending || reason.trim().length < 5} onClick={cancel}>
            Cancel draft
          </button>
        </>
      ) : null}
    </div>
  );
}
