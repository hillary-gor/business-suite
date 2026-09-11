-- ===========================================================================
-- Invariant 8: stock quantity and stock value move together, and the
-- inventory sub-ledger ties to the general ledger to the cent.
--
-- Two costing policies are exercised: specific identification for serialised
-- parts, where the cost of the part sold is the cost of that exact part, and
-- weighted average for consumables, where it is not.
-- ===========================================================================

do $$
declare
  v_suite     text := 'inventory costing';
  v_entity    uuid := test.entity();
  v_date      date := test.open_date();
  v_wh        uuid := test.warehouse('MAIN');
  v_bin       uuid;
  v_category  uuid;
  v_serial_item uuid;
  v_bulk_item   uuid;
  v_unit_a    uuid;
  v_unit_b    uuid;
  v_tie       record;
  v_cost      numeric;
begin
  select id into v_bin from inv.bins where warehouse_id = v_wh and code = 'MAIN';
  select id into v_category from inv.item_categories where entity_id = v_entity and code = 'ATA32';

  -- A serialised rotable and a bulk consumable.
  insert into inv.items (
    entity_id, part_number, description, category_id, uom_code,
    tracking_mode, costing_method, requires_certificate
  )
  values (v_entity, 'MLG-ACT-1120', 'Main landing gear actuator', v_category, 'EA', 'SERIAL', 'SPECIFIC', true)
  returning id into v_serial_item;

  insert into inv.items (
    entity_id, part_number, description, uom_code,
    tracking_mode, costing_method, requires_certificate, requires_serial_on_receipt
  )
  values (v_entity, 'MS21042-4', 'Self-locking nut', 'EA', 'NONE', 'WEIGHTED_AVERAGE', false, false)
  returning id into v_bulk_item;

  -- -------------------------------------------------------------------------
  -- Specific identification
  -- -------------------------------------------------------------------------

  insert into inv.stock_units (entity_id, item_id, serial_number, condition_code, status, warehouse_id, bin_id)
  values (v_entity, v_serial_item, 'SN-0001', 'OH', 'ON_HAND', v_wh, v_bin)
  returning id into v_unit_a;

  insert into inv.stock_units (entity_id, item_id, serial_number, condition_code, status, warehouse_id, bin_id)
  values (v_entity, v_serial_item, 'SN-0002', 'OH', 'ON_HAND', v_wh, v_bin)
  returning id into v_unit_b;

  -- The same part, bought at very different prices. This is the whole reason
  -- specific identification exists.
  perform inv.post_movement(
    p_entity_id => v_entity, p_item_id => v_serial_item, p_warehouse_id => v_wh,
    p_movement_type => 'RECEIPT', p_movement_date => v_date, p_quantity => 1,
    p_bin_id => v_bin, p_stock_unit_id => v_unit_a, p_unit_cost_base => 850000
  );

  perform inv.post_movement(
    p_entity_id => v_entity, p_item_id => v_serial_item, p_warehouse_id => v_wh,
    p_movement_type => 'RECEIPT', p_movement_date => v_date, p_quantity => 1,
    p_bin_id => v_bin, p_stock_unit_id => v_unit_b, p_unit_cost_base => 1150000
  );

  perform test.eq_num(v_suite, 'two receipts give a quantity of two',
    (select quantity_on_hand from inv.stock_balances
      where entity_id = v_entity and item_id = v_serial_item and warehouse_id = v_wh), 2);

  perform test.eq_num(v_suite, 'the value on hand is the sum of what was paid',
    (select value_base from inv.stock_balances
      where entity_id = v_entity and item_id = v_serial_item and warehouse_id = v_wh), 2000000);

  perform test.eq_num(v_suite, 'issuing the cheap unit costs the cheap unit',
    inv.issue_cost(v_entity, v_serial_item, v_wh, 1, v_unit_a), 850000);

  perform test.eq_num(v_suite, 'issuing the expensive unit costs the expensive unit',
    inv.issue_cost(v_entity, v_serial_item, v_wh, 1, v_unit_b), 1150000);

  perform test.throws(v_suite,
    'a serialised issue without a unit is refused rather than averaged',
    format('select inv.issue_cost(%L, %L, %L, 1, null)', v_entity, v_serial_item, v_wh),
    'specific identification');

  -- Sell the expensive one.
  perform inv.post_movement(
    p_entity_id => v_entity, p_item_id => v_serial_item, p_warehouse_id => v_wh,
    p_movement_type => 'ISSUE', p_movement_date => v_date, p_quantity => -1,
    p_bin_id => v_bin, p_stock_unit_id => v_unit_b
  );

  perform test.eq_num(v_suite, 'cost of sales took the actual cost of that unit',
    (select sum(debit_base - credit_base) from gl.journal_entry_line
      where entity_id = v_entity and account_id = test.account('5010')), 1150000);

  perform test.eq_num(v_suite, 'the remaining stock is valued at what the survivor cost',
    (select value_base from inv.stock_balances
      where entity_id = v_entity and item_id = v_serial_item and warehouse_id = v_wh), 850000);

  perform test.eq(v_suite, 'the sold unit is marked delivered',
    (select status from inv.stock_units where id = v_unit_b), 'DELIVERED'::inv.stock_unit_status);

  perform test.eq_num(v_suite, 'a serialised movement is one unit and carries the unit reference',
    (select count(*) from inv.stock_ledger
      where stock_unit_id = v_unit_b and abs(quantity) = 1), 2);

  -- -------------------------------------------------------------------------
  -- Weighted average
  -- -------------------------------------------------------------------------

  perform inv.post_movement(
    p_entity_id => v_entity, p_item_id => v_bulk_item, p_warehouse_id => v_wh,
    p_movement_type => 'RECEIPT', p_movement_date => v_date, p_quantity => 100,
    p_bin_id => v_bin, p_unit_cost_base => 10
  );

  perform inv.post_movement(
    p_entity_id => v_entity, p_item_id => v_bulk_item, p_warehouse_id => v_wh,
    p_movement_type => 'RECEIPT', p_movement_date => v_date, p_quantity => 100,
    p_bin_id => v_bin, p_unit_cost_base => 20
  );

  perform test.eq_num(v_suite, 'the weighted average of 100 at 10 and 100 at 20 is 15',
    inv.current_average_cost(v_entity, v_bulk_item, v_wh), 15);

  perform test.eq_num(v_suite, 'issuing 50 costs 750, not 500 or 1000',
    inv.issue_cost(v_entity, v_bulk_item, v_wh, 50), 750);

  perform inv.post_movement(
    p_entity_id => v_entity, p_item_id => v_bulk_item, p_warehouse_id => v_wh,
    p_movement_type => 'ISSUE', p_movement_date => v_date, p_quantity => -50,
    p_bin_id => v_bin
  );

  perform test.eq_num(v_suite, 'the average is unchanged by an issue',
    inv.current_average_cost(v_entity, v_bulk_item, v_wh), 15);

  perform test.eq_num(v_suite, '150 units remain',
    (select quantity_on_hand from inv.stock_balances
      where entity_id = v_entity and item_id = v_bulk_item and warehouse_id = v_wh), 150);

  perform test.eq_num(v_suite, 'valued at 2250',
    (select value_base from inv.stock_balances
      where entity_id = v_entity and item_id = v_bulk_item and warehouse_id = v_wh), 2250);

  -- -------------------------------------------------------------------------
  -- Guards
  -- -------------------------------------------------------------------------

  perform test.throws(v_suite,
    'stock cannot be driven negative',
    format($sql$
      select inv.post_movement(
        p_entity_id => %L, p_item_id => %L, p_warehouse_id => %L,
        p_movement_type => 'ISSUE', p_movement_date => %L::date, p_quantity => -1000, p_bin_id => %L)
    $sql$, v_entity, v_bulk_item, v_wh, v_date, v_bin),
    'Negative stock is not permitted');

  perform test.throws(v_suite,
    'an inbound movement must state its cost',
    format($sql$
      select inv.post_movement(
        p_entity_id => %L, p_item_id => %L, p_warehouse_id => %L,
        p_movement_type => 'RECEIPT', p_movement_date => %L::date, p_quantity => 10, p_bin_id => %L)
    $sql$, v_entity, v_bulk_item, v_wh, v_date, v_bin),
    'must state its unit cost');

  perform test.throws(v_suite,
    'a serialised part cannot move without identifying the unit',
    format($sql$
      select inv.post_movement(
        p_entity_id => %L, p_item_id => %L, p_warehouse_id => %L,
        p_movement_type => 'RECEIPT', p_movement_date => %L::date, p_quantity => 1,
        p_bin_id => %L, p_unit_cost_base => 100)
    $sql$, v_entity, v_serial_item, v_wh, v_date, v_bin),
    'stock unit must be identified');

  perform test.throws(v_suite,
    'a zero-quantity movement is meaningless and refused',
    format($sql$
      select inv.post_movement(
        p_entity_id => %L, p_item_id => %L, p_warehouse_id => %L,
        p_movement_type => 'RECEIPT', p_movement_date => %L::date, p_quantity => 0,
        p_bin_id => %L, p_unit_cost_base => 100)
    $sql$, v_entity, v_bulk_item, v_wh, v_date, v_bin),
    'meaningless');

  -- -------------------------------------------------------------------------
  -- The tie-out
  -- -------------------------------------------------------------------------

  select * into v_tie from inv.verify_inventory_ties_to_gl(v_entity, v_date);

  perform test.eq_num(v_suite, 'the inventory sub-ledger ties to the general ledger exactly',
    v_tie.difference, 0);

  perform test.eq_num(v_suite, 'the sub-ledger holds the value it should',
    v_tie.subledger_value, 852250);

  perform test.eq_num(v_suite, 'every valued movement carries its journal entry',
    (select count(*) from inv.stock_ledger
      where entity_id = v_entity and value_base <> 0 and journal_entry_id is null), 0);

  perform test.eq_num(v_suite, 'the ledger still nets to zero',
    (select sum(debit_base - credit_base) from gl.journal_entry_line where entity_id = v_entity), 0);

  -- And the derived balances can be rebuilt from the movement log alone.
  perform inv.rebuild_stock_balances(v_entity);

  perform test.eq_num(v_suite, 'rebuilt balances agree with the incremental ones',
    (select value_base from inv.stock_balances
      where entity_id = v_entity and item_id = v_serial_item and warehouse_id = v_wh), 850000);

  perform gl.rebuild_account_balances(v_entity);

  perform test.eq_num(v_suite, 'rebuilt account balances agree with the ledger',
    (select sum(debit_base - credit_base) from gl.account_balance_period where entity_id = v_entity), 0);
end;
$$;
