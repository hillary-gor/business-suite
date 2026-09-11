import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import {
  listExpenseAccounts,
  listPurchasableItems,
  listShipToCustomers,
  listSuppliersForSelect,
  listTaxCodes,
  listWarehousesForSelect,
} from '@/server/modules/purchasing/documents';
import { nairobiToday } from '@/lib/payables';
import { PoComposer } from '../po-composer';

export const metadata = { title: 'New purchase order · SkyJet' };

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string; itemId?: string; qty?: string }>;
}) {
  const { context, session, entity } = await authorise(Permission.ProcurementPurchaseCreate);
  const { supplierId, itemId, qty } = await searchParams;
  const [suppliers, taxCodes, warehouses, items, customers, expenseAccounts] = await Promise.all([
    listSuppliersForSelect(context),
    listTaxCodes(context),
    listWarehousesForSelect(context),
    listPurchasableItems(context),
    listShipToCustomers(context),
    listExpenseAccounts(context),
  ]);

  const defaultTax = taxCodes.find((t) => t.code === 'VAT16')?.id ?? taxCodes[0]?.id ?? null;

  return (
    <PoComposer
      suppliers={suppliers.map((supplier) => ({
        id: supplier.id,
        legalName: supplier.legal_name,
        currencyCode: supplier.currency_code,
        email: supplier.email,
        mailingAddress: supplier.mailing_address,
      }))}
      customers={customers.map((customer) => ({
        id: customer.id,
        legalName: customer.legal_name,
        shippingAddress: customer.shipping_address,
      }))}
      taxCodes={taxCodes.map((tax) => ({
        id: tax.id,
        label: `${tax.code} (${Number(tax.rate) * 100}%)`,
        rate: tax.rate,
      }))}
      warehouses={warehouses.map((warehouse) => ({
        id: warehouse.id,
        label: `${warehouse.code} — ${warehouse.name}`,
      }))}
      items={items.map((item) => ({
        id: item.id,
        label: `${item.part_number} — ${item.description}`,
        description: item.description,
        partNumber: item.part_number,
        purchaseCost: item.purchase_cost,
        defaultTaxCodeId: item.default_tax_code_id,
        categoryName: item.category_name,
      }))}
      expenseAccounts={expenseAccounts.map((account) => ({
        id: account.id,
        label: `${account.code} — ${account.name}`,
        name: account.name,
      }))}
      defaultTaxCodeId={defaultTax}
      baseCurrency={entity.baseCurrency}
      canApprove={can(session, entity.entityId, Permission.ProcurementPurchaseApprove)}
      canReceive={can(session, entity.entityId, Permission.ProcurementPurchaseReceive)}
      canBill={can(session, entity.entityId, Permission.FinancePaymentCreate)}
      today={nairobiToday()}
      defaultSupplierId={supplierId}
      defaultItemId={itemId}
      defaultQty={qty}
    />
  );
}
