'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveExpenseAction } from '@/server/actions/purchasing';
import { Money, formatMoney } from '@/lib/money';
import { Alert, Field } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';

interface LineState {
  key: string;
  description: string;
  amount: string;
  taxCodeId: string;
  expenseAccountId: string;
}

const emptyLine = (): LineState => ({
  key: crypto.randomUUID(),
  description: '',
  amount: '',
  taxCodeId: '',
  expenseAccountId: '',
});

export function ExpenseForm({
  suppliers,
  banks,
  taxCodes,
  expenseAccounts,
  defaultTaxCodeId,
  baseCurrency,
  defaultSupplierId,
}: {
  suppliers: ReadonlyArray<{ id: string; label: string; currencyCode: string }>;
  banks: ReadonlyArray<{ id: string; label: string }>;
  taxCodes: ReadonlyArray<{ id: string; label: string; rate: string }>;
  expenseAccounts: ReadonlyArray<{ id: string; label: string }>;
  defaultTaxCodeId: string | null;
  baseCurrency: string;
  defaultSupplierId?: string;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(defaultSupplierId || suppliers[0]?.id || '');
  const [bankAccountId, setBankAccountId] = useState(banks[0]?.id ?? '');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineState[]>([
    { ...emptyLine(), taxCodeId: defaultTaxCodeId ?? '' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const paymentIdempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const currency = suppliers.find((s) => s.id === supplierId)?.currencyCode ?? baseCurrency;

  const totals = useMemo(() => {
    let subtotal = Money.zero();
    let tax = Money.zero();
    for (const line of lines) {
      const net = Money.from(line.amount || '0');
      const rate = taxCodes.find((t) => t.id === line.taxCodeId)?.rate ?? '0';
      subtotal = subtotal.plus(net);
      tax = tax.plus(net.times(rate));
    }
    return { subtotal, tax, total: subtotal.plus(tax) };
  }, [lines, taxCodes]);

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveExpenseAction({
        supplierId,
        expenseDate,
        bankAccountId,
        currencyCode: currency,
        notes: notes || undefined,
        idempotencyKey,
        paymentIdempotencyKey,
        lines: lines.map((line) => ({
          description: line.description,
          amount: line.amount,
          taxCodeId: line.taxCodeId || undefined,
          expenseAccountId: line.expenseAccountId || undefined,
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/purchasing/expenses');
      router.refresh();
    });
  }

  return (
    <div className="stack">
      {error ? <Alert title="Could not post expense">{error}</Alert> : null}

      <div className="form-grid">
        <Field label="Payee" htmlFor="supplier" required>
          <select id="supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Payment account" htmlFor="bank" required>
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
        <Field label="Date" htmlFor="expenseDate" required>
          <input
            id="expenseDate"
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
          />
        </Field>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Description</th>
              <th className="numeric">Amount</th>
              <th>Tax</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
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
                  <input
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                  />
                </td>
                <td className="numeric">
                  <input
                    className="input-amount"
                    value={line.amount}
                    onChange={(e) => updateLine(line.key, { amount: e.target.value })}
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

      <Field label="Memo" htmlFor="notes">
        <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="invoice-totals">
        <div>
          <span>Total</span>
          <strong>{formatMoney(totals.total, { currency, showCurrency: true })}</strong>
        </div>
      </div>

      <div className="button-row">
        <button type="button" className="button button--primary" disabled={pending} onClick={submit}>
          <BusyLabel pending={pending} idle="Save and pay" tone="inverse" />
        </button>
      </div>
    </div>
  );
}
