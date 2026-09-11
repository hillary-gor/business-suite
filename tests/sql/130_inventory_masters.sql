-- ===========================================================================
-- Inventory masters UI — suppliers, categories, items, warehouses
-- ===========================================================================

do $$
declare
  v_suite      text := 'inventory masters';
  v_entity     uuid := test.entity();
  v_actor      uuid := app.system_user_id();
  v_supplier   uuid;
  v_category   uuid;
  v_mfr        uuid;
  v_warehouse  uuid;
  v_item       uuid;
  v_service    uuid;
  v_opening    uuid;
  v_adj        bigint;
  v_date       date := test.open_date();
begin
  perform set_config('app.current_user_id', v_actor::text, true);

  v_supplier := app.save_supplier(v_entity, jsonb_build_object(
    'code', 'BOEING',
    'legal_name', 'The Boeing Company',
    'currency_code', 'USD',
    'approval_status', 'APPROVED'
  ));
  perform test.ok(v_suite, 'a vendor can be saved', v_supplier is not null);
  perform test.eq(v_suite, 'vendor is approved',
    (select approval_status from app.suppliers where id = v_supplier), 'APPROVED');

  v_category := inv.save_item_category(v_entity, jsonb_build_object(
    'code', 'ACT',
    'name', 'Actuators',
    'ata_chapter', '27'
  ));
  perform test.ok(v_suite, 'a category can be saved', v_category is not null);

  v_mfr := inv.save_manufacturer(v_entity, jsonb_build_object(
    'code', 'HNY',
    'name', 'Honeywell',
    'cage_code', '99193'
  ));
  perform test.ok(v_suite, 'a manufacturer can be saved', v_mfr is not null);

  v_warehouse := inv.save_warehouse(v_entity, jsonb_build_object(
    'code', 'NBO',
    'name', 'Nairobi main store'
  ));
  perform test.ok(v_suite, 'a warehouse can be saved', v_warehouse is not null);
  perform test.ok(v_suite, 'warehouse gets a MAIN bin',
    exists (
      select 1 from inv.bins
       where warehouse_id = v_warehouse and code = 'MAIN'
    ));

  v_item := inv.save_item(v_entity, jsonb_build_object(
    'part_number', 'ACT-100',
    'description', 'Flap actuator',
    'item_type', 'INVENTORY',
    'category_id', v_category,
    'manufacturer_id', v_mfr,
    'uom_code', 'EA',
    'tracking_mode', 'SERIAL'
  ));
  perform test.ok(v_suite, 'an inventory item can be saved', v_item is not null);
  perform test.eq(v_suite, 'inventory item is stocked',
    (select is_stocked::text from inv.items where id = v_item), 'true');
  perform test.eq(v_suite, 'serial tracking uses specific cost',
    (select costing_method::text from inv.items where id = v_item), 'SPECIFIC');

  v_service := inv.save_item(v_entity, jsonb_build_object(
    'part_number', 'LABOUR',
    'description', 'Bench labour hour',
    'item_type', 'SERVICE',
    'uom_code', 'HR'
  ));
  perform test.ok(v_suite, 'a service item can be saved', v_service is not null);
  perform test.eq(v_suite, 'service is not stocked',
    (select is_stocked::text from inv.items where id = v_service), 'false');
  perform test.eq(v_suite, 'service is not purchasable',
    (select is_purchasable::text from inv.items where id = v_service), 'false');

  perform inv.save_item(v_entity, jsonb_build_object(
    'item_id', v_item,
    'part_number', 'ACT-100',
    'description', 'Flap actuator',
    'item_type', 'INVENTORY',
    'sales_description', 'Wing flap actuator',
    'sales_price', 5000,
    'purchase_cost', 4000,
    'preferred_supplier_id', v_supplier
  ));
  perform test.eq(v_suite, 'sales description is stored on the item',
    (select sales_description from inv.items where id = v_item), 'Wing flap actuator');
  perform test.eq_num(v_suite, 'sales price is stored on the item',
    (select sales_price from inv.items where id = v_item), 5000);
  perform test.eq_num(v_suite, 'purchase cost is stored on the item',
    (select purchase_cost from inv.items where id = v_item), 4000);
  perform test.eq(v_suite, 'preferred supplier is stored on the item',
    (select preferred_supplier_id::text from inv.items where id = v_item), v_supplier::text);

  v_opening := inv.save_item(v_entity, jsonb_build_object(
    'part_number', 'OPEN-1',
    'description', 'Opening stock consumable',
    'item_type', 'INVENTORY',
    'uom_code', 'EA',
    'tracking_mode', 'NONE',
    'purchase_cost', 10
  ));
  v_adj := inv.save_adjustment(v_entity, jsonb_build_object(
    'item_id', v_opening,
    'warehouse_id', v_warehouse,
    'quantity', 5,
    'direction', 'IN',
    'reason', 'STOCK_COUNT',
    'unit_cost_base', 10,
    'notes', 'Opening quantity on hand',
    'movement_date', v_date
  ));
  perform test.ok(v_suite, 'opening quantity posts an adjustment', v_adj is not null);
  perform test.eq_num(v_suite, 'opening quantity is on hand',
    (select quantity_on_hand from inv.stock_balances
      where entity_id = v_entity and item_id = v_opening and warehouse_id = v_warehouse), 5);
  perform test.eq(v_suite, 'opening adjustment reason is STOCK_COUNT',
    (select a.reason::text from inv.stock_adjustments a
      join inv.stock_ledger l on l.source_id = a.id
     where l.id = v_adj), 'STOCK_COUNT');

  perform inv.save_item_image(
    v_entity,
    v_opening,
    'image/png',
    decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      'base64'
    )
  );
  perform test.eq(v_suite, 'product image mime is stored',
    (select image_mime from inv.items where id = v_opening), 'image/png');
  perform test.ok(v_suite, 'product image bytes are stored',
    (select image_bytes is not null from inv.items where id = v_opening));

  perform inv.save_item_image(v_entity, v_opening, null, null);
  perform test.ok(v_suite, 'clearing the product image removes the bytes',
    (select image_bytes is null from inv.items where id = v_opening));

  perform test.throws(
    v_suite,
    'an unsupported product image type is refused',
    format(
      'select inv.save_item_image(%L, %L, %L, decode(%L, %L))',
      v_entity,
      v_opening,
      'application/pdf',
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      'base64'
    ),
    'PNG'
  );

  perform test.throws(v_suite, 'unknown UOM is rejected',
    format(
      $q$select inv.save_item(%L::uuid, jsonb_build_object(
        'description', 'bad',
        'uom_code', 'ZZZ'
      ))$q$,
      v_entity
    ),
    'Unknown unit of measure');
end;
$$;
