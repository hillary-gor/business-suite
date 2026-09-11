'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveTransferAction } from '@/server/actions/inventory';
import { Money } from '@/lib/money';
import { Alert, Field } from '@/components/ui';
import { PrintDocumentButton } from '@/components/documents/document-pdf-preview';
import { composerDraft } from '@/lib/documents/composer-draft';
import { ItemPicker } from '@/components/documents/item-picker';
import { BusyLabel } from '@/components/loading/dots-loader';

export function TransferForm({
  items,
  warehouses,
  stockUnits,
  stockLots,
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
}) {
  const router = useRouter();
  const [itemId, setItemId] = useState(items[0]?.id ?? '');
  const [fromWarehouseId, setFromWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [toWarehouseId, setToWarehouseId] = useState(warehouses[1]?.id ?? warehouses[0]?.id ?? '');
  const [quantity, setQuantity] = useState('1');
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
        (u) => u.itemId === itemId && (!fromWarehouseId || u.warehouseId === fromWarehouseId),
      ),
    [stockUnits, itemId, fromWarehouseId],
  );

  const lotsForItem = useMemo(
    () =>
      stockLots.filter(
        (l) =>
          l.itemId === itemId &&
          (!fromWarehouseId || !l.warehouseId || l.warehouseId === fromWarehouseId),
      ),
    [stockLots, itemId, fromWarehouseId],
  );

  const pdfDraft = useMemo(() => {
    const from = warehouses.find((w) => w.id === fromWarehouseId)?.label ?? 'From';
    const to = warehouses.find((w) => w.id === toWarehouseId)?.label ?? 'To';
    return composerDraft({
      kind: 'stock-transfer',
      issueDate: movementDate,
      party: { name: from },
      meta: [
        { label: 'From', value: from },
        { label: 'To', value: to },
      ],
      notes: notes || null,
      currency: 'KES',
      lines: [
        {
          description: item?.label ?? 'Item',
          sku: item?.partNumber ?? null,
          quantity: quantity || '0',
          unitPrice: '0',
          amount: Money.zero().toDatabase(),
          extra: `${from} to ${to}`,
        },
      ],
      subtotal: '0',
      tax: '0',
      total: '0',
    });
  }, [fromWarehouseId, item, movementDate, notes, quantity, toWarehouseId, warehouses]);

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
      const result = await saveTransferAction({
        itemId,
        fromWarehouseId,
        toWarehouseId,
        quantity,
        stockUnitId: stockUnitId || undefined,
        stockLotId: stockLotId || undefined,
        movementDate,
        notes: notes || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/inventory/ledger');
      router.refresh();
    });
  }

  return (
    <div className="stack">
      {error ? <Alert title="Could not post transfer">{error}</Alert> : null}

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

        <Field label="From warehouse" htmlFor="fromWarehouse" required>
          <select
            id="fromWarehouse"
            value={fromWarehouseId}
            onChange={(e) => {
              setFromWarehouseId(e.target.value);
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

        <Field label="To warehouse" htmlFor="toWarehouse" required>
          <select
            id="toWarehouse"
            value={toWarehouseId}
            onChange={(e) => setToWarehouseId(e.target.value)}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
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

        <Field label="Date" htmlFor="movementDate">
          <input
            id="movementDate"
            type="date"
            value={movementDate}
            onChange={(e) => setMovementDate(e.target.value)}
          />
        </Field>

        {trackingMode === 'SERIAL' ? (
          <Field label="Serial unit" htmlFor="stockUnit" required>
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
        <PrintDocumentButton kind="stock-transfer" draft={pdfDraft} />
        <button
          type="button"
          className="button button--primary"
          disabled={pending}
          onClick={submit}
        >
          <BusyLabel pending={pending} idle="Post transfer" tone="inverse" />
        </button>
      </div>
    </div>
  );
}
