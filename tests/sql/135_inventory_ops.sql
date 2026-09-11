-- ===========================================================================
-- Inventory ops — adjustments and warehouse transfers
-- ===========================================================================

do $$
declare
  v_suite     text := 'inventory ops';
  v_entity    uuid := test.entity();
  v_actor     uuid := app.system_user_id();
  v_date      date := test.open_date();
  v_main      uuid := test.warehouse('MAIN');
  v_aog       uuid := test.warehouse('AOG');
  v_bin       uuid;
  v_item      uuid;
  v_adj_in    bigint;
  v_adj_out   bigint;
  v_transfer  jsonb;
begin
  perform set_config('app.current_user_id', v_actor::text, true);

  select id into v_bin from inv.bins where warehouse_id = v_main and code = 'MAIN';

  -- Prefer the seeded AOG warehouse; insert a spare if the seed is incomplete.
  if v_aog is null then
    insert into inv.warehouses (entity_id, code, name, inventory_account_id)
    values (v_entity, 'XFER', 'Transfer test store', test.account('1210'))
    returning id into v_aog;

    insert into inv.bins (entity_id, warehouse_id, code, name, bin_type)
    values (v_entity, v_aog, 'MAIN', 'Main Bin', 'STOCK');
  end if;

  insert into inv.items (
    entity_id, part_number, description, uom_code,
    tracking_mode, costing_method, requires_certificate, requires_serial_on_receipt,
    is_stocked, is_sellable, is_purchasable
  ) values (
    v_entity, 'OPS-NUT-1', 'Ops test consumable', 'EA',
    'NONE', 'WEIGHTED_AVERAGE', false, false,
    true, true, true
  ) returning id into v_item;

  -- -------------------------------------------------------------------------
  -- Adjustment in
  -- -------------------------------------------------------------------------

  v_adj_in := inv.save_adjustment(v_entity, jsonb_build_object(
    'item_id', v_item,
    'warehouse_id', v_main,
    'quantity', 100,
    'direction', 'IN',
    'unit_cost_base', 12.5,
    'movement_date', v_date,
    'notes', 'Opening count putaway'
  ));

  perform test.ok(v_suite, 'adjustment in returns a ledger id', v_adj_in is not null);
  perform test.eq(v_suite, 'adjustment in is ADJUSTMENT_IN',
    (select movement_type::text from inv.stock_ledger where id = v_adj_in), 'ADJUSTMENT_IN');
  perform test.eq_num(v_suite, 'adjustment in posts positive quantity',
    (select quantity from inv.stock_ledger where id = v_adj_in), 100);
  perform test.eq_num(v_suite, 'MAIN holds 100 after adjustment in',
    (select quantity_on_hand from inv.stock_balances
      where entity_id = v_entity and item_id = v_item and warehouse_id = v_main), 100);
  perform test.eq_num(v_suite, 'MAIN value is quantity times unit cost',
    (select value_base from inv.stock_balances
      where entity_id = v_entity and item_id = v_item and warehouse_id = v_main), 1250);

  perform test.eq(v_suite, 'adjustment in writes a numbered header',
    (select a.reference from inv.stock_adjustments a
      join inv.stock_ledger l on l.source_id = a.id
     where l.id = v_adj_in), 'ADJ-0001');
  perform test.eq(v_suite, 'default adjustment reason is OTHER',
    (select a.reason from inv.stock_adjustments a
      join inv.stock_ledger l on l.source_id = a.id
     where l.id = v_adj_in), 'OTHER');

  -- -------------------------------------------------------------------------
  -- Adjustment out (signed quantity)
  -- -------------------------------------------------------------------------

  v_adj_out := inv.save_adjustment(v_entity, jsonb_build_object(
    'item_id', v_item,
    'warehouse_id', v_main,
    'quantity', -20,
    'movement_date', v_date,
    'notes', 'Count write-off'
  ));

  perform test.eq(v_suite, 'adjustment out is ADJUSTMENT_OUT',
    (select movement_type::text from inv.stock_ledger where id = v_adj_out), 'ADJUSTMENT_OUT');
  perform test.eq_num(v_suite, 'MAIN holds 80 after adjustment out',
    (select quantity_on_hand from inv.stock_balances
      where entity_id = v_entity and item_id = v_item and warehouse_id = v_main), 80);
  perform test.eq(v_suite, 'adjustment out writes the next numbered header',
    (select a.reference from inv.stock_adjustments a
      join inv.stock_ledger l on l.source_id = a.id
     where l.id = v_adj_out), 'ADJ-0002');

  perform test.throws(v_suite, 'inbound adjustment without unit cost is refused',
    format(
      $q$select inv.save_adjustment(%L::uuid, jsonb_build_object(
        'item_id', %L,
        'warehouse_id', %L,
        'quantity', 5,
        'direction', 'IN',
        'movement_date', %L
      ))$q$,
      v_entity, v_item, v_main, v_date
    ),
    'unit_cost_base');

  -- -------------------------------------------------------------------------
  -- Transfer MAIN → AOG
  -- -------------------------------------------------------------------------

  v_transfer := inv.save_transfer(v_entity, jsonb_build_object(
    'item_id', v_item,
    'from_warehouse_id', v_main,
    'to_warehouse_id', v_aog,
    'quantity', 30,
    'movement_date', v_date,
    'notes', 'Replenish AOG'
  ));

  perform test.ok(v_suite, 'transfer returns both ledger ids',
    (v_transfer ->> 'transfer_out_id') is not null
    and (v_transfer ->> 'transfer_in_id') is not null);

  perform test.eq(v_suite, 'outbound leg is TRANSFER_OUT',
    (select movement_type::text from inv.stock_ledger
      where id = (v_transfer ->> 'transfer_out_id')::bigint), 'TRANSFER_OUT');
  perform test.eq(v_suite, 'inbound leg is TRANSFER_IN',
    (select movement_type::text from inv.stock_ledger
      where id = (v_transfer ->> 'transfer_in_id')::bigint), 'TRANSFER_IN');

  perform test.eq_num(v_suite, 'MAIN holds 50 after transfer out',
    (select coalesce(quantity_on_hand, 0) from inv.stock_balances
      where entity_id = v_entity and item_id = v_item and warehouse_id = v_main), 50);
  perform test.eq_num(v_suite, 'destination holds the transferred quantity',
    (select quantity_on_hand from inv.stock_balances
      where entity_id = v_entity and item_id = v_item and warehouse_id = v_aog), 30);

  perform test.eq_num(v_suite, 'inbound unit cost matches the outbound issue cost',
    (select unit_cost_base from inv.stock_ledger
      where id = (v_transfer ->> 'transfer_in_id')::bigint),
    (select unit_cost_base from inv.stock_ledger
      where id = (v_transfer ->> 'transfer_out_id')::bigint));

  perform test.eq_num(v_suite, 'transfer pair shares a source_id',
    (select count(distinct source_id) from inv.stock_ledger
      where id in (
        (v_transfer ->> 'transfer_out_id')::bigint,
        (v_transfer ->> 'transfer_in_id')::bigint
      )), 1);

  perform test.throws(v_suite, 'transfer to the same warehouse is refused',
    format(
      $q$select inv.save_transfer(%L::uuid, jsonb_build_object(
        'item_id', %L,
        'from_warehouse_id', %L,
        'to_warehouse_id', %L,
        'quantity', 1,
        'movement_date', %L
      ))$q$,
      v_entity, v_item, v_main, v_main, v_date
    ),
    'must differ');
end;
$$;
