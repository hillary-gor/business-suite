import { withReadOnlyTransaction, type RequestContext } from '@/server/db/transaction';

export type CatalogueRow = {
  id: string;
  name: string;
  sku: string;
  salesDescription: string | null;
  purchaseDescription: string | null;
  category: string | null;
  itemType: 'INVENTORY' | 'NON_INVENTORY' | 'SERVICE';
  isActive: boolean;
  isStocked: boolean;
  qtyOnHand: string;
  qtyOnPo: string;
  qtyOnSo: string;
  qtyAvailable: string;
  price: string | null;
  cost: string | null;
  reorderPoint: string | null;
  preferredSupplier: string | null;
  incomeAccount: string | null;
  expenseAccount: string | null;
  inventoryAccount: string | null;
  hasMovement: boolean;
};

export type AdjustmentRow = {
  id: string;
  reference: string;
  adjustmentDate: string;
  reason: string;
  accountCode: string;
  accountName: string;
  items: string | null;
  quantity: string;
  notes: string | null;
};

/**
 * Every column the products list can show, in one pass. Quantity on purchase
 * order and on sales order are the ordered quantities on documents that are
 * approved or confirmed but not yet turned into a receipt or an invoice —
 * what is coming and what is spoken for.
 */
export async function listCatalogue(context: RequestContext): Promise<CatalogueRow[]> {
  return withReadOnlyTransaction(context, async (tx) => {
    const rows = await tx.query<{
      id: string;
      part_number: string;
      description: string;
      sales_description: string | null;
      purchase_description: string | null;
      category_name: string | null;
      item_type: string;
      is_active: boolean;
      is_stocked: boolean;
      qty_on_hand: string;
      qty_on_po: string;
      qty_on_so: string;
      qty_available: string;
      sales_price: string | null;
      purchase_cost: string | null;
      reorder_point: string | null;
      preferred_supplier: string | null;
      income_account: string | null;
      expense_account: string | null;
      inventory_account: string | null;
      has_movement: boolean;
    }>(
      `select i.id,
              i.part_number,
              i.description,
              i.sales_description,
              i.purchase_description,
              c.name as category_name,
              case
                when i.is_stocked then 'INVENTORY'
                when i.is_purchasable then 'NON_INVENTORY'
                else 'SERVICE'
              end as item_type,
              i.is_active,
              i.is_stocked,
              coalesce(bal.qty, 0)::text as qty_on_hand,
              coalesce(po.qty, 0)::text as qty_on_po,
              coalesce(so.qty, 0)::text as qty_on_so,
              (coalesce(bal.qty, 0) - coalesce(so.qty, 0))::text as qty_available,
              i.sales_price::text,
              i.purchase_cost::text,
              i.reorder_point::text,
              sup.legal_name as preferred_supplier,
              rev.name as income_account,
              cogs.name as expense_account,
              stock.name as inventory_account,
              exists (select 1 from inv.stock_ledger l where l.item_id = i.id) as has_movement
         from inv.items i
         left join inv.item_categories c on c.id = i.category_id
         left join app.suppliers sup on sup.id = i.preferred_supplier_id
         left join gl.accounts rev on rev.id = i.revenue_account_id
         left join gl.accounts cogs on cogs.id = i.cogs_account_id
         left join gl.accounts stock on stock.id = i.inventory_account_id
         left join lateral (
           select sum(b.quantity_on_hand) as qty
             from inv.stock_balances b
            where b.item_id = i.id
         ) bal on true
         left join lateral (
           select sum(pl.quantity) as qty
             from purch.purchase_order_lines pl
             join purch.purchase_orders p on p.id = pl.po_id
            where pl.item_id = i.id
              and p.entity_id = i.entity_id
              and p.status = 'APPROVED'
         ) po on true
         left join lateral (
           select sum(ol.quantity) as qty
             from sales.sales_order_lines ol
             join sales.sales_orders o on o.id = ol.sales_order_id
            where ol.item_id = i.id
              and o.entity_id = i.entity_id
              and o.status = 'CONFIRMED'
              and o.converted_invoice_id is null
         ) so on true
        where i.entity_id = $1
        order by i.description`,
      [context.entityId],
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.description,
      sku: row.part_number,
      salesDescription: row.sales_description,
      purchaseDescription: row.purchase_description,
      category: row.category_name,
      itemType: row.item_type as CatalogueRow['itemType'],
      isActive: row.is_active,
      isStocked: row.is_stocked,
      qtyOnHand: row.qty_on_hand,
      qtyOnPo: row.qty_on_po,
      qtyOnSo: row.qty_on_so,
      qtyAvailable: row.qty_available,
      price: row.sales_price,
      cost: row.purchase_cost,
      reorderPoint: row.reorder_point,
      preferredSupplier: row.preferred_supplier,
      incomeAccount: row.income_account,
      expenseAccount: row.expense_account,
      inventoryAccount: row.inventory_account,
      hasMovement: row.has_movement,
    }));
  });
}

export type AdjustmentLine = {
  ledgerId: string;
  partNumber: string;
  description: string;
  warehouseCode: string;
  quantity: string;
  unitCost: string;
  value: string;
};

export async function getAdjustment(
  context: RequestContext,
  adjustmentId: string,
): Promise<{ header: AdjustmentRow; lines: AdjustmentLine[] } | null> {
  return withReadOnlyTransaction(context, async (tx) => {
    const header = await tx.maybeOne<{
      id: string;
      reference: string;
      adjustment_date: string;
      reason: string;
      account_code: string;
      account_name: string;
      notes: string | null;
    }>(
      `select a.id, a.reference, a.adjustment_date::text, a.reason,
              acc.code as account_code, acc.name as account_name, a.notes
         from inv.stock_adjustments a
         join gl.accounts acc on acc.id = a.adjustment_account_id
        where a.entity_id = $1 and a.id = $2`,
      [context.entityId, adjustmentId],
    );
    if (!header) return null;

    const lines = await tx.query<{
      ledger_id: string;
      part_number: string;
      description: string;
      warehouse_code: string;
      quantity: string;
      unit_cost_base: string;
      value_base: string;
    }>(
      `select l.id::text as ledger_id, i.part_number, i.description, w.code as warehouse_code,
              l.quantity::text, l.unit_cost_base::text, l.value_base::text
         from inv.stock_ledger l
         join inv.items i on i.id = l.item_id
         join inv.warehouses w on w.id = l.warehouse_id
        where l.entity_id = $1
          and l.source_type = 'STOCK_ADJUSTMENT'
          and l.source_id = $2
        order by l.id`,
      [context.entityId, adjustmentId],
    );

    const quantity = lines.reduce((total, line) => total + Number(line.quantity), 0);

    return {
      header: {
        id: header.id,
        reference: header.reference,
        adjustmentDate: header.adjustment_date,
        reason: header.reason,
        accountCode: header.account_code,
        accountName: header.account_name,
        items: lines.map((line) => line.description).join(', ') || null,
        quantity: String(quantity),
        notes: header.notes,
      },
      lines: lines.map((line) => ({
        ledgerId: line.ledger_id,
        partNumber: line.part_number,
        description: line.description,
        warehouseCode: line.warehouse_code,
        quantity: line.quantity,
        unitCost: line.unit_cost_base,
        value: line.value_base,
      })),
    };
  });
}

export async function listAdjustments(
  context: RequestContext,
  options: { fromDate?: string; toDate?: string; reason?: string } = {},
): Promise<AdjustmentRow[]> {
  return withReadOnlyTransaction(context, async (tx) => {
    const rows = await tx.query<{
      id: string;
      reference: string;
      adjustment_date: string;
      reason: string;
      account_code: string;
      account_name: string;
      items: string | null;
      quantity: string;
      notes: string | null;
    }>(
      `select a.id,
              a.reference,
              a.adjustment_date::text,
              a.reason,
              acc.code as account_code,
              acc.name as account_name,
              lines.items,
              coalesce(lines.qty, 0)::text as quantity,
              a.notes
         from inv.stock_adjustments a
         join gl.accounts acc on acc.id = a.adjustment_account_id
         left join lateral (
           select string_agg(distinct i.description, ', ') as items,
                  sum(l.quantity) as qty
             from inv.stock_ledger l
             join inv.items i on i.id = l.item_id
            where l.source_type = 'STOCK_ADJUSTMENT'
              and l.source_id = a.id
         ) lines on true
        where a.entity_id = $1
          and ($2::date is null or a.adjustment_date >= $2)
          and ($3::date is null or a.adjustment_date <= $3)
          and ($4::text is null or a.reason = $4)
        order by a.adjustment_date desc, a.created_at desc
        limit 500`,
      [context.entityId, options.fromDate ?? null, options.toDate ?? null, options.reason ?? null],
    );

    return rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      adjustmentDate: row.adjustment_date,
      reason: row.reason,
      accountCode: row.account_code,
      accountName: row.account_name,
      items: row.items,
      quantity: row.quantity,
      notes: row.notes,
    }));
  });
}

export async function getTransfer(
  context: RequestContext,
  transferId: string,
): Promise<{
  header: {
    id: string;
    movementDate: string;
    notes: string | null;
    fromWarehouse: string | null;
    toWarehouse: string | null;
  };
  lines: Array<{
    partNumber: string;
    description: string;
    warehouseCode: string;
    movementType: string;
    quantity: string;
    unitCost: string;
    value: string;
  }>;
} | null> {
  return withReadOnlyTransaction(context, async (tx) => {
    const header = await tx.maybeOne<{
      id: string;
      movement_date: string;
      notes: string | null;
      from_warehouse: string | null;
      to_warehouse: string | null;
    }>(
      `select $2::uuid::text as id,
              min(l.movement_date)::text as movement_date,
              max(l.notes) as notes,
              max(case when l.movement_type = 'TRANSFER_OUT' then w.name end) as from_warehouse,
              max(case when l.movement_type = 'TRANSFER_IN' then w.name end) as to_warehouse
         from inv.stock_ledger l
         join inv.warehouses w on w.id = l.warehouse_id
        where l.entity_id = $1
          and l.source_type = 'STOCK_TRANSFER'
          and l.source_id = $2
        group by l.source_id`,
      [context.entityId, transferId],
    );
    if (!header) return null;

    const lines = await tx.query<{
      part_number: string;
      description: string;
      warehouse_code: string;
      movement_type: string;
      quantity: string;
      unit_cost_base: string;
      value_base: string;
    }>(
      `select i.part_number, i.description, w.code as warehouse_code, l.movement_type::text,
              l.quantity::text, l.unit_cost_base::text, l.value_base::text
         from inv.stock_ledger l
         join inv.items i on i.id = l.item_id
         join inv.warehouses w on w.id = l.warehouse_id
        where l.entity_id = $1
          and l.source_type = 'STOCK_TRANSFER'
          and l.source_id = $2
        order by l.id`,
      [context.entityId, transferId],
    );

    return {
      header: {
        id: header.id,
        movementDate: header.movement_date,
        notes: header.notes,
        fromWarehouse: header.from_warehouse,
        toWarehouse: header.to_warehouse,
      },
      lines: lines.map((line) => ({
        partNumber: line.part_number,
        description: line.description,
        warehouseCode: line.warehouse_code,
        movementType: line.movement_type,
        quantity: line.quantity,
        unitCost: line.unit_cost_base,
        value: line.value_base,
      })),
    };
  });
}
