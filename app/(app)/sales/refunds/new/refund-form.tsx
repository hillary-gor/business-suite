'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveRefundAction } from '@/server/actions/sales';
import { Alert, Field } from '@/components/ui';
import { PrintDocumentButton } from '@/components/documents/document-pdf-preview';
import { composerPaymentDraft } from '@/lib/documents/composer-draft';
import { BusyLabel } from '@/components/loading/dots-loader';

export function RefundForm({
  customers,
  banks,
  baseCurrency,
}: {
  customers: ReadonlyArray<{ id: string; label: string; currencyCode: string }>;
  banks: ReadonlyArray<{ id: string; label: string }>;
  baseCurrency: string;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [bankAccountId, setBankAccountId] = useState(banks[0]?.id ?? '');
  const [refundDate, setRefundDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const currency = customers.find((c) => c.id === customerId)?.currencyCode ?? baseCurrency;

  const pdfDraft = useMemo(
    () =>
      composerPaymentDraft({
        kind: 'refund',
        issueDate: refundDate,
        party: { name: customers.find((c) => c.id === customerId)?.label ?? 'Customer' },
        currency,
        amount: amount || '0',
        notes: memo || null,
      }),
    [amount, currency, customerId, customers, memo, refundDate],
  );

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveRefundAction({
        customerId,
        refundDate,
        amount,
        bankAccountId,
        currencyCode: currency,
        memo: memo || undefined,
        allocations: [],
        post: true,
        idempotencyKey,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/sales/refunds');
      router.refresh();
    });
  }

  return (
    <div className="stack">
      {error ? <Alert title="Could not save">{error}</Alert> : null}
      <div className="form-grid">
        <Field label="Customer" htmlFor="customer" required>
          <select id="customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bank / cash" htmlFor="bank" required>
          <select
            id="bank"
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
          >
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Refund date" htmlFor="refundDate" required>
          <input
            id="refundDate"
            type="date"
            value={refundDate}
            onChange={(e) => setRefundDate(e.target.value)}
          />
        </Field>
        <Field label="Amount" htmlFor="amount" required>
          <input
            id="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
          />
        </Field>
      </div>
      <Field label="Memo" htmlFor="memo">
        <textarea id="memo" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </Field>
      <div className="button-row">
        <PrintDocumentButton kind="refund" draft={pdfDraft} />
        <button
          type="button"
          className="button button--primary"
          disabled={pending}
          onClick={submit}
        >
          <BusyLabel pending={pending} idle="Post refund" tone="inverse" />
        </button>
      </div>
    </div>
  );
}
