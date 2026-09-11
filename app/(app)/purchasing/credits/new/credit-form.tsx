'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveCreditAction } from '@/server/actions/purchasing';
import { Money, formatMoney } from '@/lib/money';
import { Alert, Field } from '@/components/ui';
import { PrintDocumentButton } from '@/components/documents/document-pdf-preview';
import { composerDraft, composerMoneyLines } from '@/lib/documents/composer-draft';
import { ItemPicker } from '@/components/documents/item-picker';
import { BusyLabel } from '@/components/loading/dots-loader';

interface LineState {
  key: string;
  itemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxCodeId: string;
  expenseAccountId: string;
}

const emptyLine = (): LineState => ({
  key: crypto.randomUUID(),
  itemId: '',
  description: '',
  quantity: '1',
  unitPrice: '',
  taxCodeId: '',
  expenseAccountId: '',
});

export function CreditForm({
  suppliers,
  taxCodes,
  items,
  expenseAccounts,
  defaultTaxCodeId,
  baseCurrency,
}: {
  suppliers: ReadonlyArray<{ id: string; label: string; currencyCode: string }>;
  taxCodes: ReadonlyArray<{ id: string; label: string; rate: string }>;
  items: ReadonlyArray<{ id: string; label: string; description: string; partNumber?: string }>;
  expenseAccounts: ReadonlyArray<{ id: string; label: string }>;
  defaultTaxCodeId: string | null;
  baseCurrency: string;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [creditDate, setCreditDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineState[]>([
    { ...emptyLine(), taxCodeId: defaultTaxCodeId ?? '' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const currency = suppliers.find((s) => s.id === supplierId)?.currencyCode ?? baseCurrency;

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
        kind: 'supplier-credit',
        issueDate: creditDate,
        party: { name: suppliers.find((s) => s.id === supplierId)?.label ?? 'Supplier' },
        notes: notes || null,
        currency,
        ...composerMoneyLines({ lines, items, taxCodes }),
      }),
    [creditDate, currency, items, lines, notes, supplierId, suppliers, taxCodes],
  );

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveCreditAction({
        supplierId,
        creditDate,
        notes: notes || undefined,
        currencyCode: currency,
        post: true,
        idempotencyKey,
        lines: lines.map((line) => ({
          itemId: line.itemId || undefined,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxCodeId: line.taxCodeId || undefined,
          expenseAccountId: line.expenseAccountId || undefined,
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/purchasing');
      router.refresh();
    });
  }

  return (
    <div className="stack">
      {error ? <Alert title="Could not post credit">{error}</Alert> : null}

      <div className="form-grid">
        <Field label="Vendor" htmlFor="supplier" required>
          <select id="supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Credit date" htmlFor="creditDate" required>
          <input
            id="creditDate"
            type="date"
            value={creditDate}
            onChange={(e) => setCreditDate(e.target.value)}
          />
        </Field>
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
              <th>Expense account</th>
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
                  <select
                    value={line.expenseAccountId}
                    onChange={(e) => updateLine(line.key, { expenseAccountId: e.target.value })}
                  >
                    <option value="">Default expense</option>
                    {expenseAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
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
        <PrintDocumentButton kind="supplier-credit" draft={pdfDraft} />
        <button
          type="button"
          className="button button--primary"
          disabled={pending}
          onClick={submit}
        >
          <BusyLabel pending={pending} idle="Post supplier credit" tone="inverse" />
        </button>
      </div>
    </div>
  );
}
