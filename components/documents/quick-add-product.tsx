'use client';

import { useState, useTransition } from 'react';
import { saveItemAction } from '@/server/actions/inventory';
import { Alert, Field } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';

export interface QuickProduct {
  id: string;
  label: string;
  description: string;
  trackingMode: string;
  isStocked: boolean;
  partNumber: string;
}

export function QuickAddProductButton({
  units,
  onCreated,
}: {
  units: ReadonlyArray<{ code: string; name: string }>;
  onCreated: (product: QuickProduct) => void;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [itemType, setItemType] = useState<'INVENTORY' | 'NON_INVENTORY' | 'SERVICE'>('SERVICE');
  const [uomCode, setUomCode] = useState(units.find((u) => u.code === 'EA')?.code ?? 'EA');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveItemAction({
        description,
        partNumber: partNumber || undefined,
        itemType,
        uomCode,
        trackingMode: 'NONE',
        isSellable: true,
        isStocked: itemType === 'INVENTORY',
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const id = result.data.itemId;
      onCreated({
        id,
        label: `${partNumber || description} — ${description}`,
        description,
        trackingMode: itemType === 'INVENTORY' ? 'NONE' : 'NONE',
        isStocked: itemType === 'INVENTORY',
        partNumber: partNumber || description.slice(0, 24).toUpperCase(),
      });
      setOpen(false);
      setDescription('');
      setPartNumber('');
    });
  }

  return (
    <>
      <button type="button" className="button button--ghost button--small" onClick={() => setOpen(true)}>
        + Add product
      </button>
      {open ? (
        <>
          <button type="button" className="drawer-backdrop" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="modal" role="dialog" aria-label="Add product">
            <div className="drawer__header">
              <h2 className="drawer__title">Add product/service</h2>
              <button type="button" className="button button--ghost button--small" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <div className="stack">
              {error ? <Alert title="Could not save">{error}</Alert> : null}
              <Field label="Name" htmlFor="qp-name" required>
                <input id="qp-name" value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
              <Field label="SKU" htmlFor="qp-sku">
                <input id="qp-sku" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} />
              </Field>
              <Field label="Type" htmlFor="qp-type">
                <select
                  id="qp-type"
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value as typeof itemType)}
                >
                  <option value="SERVICE">Service</option>
                  <option value="NON_INVENTORY">Non-inventory</option>
                  <option value="INVENTORY">Inventory</option>
                </select>
              </Field>
              <Field label="UOM" htmlFor="qp-uom">
                <select id="qp-uom" value={uomCode} onChange={(e) => setUomCode(e.target.value)}>
                  {units.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.code}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="button-row">
                <button type="button" className="button button--primary" disabled={pending} onClick={submit}>
                  <BusyLabel pending={pending} idle="Save and use" tone="inverse" />
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
