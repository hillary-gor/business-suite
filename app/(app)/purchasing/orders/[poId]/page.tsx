import { notFound } from 'next/navigation';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import {
  getPurchaseOrder,
  listExpenseAccounts,
  listPurchasableItems,
  listShipToCustomers,
  listSuppliersForSelect,
  listTaxCodes,
  listWarehousesForSelect,
} from '@/server/modules/purchasing/documents';
import { nairobiToday } from '@/lib/payables';
import { PoComposer } from '../po-composer';

export const metadata = { title: 'Purchase order · SkyJet' };

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ poId: string }>;
}) {
  const { poId } = await params;
  const { context, session, entity } = await authorise(Permission.ProcurementPurchaseCreate);
  const [result, suppliers, taxCodes, warehouses, items, customers, expenseAccounts] =
    await Promise.all([
      getPurchaseOrder(context, poId),
      listSuppliersForSelect(context),
      listTaxCodes(context),
      listWarehousesForSelect(context),
      listPurchasableItems(context),
      listShipToCustomers(context),
      listExpenseAccounts(context),
    ]);
  if (!result) notFound();

  const { po, lines } = result;
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
      initial={{
        id: po.id,
        poNo: po.po_no,
        status: po.status,
        supplierId: po.supplier_id,
        orderDate: po.order_date,
        expectedDate: po.expected_date ?? '',
        warehouseId: po.warehouse_id ?? '',
        notes: po.notes ?? '',
        paymentTermsId: po.payment_terms_id,
        email: po.supplier_email ?? '',
        mailingAddress: po.mailing_address ?? '',
        categoryLines: lines
          .filter((line) => !line.item_id)
          .map((line) => ({
            accountId: '',
            description: line.description,
            amount: line.line_net,
            taxCodeId: line.tax_code_id ?? '',
            customerId: '',
            received: line.received_qty,
            closed: '0',
          })),
        itemLines: lines
          .filter((line) => line.item_id)
          .map((line) => ({
            itemId: line.item_id ?? '',
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unit_price,
            taxCodeId: line.tax_code_id ?? '',
            customerId: '',
            received: line.received_qty,
            closed: '0',
          })),
      }}
    />
  );
}
