'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveAdjustmentAction } from '@/server/actions/inventory';
import { Money } from '@/lib/money';
import { Alert, Field } from '@/components/ui';
import { PrintDocumentButton } from '@/components/documents/document-pdf-preview';
import { composerDraft } from '@/lib/documents/composer-draft';
import { ItemPicker } from '@/components/documents/item-picker';
import { BusyLabel } from '@/components/loading/dots-loader';
import {
  ADJUSTMENT_REASON_LABELS,
  ADJUSTMENT_REASONS,
  type AdjustmentReason,
} from '@/lib/inventory-list';

export function AdjustmentForm({
  items,
  warehouses,
  stockUnits,
  stockLots,
  accounts,
  defaultItemId,
}: {
  items: ReadonlyArray<{
    id: string;
    label: string;
    trackingMode: string;
    partNumber?: string;
  }>;
  warehouses: ReadonlyArray<{ id: string; label: string }>;
  stockUnits: ReadonlyArray<{ id: string; itemId: string; label: string; warehouseId: string }>;
  stockLots: ReadonlyArray<{
    id: string;
    itemId: string;
    label: string;
    warehouseId: string | null;
  }>;
  accounts: ReadonlyArray<{ id: string; label: string }>;
  defaultItemId?: string;
}) {
  const router = useRouter();
  const [itemId, setItemId] = useState(
    items.find((i) => i.id === defaultItemId)?.id ?? items[0]?.id ?? '',
  );
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState<AdjustmentReason>('SHRINKAGE');
  const [accountId, setAccountId] = useState('');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [quantity, setQuantity] = useState('1');
  const [unitCostBase, setUnitCostBase] = useState('');
  const [stockUnitId, setStockUnitId] = useState('');
  const [stockLotId, setStockLotId] = useState('');
  const [movementDate, setMovementDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const item = items.find((i) => i.id === itemId);
  const trackingMode = item?.trackingMode ?? 'NONE';

  const unitsForItem = useMemo(
    () =>
      stockUnits.filter(
        (u) => u.itemId === itemId && (!warehouseId || u.warehouseId === warehouseId),
      ),
    [stockUnits, itemId, warehouseId],
  );

  const lotsForItem = useMemo(
    () =>
      stockLots.filter(
        (l) =>
          l.itemId === itemId && (!warehouseId || !l.warehouseId || l.warehouseId === warehouseId),
      ),
    [stockLots, itemId, warehouseId],
  );

  const pdfDraft = useMemo(() => {
    const qty = quantity || '0';
    const cost = unitCostBase || '0';
    const value = Money.from(cost).times(qty);
    const warehouse = warehouses.find((w) => w.id === warehouseId)?.label ?? 'Warehouse';
    return composerDraft({
      kind: 'inventory-adjustment',
      issueDate: movementDate,
      party: { name: warehouse },
      meta: [
        { label: 'Reason', value: ADJUSTMENT_REASON_LABELS[reason] },
        { label: 'Direction', value: direction },
      ],
      notes: notes || null,
      currency: 'KES',
      lines: [
        {
          description: item?.label ?? 'Item',
          sku: item?.partNumber ?? null,
          quantity: direction === 'OUT' ? `-${qty}` : qty,
          unitPrice: cost,
          amount: value.toDatabase(),
          extra: warehouse,
        },
      ],
      subtotal: value.toDatabase(),
      tax: '0',
      total: value.toDatabase(),
    });
  }, [
    direction,
    item,
    movementDate,
    notes,
    quantity,
    reason,
    unitCostBase,
    warehouseId,
    warehouses,
  ]);

  function onItemChange(next: string) {
    setItemId(next);
    setStockUnitId('');
    setStockLotId('');
    const nextItem = items.find((i) => i.id === next);
    if (nextItem?.trackingMode === 'SERIAL') setQuantity('1');
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveAdjustmentAction({
        itemId,
        warehouseId,
        direction,
        quantity,
        reference: reference || undefined,
        reason,
        adjustmentAccountId: accountId || undefined,
        unitCostBase: direction === 'IN' ? unitCostBase || undefined : undefined,
        stockUnitId: stockUnitId || undefined,
        stockLotId: stockLotId || undefined,
        movementDate,
        notes: notes || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/inventory/adjustments');
      router.refresh();
    });
  }

  return (
    <div className="stack">
      {error ? <Alert title="Could not post adjustment">{error}</Alert> : null}

      <div className="form-grid">
        <Field label="Product" htmlFor="item" required>
          <ItemPicker
            id="item"
            items={items}
            value={itemId}
            onChange={onItemChange}
            allowEmpty={false}
          />
        </Field>

        <Field label="Warehouse" htmlFor="warehouse" required>
          <select
            id="warehouse"
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setStockUnitId('');
              setStockLotId('');
            }}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Direction" htmlFor="direction" required>
          <select
            id="direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'IN' | 'OUT')}
          >
            <option value="IN">Increase (adjustment in)</option>
            <option value="OUT">Decrease (adjustment out)</option>
          </select>
        </Field>

        <Field label="Quantity" htmlFor="quantity" required>
          <input
            id="quantity"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={trackingMode === 'SERIAL'}
          />
        </Field>

        {direction === 'IN' ? (
          <Field
            label="Unit cost (base)"
            htmlFor="unitCost"
            required
            hint="Required for inbound adjustments so inventory value stays correct"
          >
            <input
              id="unitCost"
              inputMode="decimal"
              value={unitCostBase}
              onChange={(e) => setUnitCostBase(e.target.value)}
            />
          </Field>
        ) : null}

        <Field label="Date" htmlFor="movementDate">
          <input
            id="movementDate"
            type="date"
            value={movementDate}
            onChange={(e) => setMovementDate(e.target.value)}
          />
        </Field>

        <Field label="Reference" htmlFor="reference" hint="Leave blank and one is numbered for you">
          <input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>

        <Field label="Adjustment reason" htmlFor="reason" required>
          <select
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as AdjustmentReason)}
          >
            {ADJUSTMENT_REASONS.map((value) => (
              <option key={value} value={value}>
                {ADJUSTMENT_REASON_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Adjustment account"
          htmlFor="account"
          hint="Where the value lands. Defaults to the inventory adjustment account."
        >
          <select id="account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Default inventory adjustment account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </select>
        </Field>

        {trackingMode === 'SERIAL' ? (
          <Field
            label="Serial unit"
            htmlFor="stockUnit"
            hint={direction === 'OUT' ? 'Required when adjusting a serialised part out' : undefined}
          >
            <select
              id="stockUnit"
              value={stockUnitId}
              onChange={(e) => setStockUnitId(e.target.value)}
            >
              <option value="">Select serial…</option>
              {unitsForItem.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {trackingMode === 'LOT' ? (
          <Field label="Lot" htmlFor="stockLot">
            <select
              id="stockLot"
              value={stockLotId}
              onChange={(e) => setStockLotId(e.target.value)}
            >
              <option value="">Select lot…</option>
              {lotsForItem.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Notes" htmlFor="notes">
          <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      <div className="button-row">
        <PrintDocumentButton kind="inventory-adjustment" draft={pdfDraft} />
        <button
          type="button"
          className="button button--primary"
          disabled={pending}
          onClick={submit}
        >
          <BusyLabel pending={pending} idle="Post adjustment" tone="inverse" />
        </button>
      </div>
    </div>
  );
}
