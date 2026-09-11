'use client';

/**
 * Reversing an entry.
 *
 * The reason is mandatory and has a floor on its length. That is not
 * bureaucracy: a reversal with no explanation is the one an auditor will ask
 * about, and the person who posted it will not remember. Forcing a sentence
 * now costs ten seconds and saves an afternoon later.
 */
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reverseJournalAction } from '@/server/actions/accounting';
import { Alert, Field } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';

export function ReverseEntryForm({ entryId, entryNo }: { entryId: string; entryNo: string }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Generated once per mounted form. A retry after a lost connection sends the
  // same key, so the reversal cannot be posted twice.
  const idempotencyKey = useRef(`reverse-${entryId}-${crypto.randomUUID()}`);

  function submit() {
    setError(null);
    setFieldError(null);

    startTransition(async () => {
      const result = await reverseJournalAction({
        entryId,
        reason,
        idempotencyKey: idempotencyKey.current,
      });

      if (!result.ok) {
        setError(result.error);
        setFieldError(result.fields?.reason ?? null);
        setConfirming(false);
        return;
      }

      router.push(`/accounting/journals/${result.data.entryId}`);
      router.refresh();
    });
  }

  return (
    <div className="stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Field
        label="Why is this entry being reversed?"
        htmlFor="reason"
        required
        error={fieldError ?? undefined}
        hint="Recorded permanently against your name and shown on the reversing entry."
      >
        <textarea
          id="reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setConfirming(false);
          }}
          disabled={pending}
          placeholder="Posted to the wrong supplier; corrected by journal on the same date."
        />
      </Field>

      {confirming ? (
        <Alert tone="warning" title={`Reverse ${entryNo}?`}>
          <p>
            A new entry will be posted that cancels this one. Both will remain on the ledger and
            neither can be deleted.
          </p>
          <div className="button-row" style={{ marginTop: 10 }}>
            <button type="button" className="button--danger" onClick={submit} disabled={pending}>
              <BusyLabel pending={pending} idle={`Yes, reverse ${entryNo}`} tone="inverse" />
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </button>
          </div>
        </Alert>
      ) : (
        <div>
          <button
            type="button"
            className="button--danger"
            disabled={pending || reason.trim().length < 10}
            onClick={() => setConfirming(true)}
          >
            Reverse this entry
          </button>
          {reason.trim().length < 10 ? (
            <p className="field__hint" style={{ marginTop: 6 }}>
              Write the reason first.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
