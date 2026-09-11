'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { convertQuotationAction, saveQuotationAction } from '@/server/actions/sales';
import { Money, formatMoney } from '@/lib/money';
import { Alert, Field } from '@/components/ui';
import { DocumentBrand, DocumentPoweredBy } from '@/components/documents/document-brand';
import { PrintDocumentButton } from '@/components/documents/document-pdf-preview';
import { composerDraft, composerMoneyLines } from '@/lib/documents/composer-draft';
import { ItemPicker } from '@/components/documents/item-picker';
import { BusyLabel } from '@/components/loading/dots-loader';
import { QuickAddProductButton, type QuickProduct } from '@/components/documents/quick-add-product';

interface LineState {
  key: string;
  itemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxCodeId: string;
}

const emptyLine = (): LineState => ({
  key: crypto.randomUUID(),
  itemId: '',
  description: '',
  quantity: '1',
  unitPrice: '',
  taxCodeId: '',
});

export function EstimateForm({
  customers,
  taxCodes,
  items: initialItems,
  units,
  defaultTaxCodeId,
  baseCurrency,
  canSend,
  entity,
  existing,
}: {
  customers: ReadonlyArray<{ id: string; label: string; currencyCode: string }>;
  taxCodes: ReadonlyArray<{ id: string; label: string; rate: string }>;
  items: ReadonlyArray<{ id: string; label: string; description: string; partNumber?: string }>;
  units: ReadonlyArray<{ code: string; name: string }>;
  defaultTaxCodeId: string | null;
  baseCurrency: string;
  canSend: boolean;
  entity: {
    name: string;
    tradingName: string | null;
    registrationNumber: string | null;
    logoSrc: string;
  };
  existing?: {
    id: string;
    customerId: string;
    quotationDate: string;
    notes: string | null;
    lines: ReadonlyArray<{
      itemId: string | null;
      description: string;
      quantity: string;
      unitPrice: string;
      taxCodeId: string | null;
    }>;
  };
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(existing?.customerId ?? customers[0]?.id ?? '');
  const [quotationDate, setQuotationDate] = useState(
    existing?.quotationDate ?? new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [items, setItems] = useState(initialItems);
  const [lines, setLines] = useState<LineState[]>(() =>
    existing && existing.lines.length > 0
      ? existing.lines.map((line) => ({
          key: crypto.randomUUID(),
          itemId: line.itemId ?? '',
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxCodeId: line.taxCodeId ?? '',
        }))
      : [{ ...emptyLine(), taxCodeId: defaultTaxCodeId ?? '' }],
  );
  const [quotationId, setQuotationId] = useState<string | null>(existing?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const currency = customers.find((c) => c.id === customerId)?.currencyCode ?? baseCurrency;

  const totals = useMemo(() => {
    let subtotal = Money.zero();
    let tax = Money.zero();
    for (const line of lines) {
      const net = Money.from(line.quantity || '0').times(line.unitPrice || '0');
      const rate = taxCodes.find((t) => t.id === line.taxCodeId)?.rate ?? '0';
      subtotal = subtotal.plus(net);
      tax = tax.plus(net.times(rate));
    }
    return { subtotal, tax, total: subtotal.plus(tax) };
  }, [lines, taxCodes]);

  const pdfDraft = useMemo(
    () =>
      composerDraft({
        kind: 'quotation',
        issueDate: quotationDate,
        party: { name: customers.find((c) => c.id === customerId)?.label ?? 'Customer' },
        notes: notes || null,
        currency,
        ...composerMoneyLines({ lines, items, taxCodes }),
      }),
    [customerId, customers, currency, items, lines, notes, quotationDate, taxCodes],
  );

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function onProductCreated(product: QuickProduct) {
    setItems((current) => [
      ...current,
      { id: product.id, label: product.label, description: product.description },
    ]);
  }

  function submit(send: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await saveQuotationAction({
        quotationId: quotationId ?? undefined,
        customerId,
        quotationDate,
        notes: notes || undefined,
        currencyCode: currency,
        send,
        lines: lines.map((line) => ({
          itemId: line.itemId || undefined,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxCodeId: line.taxCodeId || undefined,
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setQuotationId(result.data.quotationId);
      if (send) {
        router.push('/sales/estimates');
        router.refresh();
      }
    });
  }

  function convert() {
    if (!quotationId) {
      setError('Save the estimate first.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await convertQuotationAction({ quotationId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/sales/invoices/${result.data.invoiceId}`);
      router.refresh();
    });
  }

  return (
    <div className="stack">
      {error ? <Alert title="Could not save">{error}</Alert> : null}

      <DocumentBrand
        name={entity.tradingName || entity.name}
        registrationNumber={entity.registrationNumber}
        showRegistration
        logoSrc={entity.logoSrc}
      />

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
        <Field label="Estimate date" htmlFor="quotationDate" required>
          <input
            id="quotationDate"
            type="date"
            value={quotationDate}
            onChange={(e) => setQuotationDate(e.target.value)}
          />
        </Field>
      </div>

      <div className="button-row" style={{ justifyContent: 'space-between' }}>
        <span className="cell-muted">Line items</span>
        <QuickAddProductButton units={units} onCreated={onProductCreated} />
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Description</th>
              <th className="numeric">Qty</th>
              <th className="numeric">Unit price</th>
              <th>Tax</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
                <td>
                  <ItemPicker
                    items={items}
                    value={line.itemId}
                    onChange={(itemId) => {
                      const item = items.find((i) => i.id === itemId);
                      updateLine(line.key, {
                        itemId,
                        description: item?.description ?? line.description,
                      });
                    }}
                  />
                </td>
                <td>
                  <input
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                  />
                </td>
                <td className="numeric">
                  <input
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    inputMode="decimal"
                  />
                </td>
                <td className="numeric">
                  <input
                    value={line.unitPrice}
                    onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                    inputMode="decimal"
                  />
                </td>
                <td>
                  <select
                    value={line.taxCodeId}
                    onChange={(e) => updateLine(line.key, { taxCodeId: e.target.value })}
                  >
                    <option value="">No tax</option>
                    {taxCodes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => setLines((c) => c.filter((l) => l.key !== line.key))}
                    disabled={lines.length === 1}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="button-row">
        <button
          type="button"
          className="button button--ghost"
          onClick={() =>
            setLines((c) => [...c, { ...emptyLine(), taxCodeId: defaultTaxCodeId ?? '' }])
          }
        >
          Add line
        </button>
      </div>

      <Field label="Notes" htmlFor="notes">
        <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="invoice-totals">
        <div>
          <span>Total</span>
          <strong>{formatMoney(totals.total, { currency, showCurrency: true })}</strong>
        </div>
      </div>

      <div className="button-row">
        <PrintDocumentButton kind="quotation" savedId={quotationId} draft={pdfDraft} />
        <button type="button" className="button" disabled={pending} onClick={() => submit(false)}>
          <BusyLabel pending={pending} idle="Save draft" />
        </button>
        {canSend ? (
          <button
            type="button"
            className="button button--primary"
            disabled={pending}
            onClick={() => submit(true)}
          >
            <BusyLabel pending={pending} idle="Save and send" tone="inverse" />
          </button>
        ) : null}
        {quotationId ? (
          <button type="button" className="button" disabled={pending} onClick={convert}>
            <BusyLabel pending={pending} idle="Convert to invoice" />
          </button>
        ) : null}
      </div>
      <DocumentPoweredBy />
    </div>
  );
}
