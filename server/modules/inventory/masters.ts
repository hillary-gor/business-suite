import {
  withReadOnlyTransaction,
  withTransaction,
  type RequestContext,
} from '@/server/db/transaction';
import type {
  SaveItemCategoryInput,
  SaveItemInput,
  SaveManufacturerInput,
  SaveSupplierInput,
  SaveWarehouseInput,
} from './schemas';

export async function saveSupplier(context: RequestContext, input: SaveSupplierInput) {
  return withTransaction(context, async (tx) => {
    const id = await tx.scalar<string>(`select app.save_supplier($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        supplier_id: input.supplierId ?? null,
        code: input.code ?? null,
        legal_name: input.legalName,
        trading_name: input.tradingName ?? null,
        tax_pin: input.taxPin ?? null,
        currency_code: input.currencyCode ?? null,
        payment_terms_id: input.paymentTermsId ?? null,
        email: input.email || null,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
        is_foreign: input.isForeign ?? null,
        approval_status: input.approvalStatus ?? null,
        is_active: input.isActive ?? null,
      }),
    ]);
    return { supplierId: id };
  });
}

export async function saveItemCategory(context: RequestContext, input: SaveItemCategoryInput) {
  return withTransaction(context, async (tx) => {
    const id = await tx.scalar<string>(`select inv.save_item_category($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        category_id: input.categoryId ?? null,
        code: input.code ?? null,
        name: input.name,
        parent_id: input.parentId ?? null,
        ata_chapter: input.ataChapter ?? null,
        is_active: input.isActive ?? null,
      }),
    ]);
    return { categoryId: id };
  });
}

export async function saveManufacturer(context: RequestContext, input: SaveManufacturerInput) {
  return withTransaction(context, async (tx) => {
    const id = await tx.scalar<string>(`select inv.save_manufacturer($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        manufacturer_id: input.manufacturerId ?? null,
        code: input.code ?? null,
        name: input.name,
        cage_code: input.cageCode ?? null,
        country_code: input.countryCode ?? null,
        is_active: input.isActive ?? null,
      }),
    ]);
    return { manufacturerId: id };
  });
}

export async function saveWarehouse(context: RequestContext, input: SaveWarehouseInput) {
  return withTransaction(context, async (tx) => {
    const id = await tx.scalar<string>(`select inv.save_warehouse($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        warehouse_id: input.warehouseId ?? null,
        code: input.code ?? null,
        name: input.name,
        inventory_account_id: input.inventoryAccountId ?? null,
        is_consignment: input.isConsignment ?? null,
        is_active: input.isActive ?? null,
      }),
    ]);
    return { warehouseId: id };
  });
}

export async function saveItem(context: RequestContext, input: SaveItemInput) {
  return withTransaction(context, async (tx) => {
    const id = await tx.scalar<string>(`select inv.save_item($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        item_id: input.itemId ?? null,
        part_number: input.partNumber ?? null,
        description: input.description,
        sales_description: input.salesDescription ?? null,
        purchase_description: input.purchaseDescription ?? null,
        sales_price: input.salesPrice ?? null,
        purchase_cost: input.purchaseCost ?? null,
        preferred_supplier_id: input.preferredSupplierId ?? null,
        item_type: input.itemType,
        category_id: input.categoryId ?? null,
        manufacturer_id: input.manufacturerId ?? null,
        manufacturer_part_number: input.manufacturerPartNumber ?? null,
        nsn: input.nsn ?? null,
        uom_code: input.uomCode,
        tracking_mode: input.trackingMode ?? null,
        costing_method: input.costingMethod ?? null,
        requires_certificate: input.requiresCertificate ?? null,
        requires_serial_on_receipt: input.requiresSerialOnReceipt ?? null,
        is_life_limited: input.isLifeLimited ?? null,
        shelf_life_days: input.shelfLifeDays ?? null,
        is_hazardous: input.isHazardous ?? null,
        is_dangerous_goods: input.isDangerousGoods ?? null,
        un_number: input.unNumber ?? null,
        is_export_controlled: input.isExportControlled ?? null,
        eccn: input.eccn ?? null,
        default_tax_code_id: input.defaultTaxCodeId ?? null,
        inventory_account_id: input.inventoryAccountId ?? null,
        cogs_account_id: input.cogsAccountId ?? null,
        revenue_account_id: input.revenueAccountId ?? null,
        reorder_point: input.reorderPoint ?? null,
        reorder_quantity: input.reorderQuantity ?? null,
        lead_time_days: input.leadTimeDays ?? null,
        is_stocked: input.isStocked ?? null,
        is_sellable: input.isSellable ?? null,
        is_purchasable: input.isPurchasable ?? null,
        is_active: input.isActive ?? null,
      }),
    ]);

    if (input.image) {
      const bytes = Buffer.from(input.image.base64, 'base64');
      if (bytes.length > 1_048_576) {
        throw new Error('Product image must be 1 MB or smaller.');
      }
      await tx.query(`select inv.save_item_image($1, $2, $3, $4::bytea)`, [
        context.entityId,
        id,
        input.image.mimeType,
        bytes,
      ]);
    } else if (input.image === null && input.itemId) {
      await tx.query(`select inv.save_item_image($1, $2, null, null)`, [context.entityId, id]);
    }

    const openingQty = Number(input.openingQuantity ?? '0');
    if (!input.itemId && openingQty > 0) {
      await tx.scalar<string>(`select inv.save_adjustment($1, $2::jsonb)::text`, [
        context.entityId,
        JSON.stringify({
          item_id: id,
          warehouse_id: input.warehouseId,
          quantity: input.openingQuantity,
          direction: 'IN',
          reason: 'STOCK_COUNT',
          unit_cost_base: input.purchaseCost,
          notes: 'Opening quantity on hand',
          movement_date: input.openingDate ?? null,
        }),
      ]);
    }

    return { itemId: id };
  });
}

export async function listSuppliers(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      code: string;
      legal_name: string;
      trading_name: string | null;
      currency_code: string;
      email: string | null;
      approval_status: string;
      is_active: boolean;
    }>(
      `select id, code, legal_name, trading_name, currency_code, email,
              approval_status, is_active
         from app.suppliers
        where entity_id = $1
        order by legal_name`,
      [context.entityId],
    ),
  );
}

export async function listItems(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      part_number: string;
      description: string;
      category_name: string | null;
      uom_code: string;
      tracking_mode: string;
      is_stocked: boolean;
      is_sellable: boolean;
      is_purchasable: boolean;
      is_active: boolean;
      qty_on_hand: string;
    }>(
      `select i.id, i.part_number, i.description, c.name as category_name,
              i.uom_code, i.tracking_mode::text, i.is_stocked, i.is_sellable,
              i.is_purchasable, i.is_active,
              coalesce((
                select sum(b.quantity_on_hand)
                  from inv.stock_balances b
                 where b.item_id = i.id
              ), 0)::text as qty_on_hand
         from inv.items i
         left join inv.item_categories c on c.id = i.category_id
        where i.entity_id = $1
        order by i.part_number`,
      [context.entityId],
    ),
  );
}

export async function getItem(context: RequestContext, itemId: string) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.maybeOne<{
      id: string;
      part_number: string;
      description: string;
      sales_description: string | null;
      purchase_description: string | null;
      sales_price: string | null;
      purchase_cost: string | null;
      preferred_supplier_id: string | null;
      category_id: string | null;
      manufacturer_id: string | null;
      manufacturer_part_number: string | null;
      nsn: string | null;
      uom_code: string;
      tracking_mode: string;
      costing_method: string;
      requires_certificate: boolean;
      is_stocked: boolean;
      is_sellable: boolean;
      is_purchasable: boolean;
      is_active: boolean;
      reorder_point: string | null;
      reorder_quantity: string | null;
      qty_on_hand: string;
    }>(
      `select i.id, i.part_number, i.description, i.sales_description,
              i.purchase_description, i.sales_price::text, i.purchase_cost::text,
              i.preferred_supplier_id, i.category_id, i.manufacturer_id,
              i.manufacturer_part_number, i.nsn, i.uom_code, i.tracking_mode::text,
              i.costing_method::text, i.requires_certificate, i.is_stocked,
              i.is_sellable, i.is_purchasable, i.is_active,
              i.reorder_point::text, i.reorder_quantity::text,
              coalesce((
                select sum(b.quantity_on_hand)
                  from inv.stock_balances b
                 where b.item_id = i.id
              ), 0)::text as qty_on_hand
         from inv.items i
        where i.entity_id = $1 and i.id = $2`,
      [context.entityId, itemId],
    ),
  );
}

export async function listItemCategories(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      code: string;
      name: string;
      ata_chapter: string | null;
      parent_name: string | null;
      item_count: string;
      is_active: boolean;
    }>(
      `select c.id, c.code, c.name, c.ata_chapter, p.name as parent_name, c.is_active,
              (select count(*)::text from inv.items i where i.category_id = c.id) as item_count
         from inv.item_categories c
         left join inv.item_categories p on p.id = c.parent_id
        where c.entity_id = $1
        order by c.code`,
      [context.entityId],
    ),
  );
}

export async function listManufacturers(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{ id: string; code: string; name: string; cage_code: string | null }>(
      `select id, code, name, cage_code
         from inv.manufacturers
        where entity_id = $1 and is_active
        order by name`,
      [context.entityId],
    ),
  );
}

export async function listWarehouses(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      id: string;
      code: string;
      name: string;
      is_consignment: boolean;
      is_active: boolean;
      bin_count: string;
    }>(
      `select w.id, w.code, w.name, w.is_consignment, w.is_active,
              (select count(*)::text from inv.bins b where b.warehouse_id = w.id) as bin_count
         from inv.warehouses w
        where w.entity_id = $1
        order by w.code`,
      [context.entityId],
    ),
  );
}

export async function listStockOnHand(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      item_id: string;
      part_number: string;
      description: string;
      warehouse_code: string;
      quantity_on_hand: string;
      average_cost: string | null;
    }>(
      `select i.id as item_id, i.part_number, i.description, w.code as warehouse_code,
              b.quantity_on_hand::text,
              b.average_cost_base::text as average_cost
         from inv.stock_balances b
         join inv.items i on i.id = b.item_id
         join inv.warehouses w on w.id = b.warehouse_id
        where b.entity_id = $1
          and b.quantity_on_hand <> 0
        order by i.part_number, w.code`,
      [context.entityId],
    ),
  );
}

export async function listUnitsOfMeasure(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{ code: string; name: string }>(
      `select code, name from inv.units_of_measure where is_active order by code`,
    ),
  );
}

export async function listPaymentTerms(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{ id: string; code: string; name: string }>(
      `select id, code, name
         from app.payment_terms
        where entity_id = $1 and is_active
        order by days_net, code`,
      [context.entityId],
    ),
  );
}

export async function listCurrencies(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{ code: string; name: string }>(
      `select code, name from app.currencies where is_active order by code`,
    ),
  );
}

export async function listItemAccountDefaults(context: RequestContext) {
  return withReadOnlyTransaction(context, async (tx) => {
    const rows = await tx.query<{ setting_code: string; account_id: string }>(
      `select setting_code, account_id::text as account_id
         from gl.entity_account_settings
        where entity_id = $1
          and setting_code in ('DEFAULT_INVENTORY', 'DEFAULT_COGS', 'DEFAULT_REVENUE')`,
      [context.entityId],
    );
    const byCode = new Map(rows.map((row) => [row.setting_code, row.account_id]));
    return {
      inventoryAccountId: byCode.get('DEFAULT_INVENTORY') ?? '',
      cogsAccountId: byCode.get('DEFAULT_COGS') ?? '',
      revenueAccountId: byCode.get('DEFAULT_REVENUE') ?? '',
    };
  });
}
