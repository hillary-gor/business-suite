-- ===========================================================================
-- Inventory operations UI wrappers
--
-- Stock adjustments and warehouse transfers go through SECURITY DEFINER
-- functions that call inv.post_movement. The application role has no direct
-- DML on inv.stock_ledger; these are the write path for the Stock UI.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

-- ---------------------------------------------------------------------------
-- inv.save_adjustment
--
-- Posts ADJUSTMENT_IN (positive qty) or ADJUSTMENT_OUT (negative qty).
-- Quantity may be signed, or given as absolute quantity plus direction.
-- Inbound adjustments require unit_cost_base (post_movement invariant).
-- ---------------------------------------------------------------------------

create or replace function inv.save_adjustment(p_entity_id uuid, p_payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_item_id       uuid := nullif(p_payload ->> 'item_id', '')::uuid;
  v_warehouse_id  uuid := nullif(p_payload ->> 'warehouse_id', '')::uuid;
  v_stock_unit_id uuid := nullif(p_payload ->> 'stock_unit_id', '')::uuid;
  v_stock_lot_id  uuid := nullif(p_payload ->> 'stock_lot_id', '')::uuid;
  v_unit_cost     app.money_amount := nullif(p_payload ->> 'unit_cost_base', '')::numeric;
  v_notes         text := nullif(p_payload ->> 'notes', '');
  v_date          date := coalesce(
    nullif(p_payload ->> 'movement_date', '')::date,
    current_date
  );
  v_direction     text := upper(btrim(coalesce(p_payload ->> 'direction', '')));
  v_qty           app.quantity;
  v_type          inv.movement_type;
  v_ledger_id     bigint;
begin
  perform app.require_permission(p_entity_id, 'inv.adjust_stock');

  if v_item_id is null or v_warehouse_id is null then
    raise exception 'item_id and warehouse_id are required'
      using errcode = 'null_value_not_allowed';
  end if;

  v_qty := nullif(p_payload ->> 'quantity', '')::numeric;

  if v_direction <> '' then
    if v_qty is null or v_qty <= 0 then
      raise exception 'quantity must be a positive amount when direction is supplied'
        using errcode = 'check_violation';
    end if;
    if v_direction in ('IN', 'ADJUSTMENT_IN', '+') then
      v_qty := abs(v_qty);
    elsif v_direction in ('OUT', 'ADJUSTMENT_OUT', '-') then
      v_qty := -abs(v_qty);
    else
      raise exception 'direction must be IN or OUT, received %', v_direction
        using errcode = 'check_violation';
    end if;
  end if;

  if v_qty is null or v_qty = 0 then
    raise exception 'quantity is required and must be non-zero'
      using errcode = 'check_violation';
  end if;

  if v_qty > 0 then
    v_type := 'ADJUSTMENT_IN';
    if v_unit_cost is null then
      raise exception 'unit_cost_base is required for an inbound adjustment'
        using errcode = 'null_value_not_allowed';
    end if;
  else
    v_type := 'ADJUSTMENT_OUT';
    v_unit_cost := null;
  end if;

  v_ledger_id := inv.post_movement(
    p_entity_id        => p_entity_id,
    p_item_id          => v_item_id,
    p_warehouse_id     => v_warehouse_id,
    p_movement_type    => v_type,
    p_movement_date    => v_date,
    p_quantity         => v_qty,
    p_stock_unit_id    => v_stock_unit_id,
    p_stock_lot_id     => v_stock_lot_id,
    p_unit_cost_base   => v_unit_cost,
    p_source_type      => 'STOCK_ADJUSTMENT',
    p_notes            => v_notes
  );

  return v_ledger_id;
end;
$$;

comment on function inv.save_adjustment(uuid, jsonb) is
  'Posts an ADJUSTMENT_IN or ADJUSTMENT_OUT via inv.post_movement. Requires inv.adjust_stock.';

-- ---------------------------------------------------------------------------
-- inv.save_transfer
--
-- TRANSFER_OUT from the source warehouse, then TRANSFER_IN at the destination.
-- Outbound cost is resolved by post_movement (issue_cost). The inbound leg
-- reuses the unit cost written on the OUT ledger row so valuation is preserved.
-- ---------------------------------------------------------------------------

create or replace function inv.save_transfer(p_entity_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_item_id      uuid := nullif(p_payload ->> 'item_id', '')::uuid;
  v_from_wh      uuid := nullif(p_payload ->> 'from_warehouse_id', '')::uuid;
  v_to_wh        uuid := nullif(p_payload ->> 'to_warehouse_id', '')::uuid;
  v_stock_unit_id uuid := nullif(p_payload ->> 'stock_unit_id', '')::uuid;
  v_stock_lot_id uuid := nullif(p_payload ->> 'stock_lot_id', '')::uuid;
  v_notes        text := nullif(p_payload ->> 'notes', '');
  v_date         date := coalesce(
    nullif(p_payload ->> 'movement_date', '')::date,
    current_date
  );
  v_qty          app.quantity := nullif(p_payload ->> 'quantity', '')::numeric;
  v_transfer_id  uuid := gen_random_uuid();
  v_out_id       bigint;
  v_in_id        bigint;
  v_unit_cost    app.money_amount;
begin
  perform app.require_permission(p_entity_id, 'inv.manage_stock');

  if v_item_id is null or v_from_wh is null or v_to_wh is null then
    raise exception 'item_id, from_warehouse_id and to_warehouse_id are required'
      using errcode = 'null_value_not_allowed';
  end if;

  if v_from_wh = v_to_wh then
    raise exception 'Transfer source and destination warehouses must differ'
      using errcode = 'check_violation';
  end if;

  if v_qty is null or v_qty <= 0 then
    raise exception 'quantity must be a positive amount'
      using errcode = 'check_violation';
  end if;

  -- Capture the issue value before the OUT posts, then derive unit cost.
  -- post_movement also calls issue_cost on the outbound leg; reading the
  -- ledger afterwards is the source of truth for the IN leg.
  v_out_id := inv.post_movement(
    p_entity_id        => p_entity_id,
    p_item_id          => v_item_id,
    p_warehouse_id     => v_from_wh,
    p_movement_type    => 'TRANSFER_OUT',
    p_movement_date    => v_date,
    p_quantity         => -abs(v_qty),
    p_stock_unit_id    => v_stock_unit_id,
    p_stock_lot_id     => v_stock_lot_id,
    p_source_type      => 'STOCK_TRANSFER',
    p_source_id        => v_transfer_id,
    p_notes            => v_notes
  );

  select unit_cost_base into v_unit_cost
    from inv.stock_ledger
   where id = v_out_id;

  v_in_id := inv.post_movement(
    p_entity_id        => p_entity_id,
    p_item_id          => v_item_id,
    p_warehouse_id     => v_to_wh,
    p_movement_type    => 'TRANSFER_IN',
    p_movement_date    => v_date,
    p_quantity         => abs(v_qty),
    p_stock_unit_id    => v_stock_unit_id,
    p_stock_lot_id     => v_stock_lot_id,
    p_unit_cost_base   => v_unit_cost,
    p_source_type      => 'STOCK_TRANSFER',
    p_source_id        => v_transfer_id,
    p_notes            => v_notes
  );

  return jsonb_build_object(
    'transfer_id', v_transfer_id,
    'transfer_out_id', v_out_id,
    'transfer_in_id', v_in_id
  );
end;
$$;

comment on function inv.save_transfer(uuid, jsonb) is
  'Posts TRANSFER_OUT then TRANSFER_IN, carrying the outbound unit cost onto the inbound leg. Requires inv.manage_stock.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

grant execute on function
  inv.save_adjustment(uuid, jsonb),
  inv.save_transfer(uuid, jsonb)
to skyjet_app;
