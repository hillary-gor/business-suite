'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveSupplierAction } from '@/server/actions/inventory';
import { Alert, Field } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';

export function VendorForm({
  currencies,
  paymentTerms,
  baseCurrency,
  canApprove,
  onSaved,
  submitLabel = 'Save vendor',
  supplier,
}: {
  currencies: ReadonlyArray<{ code: string; name: string }>;
  paymentTerms: ReadonlyArray<{ id: string; label: string }>;
  baseCurrency: string;
  canApprove: boolean;
  onSaved?: (result: { supplierId: string; legalName: string }) => void;
  submitLabel?: string;
  supplier?: {
    id: string;
    legalName: string;
    tradingName: string;
    code: string;
    email: string;
    phone: string;
    taxPin: string;
    currencyCode: string;
    paymentTermsId: string;
    notes: string;
    approvalStatus: 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'BLACKLISTED';
  };
}) {
  const router = useRouter();
  const [legalName, setLegalName] = useState(supplier?.legalName ?? '');
  const [tradingName, setTradingName] = useState(supplier?.tradingName ?? '');
  const [code, setCode] = useState(supplier?.code ?? '');
  const [email, setEmail] = useState(supplier?.email ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [taxPin, setTaxPin] = useState(supplier?.taxPin ?? '');
  const [currencyCode, setCurrencyCode] = useState(supplier?.currencyCode ?? baseCurrency);
  const [paymentTermsId, setPaymentTermsId] = useState(
    supplier?.paymentTermsId ?? paymentTerms[0]?.id ?? '',
  );
  const [notes, setNotes] = useState(supplier?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveSupplierAction({
        supplierId: supplier?.id,
        legalName,
        tradingName: tradingName || undefined,
        code: code || undefined,
        email: email || undefined,
        phone: phone || undefined,
        taxPin: taxPin || undefined,
        currencyCode,
        paymentTermsId: paymentTermsId || undefined,
        notes: notes || undefined,
        approvalStatus: supplier ? supplier.approvalStatus : canApprove ? 'APPROVED' : 'PENDING',
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (onSaved) {
        onSaved({ supplierId: result.data.supplierId, legalName });
        return;
      }
      router.push(`/purchasing/vendors/${result.data.supplierId}`);
      router.refresh();
    });
  }

  return (
    <div className="stack">
      {error ? <Alert title="Could not save vendor">{error}</Alert> : null}
      <div className="form-grid">
        <Field label="Legal name" htmlFor="legalName" required>
          <input id="legalName" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
        </Field>
        <Field label="Display name" htmlFor="tradingName">
          <input
            id="tradingName"
            value={tradingName}
            onChange={(e) => setTradingName(e.target.value)}
          />
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
        <button
          type="button"
          className="button button--primary"
          disabled={pending}
          onClick={submit}
        >
          <BusyLabel pending={pending} idle={submitLabel} tone="inverse" />
        </button>
      </div>
    </div>
  );
}
