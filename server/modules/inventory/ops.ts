import { withReadOnlyTransaction, withTransaction, type RequestContext } from '@/server/db/transaction';
import type { SaveAdjustmentInput, SaveTransferInput } from './schemas';

export async function saveAdjustment(context: RequestContext, input: SaveAdjustmentInput) {
  return withTransaction(context, async (tx) => {
    const ledgerId = await tx.scalar<string>(`select inv.save_adjustment($1, $2::jsonb)::text`, [
      context.entityId,
      JSON.stringify({
        item_id: input.itemId,
        warehouse_id: input.warehouseId,
        quantity: input.quantity,
        direction: input.direction,
        reference: input.reference ?? null,
        reason: input.reason,
        adjustment_account_id: input.adjustmentAccountId ?? null,
        stock_unit_id: input.stockUnitId ?? null,
        stock_lot_id: input.stockLotId ?? null,
        unit_cost_base: input.unitCostBase ?? null,
        notes: input.notes ?? null,
        movement_date: input.movementDate ?? null,
      }),
    ]);
    return { ledgerId };
  });
}

export async function saveTransfer(context: RequestContext, input: SaveTransferInput) {
  return withTransaction(context, async (tx) => {
    const result = await tx.one<{
      transfer_id: string;
      transfer_out_id: string;
      transfer_in_id: string;
    }>(
      `select (r->>'transfer_id')::uuid::text as transfer_id,
              (r->>'transfer_out_id') as transfer_out_id,
              (r->>'transfer_in_id') as transfer_in_id
         from (select inv.save_transfer($1, $2::jsonb) as r) s`,
      [
        context.entityId,
        JSON.stringify({
          item_id: input.itemId,
          from_warehouse_id: input.fromWarehouseId,
          to_warehouse_id: input.toWarehouseId,
          quantity: input.quantity,
          stock_unit_id: input.stockUnitId ?? null,
          stock_lot_id: input.stockLotId ?? null,
          notes: input.notes ?? null,
          movement_date: input.movementDate ?? null,
        }),
      ],
    );
    return {
      transferId: result.transfer_id,
      transferOutId: result.transfer_out_id,
      transferInId: result.transfer_in_id,
    };
  });
}

export async function listStockLedger(
  context: RequestContext,
  options: {
    fromDate?: string;
    toDate?: string;
    itemId?: string;
    warehouseId?: string;
    limit?: number;
  } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000);
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      movement_date: string;
      movement_type: string;
      part_number: string;
      description: string;
      warehouse_code: string;
      quantity: string;
      unit_cost_base: string;
      value_base: string;
      serial_number: string | null;
      lot_number: string | null;
      source_type: string;
      notes: string | null;
    }>(
      `select l.id::text, l.movement_date::text, l.movement_type::text,
              i.part_number, i.description, w.code as warehouse_code,
              l.quantity::text, l.unit_cost_base::text, l.value_base::text,
              u.serial_number, lot.lot_number, l.source_type, l.notes
         from inv.stock_ledger l
         join inv.items i on i.id = l.item_id
         join inv.warehouses w on w.id = l.warehouse_id
         left join inv.stock_units u on u.id = l.stock_unit_id
         left join inv.stock_lots lot on lot.id = l.stock_lot_id
        where l.entity_id = $1
          and ($2::date is null or l.movement_date >= $2)
          and ($3::date is null or l.movement_date <= $3)
          and ($4::uuid is null or l.item_id = $4)
          and ($5::uuid is null or l.warehouse_id = $5)
        order by l.movement_date desc, l.id desc
        limit $6`,
      [
        context.entityId,
        options.fromDate ?? null,
        options.toDate ?? null,
        options.itemId ?? null,
        options.warehouseId ?? null,
        limit,
      ],
    ),
  );
}

export async function listStockUnits(context: RequestContext, warehouseId?: string) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      item_id: string;
      part_number: string;
      description: string;
      serial_number: string;
      condition_code: string;
      status: string;
      warehouse_id: string | null;
      warehouse_code: string | null;
      bin_code: string | null;
      unit_cost_base: string;
      expiry_date: string | null;
    }>(
      `select u.id, u.item_id, i.part_number, i.description, u.serial_number,
              u.condition_code, u.status::text, u.warehouse_id,
              w.code as warehouse_code, b.code as bin_code,
              u.unit_cost_base::text, u.expiry_date::text
         from inv.stock_units u
         join inv.items i on i.id = u.item_id
         left join inv.warehouses w on w.id = u.warehouse_id
         left join inv.bins b on b.id = u.bin_id
        where u.entity_id = $1
          and u.status = 'ON_HAND'
          and ($2::uuid is null or u.warehouse_id = $2)
        order by i.part_number, u.serial_number`,
      [context.entityId, warehouseId ?? null],
    ),
  );
}

export async function listStockLots(context: RequestContext, warehouseId?: string) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      item_id: string;
      part_number: string;
      description: string;
      lot_number: string;
      condition_code: string;
      quantity_on_hand: string;
      warehouse_id: string | null;
      warehouse_code: string | null;
      expiry_date: string | null;
    }>(
      `select l.id, l.item_id, i.part_number, i.description, l.lot_number,
              l.condition_code, l.expiry_date::text,
              coalesce((
                select sum(sl.quantity)
                  from inv.stock_ledger sl
                 where sl.stock_lot_id = l.id
                   and ($2::uuid is null or sl.warehouse_id = $2)
              ), 0)::text as quantity_on_hand,
              (
                select sl.warehouse_id
                  from inv.stock_ledger sl
                 where sl.stock_lot_id = l.id
                   and ($2::uuid is null or sl.warehouse_id = $2)
                 order by sl.id desc
                 limit 1
              ) as warehouse_id,
              (
                select w.code
                  from inv.stock_ledger sl
                  join inv.warehouses w on w.id = sl.warehouse_id
                 where sl.stock_lot_id = l.id
                   and ($2::uuid is null or sl.warehouse_id = $2)
                 order by sl.id desc
                 limit 1
              ) as warehouse_code
         from inv.stock_lots l
         join inv.items i on i.id = l.item_id
        where l.entity_id = $1
          and coalesce((
                select sum(sl.quantity)
                  from inv.stock_ledger sl
                 where sl.stock_lot_id = l.id
                   and ($2::uuid is null or sl.warehouse_id = $2)
              ), 0) > 0
        order by i.part_number, l.lot_number`,
      [context.entityId, warehouseId ?? null],
    ),
  );
}
