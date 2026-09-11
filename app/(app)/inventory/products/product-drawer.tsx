'use client';

import { useEffect, useId, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { saveItemAction } from '@/server/actions/inventory';
import { Alert, Field } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';
import { VendorForm } from '@/app/(app)/purchasing/vendors/new/vendor-form';
import { ManufacturerForm } from '@/app/(app)/inventory/manufacturers/manufacturer-form';
import { nairobiToday } from '@/lib/payables';
import type { ProductItemType } from '@/lib/inventory-list';

export type CatalogueChoice = { id: string; label: string };
export type AccountChoice = { id: string; label: string; accountType: string };

const ADD_SUPPLIER = '__add__';
const ADD_MANUFACTURER = '__add__';
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
const IMAGE_MAX_BYTES = 1_048_576;

type NestedPanel = 'supplier' | 'manufacturer' | null;
type ImagePayload = { mimeType: (typeof IMAGE_TYPES)[number]; base64: string };

export function ProductDrawer({
  open,
  itemType,
  onItemTypeChange,
  onClose,
  categories,
  manufacturers,
  onManufacturersChange,
  units,
  suppliers,
  onSuppliersChange,
  warehouses,
  accounts,
  defaults,
  currencies,
  paymentTerms,
  baseCurrency,
  formKey,
  mayAdjust,
  mayManageSuppliers,
  canApproveSupplier,
}: {
  open: boolean;
  itemType: ProductItemType;
  onItemTypeChange: (type: ProductItemType) => void;
  onClose: () => void;
  categories: readonly CatalogueChoice[];
  manufacturers: readonly CatalogueChoice[];
  onManufacturersChange: (next: CatalogueChoice[]) => void;
  units: ReadonlyArray<{ code: string; name: string }>;
  suppliers: readonly CatalogueChoice[];
  onSuppliersChange: (next: CatalogueChoice[]) => void;
  warehouses: readonly CatalogueChoice[];
  accounts: readonly AccountChoice[];
  defaults: {
    inventoryAccountId: string;
    cogsAccountId: string;
    revenueAccountId: string;
  };
  currencies: ReadonlyArray<{ code: string; name: string }>;
  paymentTerms: readonly CatalogueChoice[];
  baseCurrency: string;
  formKey: number;
  mayAdjust: boolean;
  mayManageSuppliers: boolean;
  canApproveSupplier: boolean;
}) {
  const [nested, setNested] = useState<NestedPanel>(null);
  const [supplierFormKey, setSupplierFormKey] = useState(0);
  const [manufacturerFormKey, setManufacturerFormKey] = useState(0);
  const [createdSupplierId, setCreatedSupplierId] = useState<string | null>(null);
  const [createdManufacturerId, setCreatedManufacturerId] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setNested(null);
    setCreatedSupplierId(null);
    setCreatedManufacturerId(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (nested) {
        setNested(null);
        return;
      }
      onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, nested, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="drawer-backdrop"
        aria-label="Close"
        onClick={() => {
          if (nested) {
            setNested(null);
            return;
          }
          onClose();
        }}
      />
      <aside
        className="drawer drawer--wide product-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Add a new product"
        inert={nested !== null}
      >
        <ProductDrawerForm
          key={formKey}
          itemType={itemType}
          onItemTypeChange={onItemTypeChange}
          onClose={onClose}
          onAddSupplier={() => {
            setSupplierFormKey((key) => key + 1);
            setNested('supplier');
          }}
          onAddManufacturer={() => {
            setManufacturerFormKey((key) => key + 1);
            setNested('manufacturer');
          }}
          createdSupplierId={createdSupplierId}
          createdManufacturerId={createdManufacturerId}
          categories={categories}
          manufacturers={manufacturers}
          units={units}
          suppliers={suppliers}
          warehouses={warehouses}
          accounts={accounts}
          defaults={defaults}
          mayAdjust={mayAdjust}
          mayManageSuppliers={mayManageSuppliers}
        />
      </aside>
      {nested === 'supplier' ? (
        <NestedDrawer title="Add supplier" onClose={() => setNested(null)}>
          <VendorForm
            key={supplierFormKey}
            currencies={currencies}
            paymentTerms={paymentTerms}
            baseCurrency={baseCurrency}
            canApprove={canApproveSupplier}
            submitLabel="Save and use"
            onSaved={(result) => {
              onSuppliersChange([
                { id: result.supplierId, label: result.legalName },
                ...suppliers.filter((supplier) => supplier.id !== result.supplierId),
              ]);
              setCreatedSupplierId(result.supplierId);
              setNested(null);
            }}
          />
        </NestedDrawer>
      ) : null}
      {nested === 'manufacturer' ? (
        <NestedDrawer title="Add manufacturer" onClose={() => setNested(null)}>
          <ManufacturerForm
            key={manufacturerFormKey}
            submitLabel="Save and use"
            onSaved={(result) => {
              onManufacturersChange([
                { id: result.manufacturerId, label: result.name },
                ...manufacturers.filter(
                  (manufacturer) => manufacturer.id !== result.manufacturerId,
                ),
              ]);
              setCreatedManufacturerId(result.manufacturerId);
              setNested(null);
            }}
          />
        </NestedDrawer>
      ) : null}
    </>
  );
}

function NestedDrawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        className="drawer-backdrop drawer-backdrop--nested"
        aria-label={`Close ${title.toLowerCase()}`}
        onClick={onClose}
      />
      <aside className="drawer drawer--nested" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer__header">
          <h2 className="drawer__title">{title}</h2>
          <button
            type="button"
            className="customise__close"
            aria-label={`Close ${title.toLowerCase()}`}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="drawer__body">{children}</div>
      </aside>
    </>
  );
}

function ProductSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const panelId = useId();

  return (
    <section className="product-drawer__section">
      <button
        type="button"
        className="product-drawer__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
        <span className="product-drawer__chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      <div id={panelId} hidden={!open} className="product-drawer__fields">
        {children}
      </div>
    </section>
  );
}

function ProductDrawerForm({
  itemType,
  onItemTypeChange,
  onClose,
  onAddSupplier,
  onAddManufacturer,
  createdSupplierId,
  createdManufacturerId,
  categories,
  manufacturers,
  units,
  suppliers,
  warehouses,
  accounts,
  defaults,
  mayAdjust,
  mayManageSuppliers,
}: {
  itemType: ProductItemType;
  onItemTypeChange: (type: ProductItemType) => void;
  onClose: () => void;
  onAddSupplier: () => void;
  onAddManufacturer: () => void;
  createdSupplierId: string | null;
  createdManufacturerId: string | null;
  categories: readonly CatalogueChoice[];
  manufacturers: readonly CatalogueChoice[];
  units: ReadonlyArray<{ code: string; name: string }>;
  suppliers: readonly CatalogueChoice[];
  warehouses: readonly CatalogueChoice[];
  accounts: readonly AccountChoice[];
  defaults: {
    inventoryAccountId: string;
    cogsAccountId: string;
    revenueAccountId: string;
  };
  mayAdjust: boolean;
  mayManageSuppliers: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const isInventory = itemType === 'INVENTORY';
  const isService = itemType === 'SERVICE';
  const assetAccounts = accounts.filter((account) => account.accountType === 'ASSET');
  const incomeAccounts = accounts.filter((account) => account.accountType === 'REVENUE');
  const expenseAccounts = accounts.filter((account) => account.accountType === 'EXPENSE');

  const [name, setName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [manufacturerId, setManufacturerId] = useState('');
  const [manufacturerPartNumber, setManufacturerPartNumber] = useState('');
  const [uomCode, setUomCode] = useState(
    units.find((unit) => unit.code === 'EA')?.code ?? units[0]?.code ?? 'EA',
  );
  const [openingQuantity, setOpeningQuantity] = useState('0');
  const [openingDate, setOpeningDate] = useState(nairobiToday());
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [trackingMode, setTrackingMode] = useState<'NONE' | 'LOT' | 'SERIAL'>('NONE');
  const [reorderPoint, setReorderPoint] = useState('');
  const [reorderQuantity, setReorderQuantity] = useState('');
  const [inventoryAccountId, setInventoryAccountId] = useState(defaults.inventoryAccountId);
  const [salesDescription, setSalesDescription] = useState('');
  const [salesPrice, setSalesPrice] = useState('');
  const [incomeAccountId, setIncomeAccountId] = useState(defaults.revenueAccountId);
  const [purchaseDescription, setPurchaseDescription] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [preferredSupplierId, setPreferredSupplierId] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState(defaults.cogsAccountId);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imagePayload, setImagePayload] = useState<ImagePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (createdSupplierId) setPreferredSupplierId(createdSupplierId);
  }, [createdSupplierId]);

  useEffect(() => {
    if (createdManufacturerId) setManufacturerId(createdManufacturerId);
  }, [createdManufacturerId]);

  function onImageFile(file: File | undefined) {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type as ImagePayload['mimeType'])) {
      setError('Choose a PNG, JPEG, WebP or GIF image.');
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setError('Product image must be 1 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      setImagePreview(result);
      setImagePayload({
        mimeType: file.type as ImagePayload['mimeType'],
        base64: comma >= 0 ? result.slice(comma + 1) : result,
      });
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  function submit() {
    setError(null);
    setFields({});
    startTransition(async () => {
      const result = await saveItemAction({
        description: name,
        partNumber: partNumber || undefined,
        itemType,
        categoryId: categoryId || undefined,
        manufacturerId: manufacturerId || undefined,
        manufacturerPartNumber: manufacturerPartNumber || undefined,
        uomCode,
        trackingMode: isInventory ? trackingMode : 'NONE',
        reorderPoint: isInventory && reorderPoint ? reorderPoint : undefined,
        reorderQuantity: isInventory && reorderQuantity ? reorderQuantity : undefined,
        inventoryAccountId: isInventory && inventoryAccountId ? inventoryAccountId : undefined,
        revenueAccountId: incomeAccountId || undefined,
        cogsAccountId: !isService && expenseAccountId ? expenseAccountId : undefined,
        salesDescription: salesDescription || undefined,
        purchaseDescription: purchaseDescription || undefined,
        salesPrice: salesPrice || undefined,
        purchaseCost: purchaseCost || undefined,
        preferredSupplierId: preferredSupplierId || undefined,
        image: imagePayload ?? undefined,
        warehouseId:
          isInventory && Number(openingQuantity) > 0 && warehouseId ? warehouseId : undefined,
        openingQuantity: isInventory && Number(openingQuantity) > 0 ? openingQuantity : undefined,
        openingDate:
          isInventory && Number(openingQuantity) > 0 ? openingDate || undefined : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        setFields(result.fields ?? {});
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <>
      <div className="drawer__header">
        <h2 className="drawer__title">Add a new product</h2>
        <button type="button" className="customise__close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="drawer__body">
        {error ? <Alert title="Could not save product">{error}</Alert> : null}

        <ProductSection title="Basic info">
          <Field label="Name" htmlFor={`${formId}-name`} required error={fields.description}>
            <input
              id={`${formId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Item type" htmlFor={`${formId}-type`}>
            <select
              id={`${formId}-type`}
              value={itemType}
              onChange={(event) => onItemTypeChange(event.target.value as ProductItemType)}
            >
              <option value="INVENTORY">Inventory item</option>
              <option value="NON_INVENTORY">Non-inventory</option>
              <option value="SERVICE">Service</option>
            </select>
          </Field>
          <div className={`product-image${imagePreview ? ' product-image--set' : ''}`}>
            {imagePreview ? (
              // Preview is a local data URL chosen in this session, not a remote asset.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="" className="product-image__preview" />
            ) : (
              <span className="product-image__frame" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <rect
                    x="3"
                    y="5"
                    width="18"
                    height="14"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path d="m5 16 4-4 3 3 3-3 4 4" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </span>
            )}
            <div>
              <p className="product-image__label">
                {imagePreview ? 'Product image' : 'Add an image'}
              </p>
              <p className="field__hint">PNG, JPEG, WebP or GIF up to 1 MB.</p>
              <div className="button-row">
                <label className="button button--small">
                  {imagePreview ? 'Replace' : 'Upload'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    hidden
                    onChange={(event) => {
                      onImageFile(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </label>
                {imagePreview ? (
                  <button
                    type="button"
                    className="button button--small button--ghost"
                    onClick={() => {
                      setImagePreview(null);
                      setImagePayload(null);
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <Field
            label="Part number (SKU)"
            htmlFor={`${formId}-sku`}
            error={fields.partNumber}
            hint="The stock-keeping unit used to find this item. Leave blank to generate one."
          >
            <input
              id={`${formId}-sku`}
              value={partNumber}
              onChange={(event) => setPartNumber(event.target.value)}
            />
          </Field>
          <Field label="Category" htmlFor={`${formId}-category`}>
            <select
              id={`${formId}-category`}
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">None</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Manufacturer" htmlFor={`${formId}-manufacturer`}>
            <select
              id={`${formId}-manufacturer`}
              value={manufacturerId}
              onChange={(event) => {
                if (event.target.value === ADD_MANUFACTURER) {
                  onAddManufacturer();
                  return;
                }
                setManufacturerId(event.target.value);
              }}
            >
              <option value={ADD_MANUFACTURER}>Add manufacturer</option>
              <option value="">None</option>
              {manufacturers.map((manufacturer) => (
                <option key={manufacturer.id} value={manufacturer.id}>
                  {manufacturer.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Manufacturer part number"
            htmlFor={`${formId}-mpn`}
            hint="The OEM number customers and suppliers quote"
          >
            <input
              id={`${formId}-mpn`}
              value={manufacturerPartNumber}
              onChange={(event) => setManufacturerPartNumber(event.target.value)}
            />
          </Field>
          <Field label="Unit of measure" htmlFor={`${formId}-uom`}>
            <select
              id={`${formId}-uom`}
              value={uomCode}
              onChange={(event) => setUomCode(event.target.value)}
            >
              {units.map((unit) => (
                <option key={unit.code} value={unit.code}>
                  {unit.code} — {unit.name}
                </option>
              ))}
            </select>
          </Field>
        </ProductSection>

        {isInventory ? (
          <ProductSection title="Inventory info">
            <Field
              label="Initial quantity on hand"
              htmlFor={`${formId}-qty`}
              required
              error={fields.openingQuantity}
              hint={
                mayAdjust
                  ? trackingMode === 'NONE'
                    ? undefined
                    : 'Opening quantity needs average-cost tracking. Receive serial or lot stock on a goods receipt.'
                  : 'Opening quantity requires permission to adjust stock.'
              }
            >
              <input
                id={`${formId}-qty`}
                value={openingQuantity}
                onChange={(event) => setOpeningQuantity(event.target.value)}
                inputMode="decimal"
                disabled={!mayAdjust || trackingMode !== 'NONE'}
              />
            </Field>
            <Field
              label="As of date"
              htmlFor={`${formId}-asof`}
              required
              error={fields.openingDate}
              hint="What's the as of date? The day this quantity was on the shelf. Opening stock posts on that date."
            >
              <input
                id={`${formId}-asof`}
                type="date"
                value={openingDate}
                onChange={(event) => setOpeningDate(event.target.value)}
              />
            </Field>
            <Field
              label="Warehouse"
              htmlFor={`${formId}-warehouse`}
              required={Number(openingQuantity) > 0}
              error={fields.warehouseId}
            >
              <select
                id={`${formId}-warehouse`}
                value={warehouseId}
                onChange={(event) => setWarehouseId(event.target.value)}
              >
                {warehouses.length === 0 ? <option value="">No warehouse</option> : null}
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tracking" htmlFor={`${formId}-tracking`} error={fields.trackingMode}>
              <select
                id={`${formId}-tracking`}
                value={trackingMode}
                onChange={(event) => {
                  const next = event.target.value as typeof trackingMode;
                  setTrackingMode(next);
                  if (next !== 'NONE') setOpeningQuantity('0');
                }}
              >
                <option value="NONE">None (average cost)</option>
                <option value="SERIAL">Serial</option>
                <option value="LOT">Lot</option>
              </select>
            </Field>
            <Field
              label="Reorder point"
              htmlFor={`${formId}-reorder`}
              hint="What's the reorder point? Low-on-stock uses this quantity."
            >
              <input
                id={`${formId}-reorder`}
                value={reorderPoint}
                onChange={(event) => setReorderPoint(event.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Reorder quantity" htmlFor={`${formId}-reorder-qty`}>
              <input
                id={`${formId}-reorder-qty`}
                value={reorderQuantity}
                onChange={(event) => setReorderQuantity(event.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field
              label="Inventory asset account"
              htmlFor={`${formId}-asset`}
              required
              error={fields.inventoryAccountId}
            >
              <select
                id={`${formId}-asset`}
                value={inventoryAccountId}
                onChange={(event) => setInventoryAccountId(event.target.value)}
              >
                <option value="">Select an account</option>
                {(assetAccounts.length > 0 ? assetAccounts : accounts).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </select>
            </Field>
          </ProductSection>
        ) : null}

        <ProductSection title="Sales">
          <Field
            label="Description"
            htmlFor={`${formId}-sales-desc`}
            hint="What the customer reads on a quote or invoice"
          >
            <textarea
              id={`${formId}-sales-desc`}
              rows={3}
              value={salesDescription}
              onChange={(event) => setSalesDescription(event.target.value)}
            />
          </Field>
          <Field label="Price/rate" htmlFor={`${formId}-price`}>
            <input
              id={`${formId}-price`}
              value={salesPrice}
              onChange={(event) => setSalesPrice(event.target.value)}
              inputMode="decimal"
            />
          </Field>
          <Field
            label="Income account"
            htmlFor={`${formId}-income`}
            required
            error={fields.revenueAccountId}
          >
            <select
              id={`${formId}-income`}
              value={incomeAccountId}
              onChange={(event) => setIncomeAccountId(event.target.value)}
            >
              <option value="">Select an account</option>
              {(incomeAccounts.length > 0 ? incomeAccounts : accounts).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </select>
          </Field>
        </ProductSection>

        {!isService ? (
          <ProductSection title="Purchasing">
            <Field
              label="Purchase description"
              htmlFor={`${formId}-purch-desc`}
              hint="What the supplier reads on a purchase order"
            >
              <textarea
                id={`${formId}-purch-desc`}
                rows={3}
                value={purchaseDescription}
                onChange={(event) => setPurchaseDescription(event.target.value)}
              />
            </Field>
            <Field
              label="Purchase cost"
              htmlFor={`${formId}-cost`}
              error={fields.purchaseCost}
              hint={
                isInventory && Number(openingQuantity) > 0
                  ? 'Used as the unit cost of the opening quantity'
                  : 'What you expect to pay'
              }
            >
              <input
                id={`${formId}-cost`}
                value={purchaseCost}
                onChange={(event) => setPurchaseCost(event.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Preferred supplier" htmlFor={`${formId}-supplier`}>
              <select
                id={`${formId}-supplier`}
                value={preferredSupplierId}
                onChange={(event) => {
                  if (event.target.value === ADD_SUPPLIER) {
                    onAddSupplier();
                    return;
                  }
                  setPreferredSupplierId(event.target.value);
                }}
              >
                {mayManageSuppliers ? <option value={ADD_SUPPLIER}>Add supplier</option> : null}
                <option value="">Select a preferred supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Expense account"
              htmlFor={`${formId}-expense`}
              required
              error={fields.cogsAccountId}
            >
              <select
                id={`${formId}-expense`}
                value={expenseAccountId}
                onChange={(event) => setExpenseAccountId(event.target.value)}
              >
                <option value="">Select an account</option>
                {(expenseAccounts.length > 0 ? expenseAccounts : accounts).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </select>
            </Field>
          </ProductSection>
        ) : null}
      </div>
      <div className="drawer__footer">
        <button type="button" className="button" onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={pending}
          onClick={submit}
        >
          <BusyLabel pending={pending} idle="Save and close" tone="inverse" />
        </button>
      </div>
    </>
  );
}
