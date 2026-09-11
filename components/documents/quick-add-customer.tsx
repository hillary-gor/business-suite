'use client';

import { useEffect, useState, useTransition } from 'react';
import { saveCustomerAction } from '@/server/actions/sales';
import { Alert, Field } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';

export type QuickCustomer = {
  id: string;
  label: string;
  currencyCode: string;
  email: string | null;
  phone: string | null;
  paymentTermsId: string | null;
};

export function QuickAddCustomerPanel({
  open,
  initialName,
  currencies,
  paymentTerms,
  baseCurrency,
  onClose,
  onCreated,
}: {
  open: boolean;
  initialName: string;
  currencies: ReadonlyArray<{ code: string; name: string }>;
  paymentTerms: ReadonlyArray<{ id: string; label: string }>;
  baseCurrency: string;
  onClose: () => void;
  onCreated: (customer: QuickCustomer) => void;
}) {
  const [legalName, setLegalName] = useState(initialName);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [currencyCode, setCurrencyCode] = useState(baseCurrency);
  const [paymentTermsId, setPaymentTermsId] = useState(paymentTerms[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLegalName(initialName);
    setEmail('');
    setPhone('');
    setCurrencyCode(baseCurrency);
    setPaymentTermsId(paymentTerms[0]?.id ?? '');
    setError(null);
  }, [open, initialName, baseCurrency, paymentTerms]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || pending) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, pending, onClose]);

  if (!open) return null;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveCustomerAction({
        legalName,
        email: email || undefined,
        phone: phone || undefined,
        currencyCode,
        paymentTermsId: paymentTermsId || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated({
        id: result.data.customerId,
        label: legalName,
        currencyCode,
        email: email || null,
        phone: phone || null,
        paymentTermsId: paymentTermsId || null,
      });
      onClose();
    });
  }

  return (
    <>
      <button
        type="button"
        className="drawer-backdrop drawer-backdrop--over-dialog"
        aria-label="Close"
        onClick={onClose}
      />
      <aside
        className="drawer drawer--left drawer--over-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-customer-title"
      >
        <div className="drawer__header">
          <h2 id="add-customer-title" className="drawer__title">
            Add customer
          </h2>
          <button type="button" className="button button--ghost button--small" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="drawer__body stack">
          {error ? <Alert title="Could not save customer">{error}</Alert> : null}
          <Field label="Legal name" htmlFor="qc-name" required>
            <input
              id="qc-name"
              value={legalName}
              onChange={(event) => setLegalName(event.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Email" htmlFor="qc-email">
            <input
              id="qc-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Phone" htmlFor="qc-phone">
            <input id="qc-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
          <Field label="Currency" htmlFor="qc-currency">
            <select
              id="qc-currency"
              value={currencyCode}
              onChange={(event) => setCurrencyCode(event.target.value)}
            >
              {currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} — {currency.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Payment terms" htmlFor="qc-terms">
            <select
              id="qc-terms"
              value={paymentTermsId}
              onChange={(event) => setPaymentTermsId(event.target.value)}
            >
              <option value="">None</option>
              {paymentTerms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="drawer__footer">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={pending}
            onClick={submit}
          >
            <BusyLabel pending={pending} idle="Save and select" tone="inverse" />
          </button>
        </div>
      </aside>
    </>
  );
}
