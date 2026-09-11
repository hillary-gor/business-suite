'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveItemAction } from '@/server/actions/inventory';
import { Alert, Field } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';

export type ItemType = 'INVENTORY' | 'NON_INVENTORY' | 'SERVICE';

export type ItemFormValues = {
  itemId?: string;
  description: string;
  partNumber: string;
  itemType: ItemType;
  categoryId: string;
  manufacturerId: string;
  uomCode: string;
  trackingMode: 'NONE' | 'LOT' | 'SERIAL';
  reorderPoint: string;
  reorderQuantity: string;
  salesDescription: string;
  purchaseDescription: string;
  salesPrice: string;
  purchaseCost: string;
  preferredSupplierId: string;
  isActive: boolean;
};

export function ItemForm({
  categories,
  manufacturers,
  units,
  suppliers,
  initial,
  defaultType = 'INVENTORY',
}: {
  categories: ReadonlyArray<{ id: string; label: string }>;
  manufacturers: ReadonlyArray<{ id: string; label: string }>;
  units: ReadonlyArray<{ code: string; name: string }>;
  suppliers: ReadonlyArray<{ id: string; label: string }>;
  initial?: ItemFormValues;
  defaultType?: ItemType;
}) {
  const router = useRouter();
  const [description, setDescription] = useState(initial?.description ?? '');
  const [partNumber, setPartNumber] = useState(initial?.partNumber ?? '');
  const [itemType, setItemType] = useState<ItemType>(initial?.itemType ?? defaultType);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [manufacturerId, setManufacturerId] = useState(initial?.manufacturerId ?? '');
  const [uomCode, setUomCode] = useState(
    initial?.uomCode ?? units.find((u) => u.code === 'EA')?.code ?? units[0]?.code ?? 'EA',
  );
  const [trackingMode, setTrackingMode] = useState<'NONE' | 'LOT' | 'SERIAL'>(
    initial?.trackingMode ?? (defaultType === 'INVENTORY' ? 'SERIAL' : 'NONE'),
  );
  const [reorderPoint, setReorderPoint] = useState(initial?.reorderPoint ?? '');
  const [reorderQuantity, setReorderQuantity] = useState(initial?.reorderQuantity ?? '');
  const [salesDescription, setSalesDescription] = useState(initial?.salesDescription ?? '');
  const [purchaseDescription, setPurchaseDescription] = useState(
    initial?.purchaseDescription ?? '',
  );
  const [salesPrice, setSalesPrice] = useState(initial?.salesPrice ?? '');
  const [purchaseCost, setPurchaseCost] = useState(initial?.purchaseCost ?? '');
  const [preferredSupplierId, setPreferredSupplierId] = useState(
    initial?.preferredSupplierId ?? '',
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onTypeChange(next: ItemType) {
    setItemType(next);
    if (next === 'INVENTORY') setTrackingMode('SERIAL');
    else setTrackingMode('NONE');
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveItemAction({
        itemId: initial?.itemId,
        description,
        partNumber: partNumber || undefined,
        itemType,
        categoryId: categoryId || undefined,
        manufacturerId: manufacturerId || undefined,
        uomCode,
        trackingMode: itemType === 'INVENTORY' ? trackingMode : 'NONE',
        reorderPoint: itemType === 'INVENTORY' && reorderPoint ? reorderPoint : undefined,
        reorderQuantity: itemType === 'INVENTORY' && reorderQuantity ? reorderQuantity : undefined,
        salesDescription: salesDescription || undefined,
        purchaseDescription: purchaseDescription || undefined,
        salesPrice: salesPrice || undefined,
        purchaseCost: purchaseCost || undefined,
        preferredSupplierId: preferredSupplierId || undefined,
        isActive,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/inventory/products');
      router.refresh();
    });
  }

  return (
    <div className="stack">
      {error ? <Alert title="Could not save product">{error}</Alert> : null}
      <div className="form-grid">
        <Field label="Name / description" htmlFor="description" required>
          <input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field
          label="Part number (SKU)"
          htmlFor="partNumber"
          hint="The stock-keeping unit used to find this item. Leave blank to generate one."
        >
          <input
            id="partNumber"
            value={partNumber}
            onChange={(e) => setPartNumber(e.target.value)}
          />
        </Field>
        <Field label="Type" htmlFor="itemType" hint="Matches QuickBooks Online product types">
          <select
            id="itemType"
            value={itemType}
            onChange={(e) => onTypeChange(e.target.value as ItemType)}
          >
            <option value="INVENTORY">Inventory</option>
            <option value="NON_INVENTORY">Non-inventory</option>
            <option value="SERVICE">Service</option>
          </select>
        </Field>
        <Field label="Unit of measure" htmlFor="uom">
          <select id="uom" value={uomCode} onChange={(e) => setUomCode(e.target.value)}>
            {units.map((u) => (
              <option key={u.code} value={u.code}>
                {u.code} — {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category" htmlFor="category">
          <select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Manufacturer" htmlFor="manufacturer">
          <select
            id="manufacturer"
            value={manufacturerId}
            onChange={(e) => setManufacturerId(e.target.value)}
          >
            <option value="">None</option>
            {manufacturers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Sales description"
          htmlFor="salesDescription"
          hint="What the customer reads on a quote or invoice"
        >
          <input
            id="salesDescription"
            value={salesDescription}
            onChange={(e) => setSalesDescription(e.target.value)}
          />
        </Field>
        <Field label="Price" htmlFor="salesPrice" hint="Default selling price">
          <input
            id="salesPrice"
            value={salesPrice}
            onChange={(e) => setSalesPrice(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field
          label="Purchase description"
          htmlFor="purchaseDescription"
          hint="What the supplier reads on a purchase order"
        >
          <input
            id="purchaseDescription"
            value={purchaseDescription}
            onChange={(e) => setPurchaseDescription(e.target.value)}
          />
        </Field>
        <Field label="Cost" htmlFor="purchaseCost" hint="What you expect to pay">
          <input
            id="purchaseCost"
            value={purchaseCost}
            onChange={(e) => setPurchaseCost(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label="Preferred supplier" htmlFor="preferredSupplier">
          <select
            id="preferredSupplier"
            value={preferredSupplierId}
            onChange={(e) => setPreferredSupplierId(e.target.value)}
          >
            <option value="">None</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        {itemType === 'INVENTORY' ? (
          <>
            <Field label="Tracking" htmlFor="tracking">
              <select
                id="tracking"
                value={trackingMode}
                onChange={(e) => setTrackingMode(e.target.value as typeof trackingMode)}
              >
                <option value="SERIAL">Serial</option>
                <option value="LOT">Lot</option>
                <option value="NONE">None (average cost)</option>
              </select>
            </Field>
            <Field
              label="Reorder point"
              htmlFor="reorderPoint"
              hint="Low-on-stock uses this quantity"
            >
              <input
                id="reorderPoint"
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Reorder quantity" htmlFor="reorderQuantity">
              <input
                id="reorderQuantity"
                value={reorderQuantity}
                onChange={(e) => setReorderQuantity(e.target.value)}
                inputMode="decimal"
              />
            </Field>
          </>
        ) : null}
        {initial ? (
          <Field label="Status" htmlFor="isActive">
            <select
              id="isActive"
              value={isActive ? 'ACTIVE' : 'INACTIVE'}
              onChange={(e) => setIsActive(e.target.value === 'ACTIVE')}
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </Field>
        ) : null}
      </div>
      <div className="button-row">
        <button
          type="button"
          className="button button--primary"
          disabled={pending}
          onClick={submit}
        >
          <BusyLabel
            pending={pending}
            idle={initial ? 'Save changes' : 'Save product'}
            tone="inverse"
          />
        </button>
      </div>
    </div>
  );
}
