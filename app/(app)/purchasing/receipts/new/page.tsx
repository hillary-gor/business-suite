import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import {
  listApprovedPosForSelect,
  listPoLines,
  listPurchasableItems,
  listSuppliersForSelect,
  listWarehousesForSelect,
} from '@/server/modules/purchasing/documents';
import { nairobiToday } from '@/lib/payables';
import { ReceiptForm } from './receipt-form';

export const metadata = { title: 'New item receipt · SkyJet' };

export default async function NewGoodsReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ poId?: string; supplierId?: string }>;
}) {
  const { context, entity } = await authorise(Permission.ProcurementPurchaseReceive);
  const { poId, supplierId } = await searchParams;
  const [suppliers, warehouses, items, approvedPos] = await Promise.all([
    listSuppliersForSelect(context),
    listWarehousesForSelect(context),
    listPurchasableItems(context),
    listApprovedPosForSelect(context),
  ]);

  async function loadPoLines(selectedPoId: string) {
    'use server';
    const { context: ctx } = await authorise(Permission.ProcurementPurchaseReceive);
    const rows = await listPoLines(ctx, selectedPoId);
    return rows.map((row) => ({
      id: row.id,
      lineNo: row.line_no,
      itemId: row.item_id,
      description: row.description,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      trackingMode: row.tracking_mode,
      partNumber: row.part_number,
      categoryName: row.category_name,
      receivedQty: row.received_qty,
    }));
  }

  return (
    <ReceiptForm
      suppliers={suppliers.map((supplier) => ({
        id: supplier.id,
        legalName: supplier.legal_name,
      }))}
      warehouses={warehouses.map((warehouse) => ({
        id: warehouse.id,
        label: `${warehouse.code} — ${warehouse.name}`,
      }))}
      items={items.map((item) => ({
        id: item.id,
        label: `${item.part_number} — ${item.description}`,
        description: item.description,
        trackingMode: item.tracking_mode,
        partNumber: item.part_number,
        purchaseCost: item.purchase_cost,
        categoryName: item.category_name,
      }))}
      approvedPos={approvedPos.map((po) => ({
        id: po.id,
        poNo: po.po_no,
        supplierId: po.supplier_id,
        supplierName: po.supplier_name,
        warehouseId: po.warehouse_id,
        orderDate: po.order_date,
        total: po.total,
        remaining: po.remaining,
        currencyCode: po.currency_code,
      }))}
      loadPoLines={loadPoLines}
      defaultPoId={poId}
      defaultSupplierId={supplierId}
      today={nairobiToday()}
      baseCurrency={entity.baseCurrency}
    />
  );
}
