'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { voidInvoiceAction } from '@/server/actions/sales';
import { Alert, Field } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';

export function VoidInvoiceForm({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="stack">
      {error ? <Alert title="Could not void">{error}</Alert> : null}
      <Field
        label="Reason"
        htmlFor="reason"
        required
        hint="At least ten characters. This is the record that explains the void."
      >
        <textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="button-row">
        <button
          type="button"
          className="button button--danger"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await voidInvoiceAction({ invoiceId, reason });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              router.refresh();
            });
          }}
        >
          <BusyLabel pending={pending} idle="Void invoice" tone="inverse" />
        </button>
      </div>
    </div>
  );
}
