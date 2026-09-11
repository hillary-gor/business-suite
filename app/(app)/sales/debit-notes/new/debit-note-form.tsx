'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveDebitNoteAction } from '@/server/actions/sales';
import { Money, formatMoney } from '@/lib/money';
import { Alert, Field } from '@/components/ui';
import { DocumentBrand, DocumentPoweredBy } from '@/components/documents/document-brand';
import { PrintDocumentButton } from '@/components/documents/document-pdf-preview';
import { composerDraft, composerMoneyLines } from '@/lib/documents/composer-draft';
import { BusyLabel } from '@/components/loading/dots-loader';

interface LineState {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxCodeId: string;
}

const emptyLine = (): LineState => ({
  key: crypto.randomUUID(),
  description: '',
  quantity: '1',
  unitPrice: '',
  taxCodeId: '',
});

export function DebitNoteForm({
  customers,
  taxCodes,
  defaultTaxCodeId,
  baseCurrency,
  entity,
}: {
  customers: ReadonlyArray<{ id: string; label: string; currencyCode: string }>;
  taxCodes: ReadonlyArray<{ id: string; label: string; rate: string }>;
  defaultTaxCodeId: string | null;
  baseCurrency: string;
  entity: {
    name: string;
    tradingName: string | null;
    registrationNumber: string | null;
    logoSrc: string;
  };
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [debitDate, setDebitDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineState[]>([
    { ...emptyLine(), taxCodeId: defaultTaxCodeId ?? '' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
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
    return { total: subtotal.plus(tax) };
  }, [lines, taxCodes]);

  const pdfDraft = useMemo(
    () =>
      composerDraft({
        kind: 'debit-note',
        issueDate: debitDate,
        party: { name: customers.find((c) => c.id === customerId)?.label ?? 'Customer' },
        notes: notes || null,
        currency,
        ...composerMoneyLines({ lines, taxCodes }),
      }),
    [customerId, customers, currency, debitDate, lines, notes, taxCodes],
  );

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveDebitNoteAction({
        customerId,
        debitDate,
        currencyCode: currency,
        notes: notes || undefined,
        post: true,
        idempotencyKey,
        lines: lines.map((line) => ({
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
      router.push('/sales/debit-notes');
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
        <Field label="Debit date" htmlFor="debitDate" required>
          <input
            id="debitDate"
            type="date"
            value={debitDate}
            onChange={(e) => setDebitDate(e.target.value)}
          />
        </Field>
      </div>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="numeric">Qty</th>
              <th className="numeric">Unit price</th>
              <th>Tax</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
                <td>
                  <input
                    value={line.description}
                    onChange={(e) =>
                      setLines((cur) =>
                        cur.map((l) =>
                          l.key === line.key ? { ...l, description: e.target.value } : l,
                        ),
                      )
                    }
                  />
                </td>
                <td className="numeric">
                  <input
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((cur) =>
                        cur.map((l) =>
                          l.key === line.key ? { ...l, quantity: e.target.value } : l,
                        ),
                      )
                    }
                  />
                </td>
                <td className="numeric">
                  <input
                    value={line.unitPrice}
                    onChange={(e) =>
                      setLines((cur) =>
                        cur.map((l) =>
                          l.key === line.key ? { ...l, unitPrice: e.target.value } : l,
                        ),
                      )
                    }
                  />
                </td>
                <td>
                  <select
                    value={line.taxCodeId}
                    onChange={(e) =>
                      setLines((cur) =>
                        cur.map((l) =>
                          l.key === line.key ? { ...l, taxCodeId: e.target.value } : l,
                        ),
                      )
                    }
                  >
                    <option value="">No tax</option>
                    {taxCodes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
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
            setLines((cur) => [...cur, { ...emptyLine(), taxCodeId: defaultTaxCodeId ?? '' }])
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
        <PrintDocumentButton kind="debit-note" draft={pdfDraft} />
        <button
          type="button"
          className="button button--primary"
          disabled={pending}
          onClick={submit}
        >
          <BusyLabel pending={pending} idle="Post debit note" tone="inverse" />
        </button>
      </div>
      <DocumentPoweredBy />
    </div>
  );
}
