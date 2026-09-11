'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui';
import { MenuButton, PageFeedback, SplitMenu } from '@/components/lists/list-chrome';
import { InventoryTabs } from '../inventory-tabs';
import { ProductsTable } from './products-table';
import { ProductDrawer, type AccountChoice, type CatalogueChoice } from './product-drawer';
import type { CatalogueRow } from '@/server/modules/inventory/lists';
import type { ProductItemType } from '@/lib/inventory-list';

export function ProductsWorkspace({
  rows,
  attention,
  currency,
  mayManage,
  mayAdjust,
  mayPurchase,
  mayManageSuppliers,
  canApproveSupplier,
  initialOpen,
  categories,
  manufacturers,
  units,
  suppliers,
  warehouses,
  accounts,
  defaults,
  currencies,
  paymentTerms,
  baseCurrency,
}: {
  rows: readonly CatalogueRow[];
  attention: { low: number; out: number };
  currency: string;
  mayManage: boolean;
  mayAdjust: boolean;
  mayPurchase: boolean;
  mayManageSuppliers: boolean;
  canApproveSupplier: boolean;
  initialOpen: ProductItemType | null;
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
  currencies: ReadonlyArray<{ code: string; name: string }>;
  paymentTerms: readonly CatalogueChoice[];
  baseCurrency: string;
}) {
  const [open, setOpen] = useState(initialOpen !== null);
  const [itemType, setItemType] = useState<ProductItemType>(initialOpen ?? 'INVENTORY');
  const [formKey, setFormKey] = useState(0);
  const [supplierChoices, setSupplierChoices] = useState<CatalogueChoice[]>([...suppliers]);
  const [manufacturerChoices, setManufacturerChoices] = useState<CatalogueChoice[]>([
    ...manufacturers,
  ]);

  useEffect(() => {
    setSupplierChoices([...suppliers]);
  }, [suppliers]);

  useEffect(() => {
    setManufacturerChoices([...manufacturers]);
  }, [manufacturers]);

  useEffect(() => {
    if (!initialOpen || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('new')) return;
    url.searchParams.delete('new');
    const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : '');
    window.history.replaceState(window.history.state, '', next);
  }, [initialOpen]);

  function openDrawer(type: ProductItemType) {
    setItemType(type);
    setFormKey((key) => key + 1);
    setOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Inventory"
        actions={
          <>
            <PageFeedback />
            <MenuButton
              label="More"
              items={[
                { label: 'Manage categories', href: '/inventory/categories' },
                { label: 'Manage warehouses', href: '/inventory/warehouses' },
                { label: 'Stock on hand', href: '/inventory/stock' },
                { label: 'Stock ledger', href: '/inventory/ledger' },
                { label: 'Import products', disabled: true },
              ]}
            />
            {mayManage ? (
              <SplitMenu
                label="New product/service"
                primary
                onClick={() => openDrawer('INVENTORY')}
                items={[
                  { label: 'Inventory item', onSelect: () => openDrawer('INVENTORY') },
                  { label: 'Non-inventory item', onSelect: () => openDrawer('NON_INVENTORY') },
                  { label: 'Service', onSelect: () => openDrawer('SERVICE') },
                  { label: 'Bundle', disabled: true },
                ]}
              />
            ) : null}
          </>
        }
      />
      <InventoryTabs active="products" />
      <ProductsTable
        rows={rows}
        attention={attention}
        currency={currency}
        mayManage={mayManage}
        mayAdjust={mayAdjust}
        mayPurchase={mayPurchase}
        onCreate={mayManage ? () => openDrawer('INVENTORY') : undefined}
      />
      {mayManage ? (
        <ProductDrawer
          open={open}
          itemType={itemType}
          onItemTypeChange={setItemType}
          onClose={() => setOpen(false)}
          formKey={formKey}
          categories={categories}
          manufacturers={manufacturerChoices}
          onManufacturersChange={setManufacturerChoices}
          units={units}
          suppliers={supplierChoices}
          onSuppliersChange={setSupplierChoices}
          warehouses={warehouses}
          accounts={accounts}
          defaults={defaults}
          currencies={currencies}
          paymentTerms={paymentTerms}
          baseCurrency={baseCurrency}
          mayAdjust={mayAdjust}
          mayManageSuppliers={mayManageSuppliers}
          canApproveSupplier={canApproveSupplier}
        />
      ) : null}
    </>
  );
}
