'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { savePaymentAction } from '@/server/actions/purchasing';
import { Money, formatMoney } from '@/lib/money';
import { Alert, Field } from '@/components/ui';
import { PrintDocumentButton } from '@/components/documents/document-pdf-preview';
import { composerPaymentDraft } from '@/lib/documents/composer-draft';
import { BusyLabel } from '@/components/loading/dots-loader';

interface OpenBill {
  id: string;
  billNo: string;
  billDate: string;
  outstanding: string;
  currencyCode: string;
}

export function PaymentForm({
  suppliers,
  banks,
  loadOpenBills,
}: {
  suppliers: ReadonlyArray<{ id: string; label: string; currencyCode: string }>;
  banks: ReadonlyArray<{ id: string; label: string }>;
  loadOpenBills: (supplierId: string) => Promise<OpenBill[]>;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [bankAccountId, setBankAccountId] = useState(banks[0]?.id ?? '');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [openBills, setOpenBills] = useState<OpenBill[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supplierId) return;
      const rows = await loadOpenBills(supplierId);
      if (cancelled) return;
      setOpenBills(rows);
      setAllocations({});
      setAmount('');
    })();
    return () => {
      cancelled = true;
    };
  }, [supplierId, loadOpenBills]);

  const currency =
    suppliers.find((s) => s.id === supplierId)?.currencyCode ?? openBills[0]?.currencyCode ?? 'KES';

  const pdfDraft = useMemo(
    () =>
      composerPaymentDraft({
        kind: 'supplier-payment',
        issueDate: paymentDate,
        party: { name: suppliers.find((s) => s.id === supplierId)?.label ?? 'Supplier' },
        currency,
        amount: amount || '0',
        notes: memo || null,
        allocations: openBills
          .filter((bill) => allocations[bill.id])
          .map((bill) => ({
            description: bill.billNo,
            date: bill.billDate,
            amount: allocations[bill.id] ?? '0',
          })),
      }),
    [allocations, amount, memo, openBills, paymentDate, supplierId, suppliers, currency],
  );

  function allocateAll() {
    const next: Record<string, string> = {};
    let total = Money.zero();
    for (const bill of openBills) {
      next[bill.id] = bill.outstanding;
      total = total.plus(bill.outstanding);
    }
    setAllocations(next);
    setAmount(total.toDatabase());
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await savePaymentAction({
        supplierId,
        paymentDate,
        amount,
        bankAccountId,
        currencyCode: currency,
        memo: memo || undefined,
        post: true,
        idempotencyKey,
        allocations: Object.entries(allocations)
          .filter(([, value]) => value && Number(value) > 0)
          .map(([billId, value]) => ({ billId, amount: value })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/purchasing/bills');
      router.refresh();
    });
  }

  return (
    <div className="stack">
      {error ? <Alert title="Could not post payment">{error}</Alert> : null}

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
        <Field label="Pay from" htmlFor="bank" required>
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
        <Field label="Payment date" htmlFor="paymentDate" required>
          <input
            id="paymentDate"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
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

      <div className="button-row">
        <button
          type="button"
          className="button button--ghost"
          onClick={allocateAll}
          disabled={openBills.length === 0}
        >
          Allocate all open bills
        </button>
      </div>

      {openBills.length === 0 ? (
        <p className="cell-muted">No open posted bills for this vendor.</p>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Date</th>
                <th className="numeric">Outstanding</th>
                <th className="numeric">Allocate</th>
              </tr>
            </thead>
            <tbody>
              {openBills.map((bill) => (
                <tr key={bill.id}>
                  <td className="cell-code">{bill.billNo}</td>
                  <td>{bill.billDate}</td>
                  <td className="numeric">
                    {formatMoney(Money.from(bill.outstanding), {
                      currency: bill.currencyCode,
                      showCurrency: true,
                    })}
                  </td>
                  <td className="numeric">
                    <input
                      value={allocations[bill.id] ?? ''}
                      onChange={(e) =>
                        setAllocations((current) => ({
                          ...current,
                          [bill.id]: e.target.value,
                        }))
                      }
                      inputMode="decimal"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Field label="Memo" htmlFor="memo">
        <input id="memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
      </Field>

      <div className="button-row">
        <PrintDocumentButton kind="supplier-payment" draft={pdfDraft} />
        <button
          type="button"
          className="button button--primary"
          disabled={pending}
          onClick={submit}
        >
          <BusyLabel pending={pending} idle="Pay bills" tone="inverse" />
        </button>
      </div>
    </div>
  );
}
