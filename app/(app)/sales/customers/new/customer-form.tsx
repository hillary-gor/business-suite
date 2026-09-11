'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveCustomerAction } from '@/server/actions/sales';
import { Alert, Field } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';

export function CustomerForm({
  currencies,
  paymentTerms,
  baseCurrency,
}: {
  currencies: ReadonlyArray<{ code: string; name: string }>;
  paymentTerms: ReadonlyArray<{ id: string; label: string }>;
  baseCurrency: string;
}) {
  const router = useRouter();
  const [legalName, setLegalName] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [taxPin, setTaxPin] = useState('');
  const [currencyCode, setCurrencyCode] = useState(baseCurrency);
  const [paymentTermsId, setPaymentTermsId] = useState(paymentTerms[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveCustomerAction({
        legalName,
        code: code || undefined,
        email: email || undefined,
        phone: phone || undefined,
        taxPin: taxPin || undefined,
        currencyCode,
        paymentTermsId: paymentTermsId || undefined,
        notes: notes || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/sales/customers');
      router.refresh();
    });
  }

  return (
    <div className="stack">
      {error ? <Alert title="Could not save customer">{error}</Alert> : null}
      <div className="form-grid">
        <Field label="Legal name" htmlFor="legalName" required>
          <input id="legalName" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
        </Field>
        <Field label="Code" htmlFor="code" hint="Leave blank to generate one">
          <input id="code" value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <select
            id="currency"
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value)}
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Payment terms" htmlFor="terms">
          <select
            id="terms"
            value={paymentTermsId}
            onChange={(e) => setPaymentTermsId(e.target.value)}
          >
            <option value="">None</option>
            {paymentTerms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Email" htmlFor="email">
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Tax PIN" htmlFor="taxPin">
          <input id="taxPin" value={taxPin} onChange={(e) => setTaxPin(e.target.value)} />
        </Field>
      </div>
      <Field label="Notes" htmlFor="notes">
        <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="button-row">
        <button type="button" className="button button--primary" disabled={pending} onClick={submit}>
          <BusyLabel pending={pending} idle="Save customer" tone="inverse" />
        </button>
      </div>
    </div>
  );
}
