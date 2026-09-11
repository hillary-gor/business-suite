import { Permission } from '@/server/auth/permissions';
import { can, requireSession, resolveEntity } from '@/server/auth/session';
import { PermissionDeniedError } from '@/server/db/errors';
import { listAccounts } from '@/server/modules/accounting/queries';
import { listCatalogue } from '@/server/modules/inventory/lists';
import {
  listCurrencies,
  listItemAccountDefaults,
  listItemCategories,
  listManufacturers,
  listPaymentTerms,
  listSuppliers,
  listUnitsOfMeasure,
  listWarehouses,
} from '@/server/modules/inventory/masters';
import { displayCurrency } from '@/lib/inventory-overview';
import { parseNewProductType, stockAlertOf } from '@/lib/inventory-list';
import { ProductsWorkspace } from './products-workspace';

export const metadata = { title: 'Inventory · SkyJet' };

export default async function InventoryProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const session = await requireSession();
  const entity = await resolveEntity(session);
  const context = {
    userId: session.userId,
    entityId: entity.entityId,
    requestId: session.requestId,
  };

  const mayManage = can(session, entity.entityId, Permission.MastersManageItems);
  const mayRead = can(session, entity.entityId, Permission.InvRead);
  const mayAdjust = can(session, entity.entityId, Permission.InvAdjustStock);
  const mayPurchase = can(session, entity.entityId, Permission.ProcurementPurchaseCreate);
  const mayManageSuppliers = can(session, entity.entityId, Permission.MastersManageSuppliers);
  const canApproveSupplier = can(session, entity.entityId, Permission.MastersApproveSupplier);

  if (!mayManage && !mayRead) {
    throw new PermissionDeniedError(
      'You do not have permission to do that (masters.manage_items or inv.read required)',
    );
  }

  const emptyLookups = {
    categories: [] as Array<{ id: string; label: string }>,
    manufacturers: [] as Array<{ id: string; label: string }>,
    units: [] as Array<{ code: string; name: string }>,
    suppliers: [] as Array<{ id: string; label: string }>,
    warehouses: [] as Array<{ id: string; label: string }>,
    accounts: [] as Array<{ id: string; label: string; accountType: string }>,
    defaults: { inventoryAccountId: '', cogsAccountId: '', revenueAccountId: '' },
    currencies: [] as Array<{ code: string; name: string }>,
    paymentTerms: [] as Array<{ id: string; label: string }>,
  };

  const [params, rows, lookups] = await Promise.all([
    searchParams,
    listCatalogue(context),
    mayManage
      ? Promise.all([
          listItemCategories(context),
          listManufacturers(context),
          listUnitsOfMeasure(context),
          listSuppliers(context),
          listWarehouses(context),
          listAccounts(context),
          listItemAccountDefaults(context),
          listCurrencies(context),
          listPaymentTerms(context),
        ]).then(
          ([
            categories,
            manufacturers,
            units,
            suppliers,
            warehouses,
            accounts,
            defaults,
            currencies,
            paymentTerms,
          ]) => ({
            categories: categories
              .filter((category) => category.is_active)
              .map((category) => ({
                id: category.id,
                label: `${category.code} — ${category.name}`,
              })),
            manufacturers: manufacturers.map((manufacturer) => ({
              id: manufacturer.id,
              label: `${manufacturer.code} — ${manufacturer.name}`,
            })),
            units,
            suppliers: suppliers
              .filter((supplier) => supplier.is_active)
              .map((supplier) => ({ id: supplier.id, label: supplier.legal_name })),
            warehouses: warehouses
              .filter((warehouse) => warehouse.is_active)
              .map((warehouse) => ({
                id: warehouse.id,
                label: `${warehouse.code} — ${warehouse.name}`,
              })),
            accounts: accounts
              .filter((account) => account.isActive && !account.isSummary)
              .map((account) => ({
                id: account.id,
                label: `${account.code} — ${account.name}`,
                accountType: account.accountType,
              })),
            defaults,
            currencies,
            paymentTerms: paymentTerms.map((term) => ({
              id: term.id,
              label: `${term.code} — ${term.name}`,
            })),
          }),
        )
      : Promise.resolve(emptyLookups),
  ]);

  const attention = rows.reduce(
    (counts, row) => {
      const alert = stockAlertOf(row);
      if (alert === 'low') counts.low += 1;
      if (alert === 'out') counts.out += 1;
      return counts;
    },
    { low: 0, out: 0 },
  );

  return (
    <ProductsWorkspace
      rows={rows}
      attention={attention}
      currency={displayCurrency(entity.baseCurrency)}
      mayManage={mayManage}
      mayAdjust={mayAdjust}
      mayPurchase={mayPurchase}
      mayManageSuppliers={mayManageSuppliers}
      canApproveSupplier={canApproveSupplier}
      initialOpen={mayManage ? parseNewProductType(params.new) : null}
      categories={lookups.categories}
      manufacturers={lookups.manufacturers}
      units={lookups.units}
      suppliers={lookups.suppliers}
      warehouses={lookups.warehouses}
      accounts={lookups.accounts}
      defaults={lookups.defaults}
      currencies={lookups.currencies}
      paymentTerms={lookups.paymentTerms}
      baseCurrency={entity.baseCurrency}
    />
  );
}
