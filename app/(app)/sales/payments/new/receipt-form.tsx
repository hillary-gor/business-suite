'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { saveReceiptAction } from '@/server/actions/sales';
import { Money, formatMoney } from '@/lib/money';
import { formatDisplayDate } from '@/lib/payables';
import { Alert, Field } from '@/components/ui';
import { PageFeedback, SplitMenu } from '@/components/lists/list-chrome';
import { applyReceiptAmount, receiptCreditRemainder } from '@/lib/invoice-stock';
import { InvoiceDialogRoot } from '@/app/(app)/sales/invoices/new/invoice-dialog-root';
import { PrintDocumentButton } from '@/components/documents/document-pdf-preview';
import { composerPaymentDraft } from '@/lib/documents/composer-draft';

interface OpenInvoice {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  total: string;
  outstanding: string;
  currencyCode: string;
}

const METHODS = ['Cash', 'Bank transfer', 'M-Pesa', 'Cheque', 'Card'] as const;
const STUB = 'Not in this version';

export function ReceiptForm({
  customers,
  banks,
  loadOpenInvoices,
  initialCustomerId,
  today,
}: {
  customers: ReadonlyArray<{
    id: string;
    label: string;
    currencyCode: string;
    email: string | null;
  }>;
  banks: ReadonlyArray<{ id: string; label: string }>;
  loadOpenInvoices: (customerId: string) => Promise<OpenInvoice[]>;
  initialCustomerId?: string;
  today: string;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(
    initialCustomerId && customers.some((customer) => customer.id === initialCustomerId)
      ? initialCustomerId
      : (customers[0]?.id ?? ''),
  );
  const [bankAccountId, setBankAccountId] = useState(banks[0]?.id ?? '');
  const [receiptDate, setReceiptDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [findNo, setFindNo] = useState('');
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const findRef = useRef<HTMLInputElement>(null);
  const idempotencyKey = useRef<string | null>(null);

  const customer = customers.find((entry) => entry.id === customerId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!customerId) return;
      const rows = await loadOpenInvoices(customerId);
      if (cancelled) return;
      setOpenInvoices(rows);
      setAllocations({});
      setAmount('');
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, loadOpenInvoices]);

  const currency = customer?.currencyCode ?? openInvoices[0]?.currencyCode ?? 'KES';

  const visible = openInvoices.filter((invoice) =>
    findNo.trim()
      ? (invoice.invoiceNo ?? '').toLowerCase().includes(findNo.trim().toLowerCase())
      : true,
  );

  const applied = useMemo(() => {
    let total = Money.zero();
    for (const value of Object.values(allocations)) {
      if (value) total = total.plus(value);
    }
    return total;
  }, [allocations]);

  const credit = receiptCreditRemainder(amount || '0', applied.toDatabase());
  const customerBalance = useMemo(() => {
    let total = Money.zero();
    for (const invoice of openInvoices) total = total.plus(invoice.outstanding);
    return total;
  }, [openInvoices]);

  const pdfDraft = useMemo(
    () =>
      composerPaymentDraft({
        kind: 'receipt',
        issueDate: receiptDate,
        party: {
          name: customer?.label ?? 'Customer',
          email: customer?.email ?? null,
        },
        currency,
        amount: amount || applied.toDatabase() || '0',
        notes:
          [method ? `Method: ${method}` : '', reference ? `Ref: ${reference}` : '', memo]
            .map((part) => part.trim())
            .filter(Boolean)
            .join(' · ') || null,
        allocations: openInvoices
          .filter((invoice) => allocations[invoice.id])
          .map((invoice) => ({
            description: invoice.invoiceNo,
            date: invoice.invoiceDate,
            amount: allocations[invoice.id] ?? '0',
          })),
      }),
    [
      allocations,
      amount,
      applied,
      currency,
      customer,
      memo,
      method,
      openInvoices,
      receiptDate,
      reference,
    ],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) router.push('/sales/invoices');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, router]);

  function setReceived(value: string) {
    setAmount(value);
    setAllocations(applyReceiptAmount(openInvoices, value));
  }

  function toggleInvoice(invoice: OpenInvoice, checked: boolean) {
    setAllocations((current) => {
      const next = { ...current };
      if (checked) next[invoice.id] = invoice.outstanding;
      else delete next[invoice.id];
      let total = Money.zero();
      for (const value of Object.values(next)) {
        if (value) total = total.plus(value);
      }
      setAmount(total.isZero() ? '' : total.toDatabase());
      return next;
    });
  }

  function clearPayment() {
    setAllocations({});
    setAmount('');
  }

  function composedMemo(): string | undefined {
    const parts = [method ? `Method: ${method}` : '', reference ? `Ref: ${reference}` : '', memo]
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.length ? parts.join(' · ') : undefined;
  }

  function submit(after: 'stay' | 'close') {
    setError(null);
    startTransition(async () => {
      if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
      const result = await saveReceiptAction({
        customerId,
        receiptDate,
        amount,
        bankAccountId,
        currencyCode: currency,
        memo: composedMemo(),
        post: true,
        idempotencyKey: idempotencyKey.current,
        allocations: Object.entries(allocations)
          .filter(([, value]) => {
            try {
              return Money.from(value || '0').isPositive();
            } catch {
              return false;
            }
          })
          .map(([invoiceId, value]) => ({ invoiceId, amount: value })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (after === 'close') {
        router.push('/sales/invoices');
      }
      router.refresh();
    });
  }

  return (
    <InvoiceDialogRoot>
      <div
        className="invoice-dialog pay-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-title"
      >
        <header className="invoice-dialog__header">
          <div className="invoice-dialog__title-row">
            <h1 id="pay-title">Receive Payment</h1>
            <div className="pay-hero">
              <div>
                <p className="pay-hero__label">Amount received</p>
                <p className="pay-hero__amount">
                  {formatMoney(amount || '0', { currency, showCurrency: true })}
                </p>
              </div>
              <div>
                <p className="pay-hero__label">Customer balance</p>
                <p className="pay-hero__balance">
                  {formatMoney(customerBalance, { currency, showCurrency: true })}
                </p>
              </div>
            </div>
            <div className="invoice-dialog__header-actions">
              <PageFeedback />
              <Link href="/sales/invoices" className="invoice-dialog__close" aria-label="Close">
                ×
              </Link>
            </div>
          </div>
        </header>

        <div className="invoice-dialog__body">
          {error ? <Alert title="Could not post receipt">{error}</Alert> : null}

          <div className="pay-top">
            <Field label="Customer" htmlFor="customer" required>
              <select
                id="customer"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                {customers.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Email" htmlFor="pay-email">
              <input id="pay-email" type="email" value={customer?.email ?? ''} readOnly />
              <div className="pay-email-extra">
                <button
                  type="button"
                  className="button button--ghost button--small"
                  disabled
                  title={STUB}
                >
                  Cc/Bcc
                </button>
                <label className="pay-later">
                  <input type="checkbox" disabled title={STUB} />
                  Send later
                </label>
              </div>
            </Field>
            <div className="pay-find-btn">
              <button type="button" className="button" onClick={() => findRef.current?.focus()}>
                Find by invoice no.
              </button>
            </div>
          </div>

          <div className="pay-grid">
            <Field label="Payment date" htmlFor="receiptDate" required>
              <input
                id="receiptDate"
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </Field>
            <Field label="Payment method" htmlFor="method">
              <select id="method" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="">Choose payment method</option>
                {METHODS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reference no." htmlFor="reference">
              <input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            <Field label="Deposit to" htmlFor="bank" required>
              <select
                id="bank"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
              >
                {banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount received" htmlFor="amount" required>
              <input
                id="amount"
                value={amount}
                onChange={(e) => setReceived(e.target.value)}
                inputMode="decimal"
              />
            </Field>
          </div>

          <div className="pay-table-head">
            <h2>Outstanding transactions</h2>
            <Field label="Find invoice no." htmlFor="find-no">
              <input
                id="find-no"
                ref={findRef}
                value={findNo}
                onChange={(e) => setFindNo(e.target.value)}
                placeholder="Find invoice no."
              />
            </Field>
          </div>

          {visible.length === 0 ? (
            <Alert tone="info" title="No open invoices">
              This customer has nothing outstanding to allocate against. You can still post an
              unallocated receipt; it credits receivables and waits for later matching.
            </Alert>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="row-check">
                      <span className="sr-only">Select</span>
                    </th>
                    <th>Description</th>
                    <th>Due date</th>
                    <th className="numeric">Original amount</th>
                    <th className="numeric">Open balance</th>
                    <th className="numeric">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((invoice) => {
                    const selected = Boolean(allocations[invoice.id]);
                    return (
                      <tr key={invoice.id} className={selected ? 'is-selected' : undefined}>
                        <td className="row-check">
                          <input
                            type="checkbox"
                            checked={selected}
                            aria-label={`Apply to ${invoice.invoiceNo}`}
                            onChange={(event) => toggleInvoice(invoice, event.target.checked)}
                          />
                        </td>
                        <td>
                          Invoice # {invoice.invoiceNo} ({formatDisplayDate(invoice.invoiceDate)})
                        </td>
                        <td>{formatDisplayDate(invoice.dueDate)}</td>
                        <td className="numeric">
                          {formatMoney(invoice.total, {
                            currency: invoice.currencyCode,
                            showCurrency: true,
                          })}
                        </td>
                        <td className="numeric">
                          {formatMoney(invoice.outstanding, {
                            currency: invoice.currencyCode,
                            showCurrency: true,
                          })}
                        </td>
                        <td className="numeric">
                          <input
                            value={allocations[invoice.id] ?? ''}
                            onChange={(e) =>
                              setAllocations((current) => ({
                                ...current,
                                [invoice.id]: e.target.value,
                              }))
                            }
                            inputMode="decimal"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="pay-summary">
            <p>
              Amount to apply{' '}
              <strong>{formatMoney(applied, { currency, showCurrency: true })}</strong>
            </p>
            <p>
              Amount to credit{' '}
              <strong>{formatMoney(credit, { currency, showCurrency: true })}</strong>
            </p>
            <button type="button" className="button" onClick={clearPayment}>
              Clear payment
            </button>
          </div>

          <div className="invoice-bottom">
            <Field label="Memo" htmlFor="memo">
              <textarea id="memo" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
            </Field>
            <div className="invoice-attach">
              <span className="invoice-attach__link" title={STUB}>
                Add attachment
              </span>
              <span className="cell-muted">
                Max file size: 20 MB. Attachments are not in this version.
              </span>
            </div>
          </div>
        </div>

        <footer className="invoice-dialog__footer pay-footer">
          <Link href="/sales/invoices" className="button">
            Cancel
          </Link>
          <PrintDocumentButton kind="receipt" draft={pdfDraft} />
          <div className="invoice-dialog__footer-save">
            <button
              type="button"
              className="button"
              disabled={pending}
              onClick={() => submit('stay')}
            >
              Save
            </button>
            <SplitMenu
              label={pending ? 'Saving' : 'Save and close'}
              primary
              onClick={() => submit('close')}
              items={[{ label: 'Save and new', disabled: true, title: STUB }]}
            />
          </div>
        </footer>
      </div>
    </InvoiceDialogRoot>
  );
}
