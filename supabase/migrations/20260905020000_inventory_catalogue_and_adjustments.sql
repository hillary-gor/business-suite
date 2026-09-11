-- ===========================================================================
-- Inventory: catalogue selling detail and stock adjustment headers
--
-- Two gaps the inventory list could not fill.
--
-- The first is commercial. inv.items described a part well enough to receive
-- and issue it but held no price, no cost and no preferred supplier, so a
-- products list could only ever show quantities. Those three, plus the
-- separate sales and purchase wording a part carries onto a quote and onto a
-- purchase order, live on the item.
--
-- The second is the adjustment itself. inv.stock_ledger records what moved;
-- it is append-only and deliberately says nothing about why. An adjustment
-- register needs a why — a reason and the account the write-off landed in —
-- and it needs one row per adjustment rather than one per movement. That is
-- a header, inv.stock_adjustments, which the ledger rows point at through
-- source_id. The ledger stays untouched.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

-- ---------------------------------------------------------------------------
-- Selling and buying detail on the catalogue
-- ---------------------------------------------------------------------------

alter table inv.items
  add column if not exists sales_description    text,
  add column if not exists purchase_description text,
  add column if not exists sales_price          app.money_amount
    check (sales_price is null or sales_price >= 0),
  add column if not exists purchase_cost        app.money_amount
    check (purchase_cost is null or purchase_cost >= 0),
  add column if not exists preferred_supplier_id uuid
    references app.suppliers (id) on delete restrict;

comment on column inv.items.sales_description is
  'What the customer reads on a quote or invoice line. Falls back to description when blank.';
comment on column inv.items.purchase_description is
  'What the supplier reads on a purchase order line. Falls back to description when blank.';
comment on column inv.items.sales_price is
  'Default selling price in the entity base currency. A default only; a document line may differ.';
comment on column inv.items.purchase_cost is
  'What the part is expected to cost to buy. Planning figure only — valuation comes from the ledger.';

create index if not exists items_preferred_supplier_idx
  on inv.items (preferred_supplier_id) where preferred_supplier_id is not null;

-- ---------------------------------------------------------------------------
-- Adjustment headers
-- ---------------------------------------------------------------------------

create table if not exists inv.stock_adjustments (
  id                    uuid primary key default gen_random_uuid(),
  entity_id             uuid not null references app.entities (id) on delete restrict,
  reference             text not null,
  adjustment_date       date not null,
  reason                text not null,
  adjustment_account_id uuid not null references gl.accounts (id) on delete restrict,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  updated_by            uuid,
  constraint stock_adjustments_reason_chk check (
    reason in ('SHRINKAGE', 'DAMAGED', 'EXPIRED', 'STOCK_COUNT', 'SUPPLIES_USED', 'FOUND', 'OTHER')
  ),
  constraint stock_adjustments_reference_uq unique (entity_id, reference)
);

comment on table inv.stock_adjustments is
  'Why stock was adjusted. The movement itself is one or more inv.stock_ledger rows with source_id pointing here.';
comment on column inv.stock_adjustments.adjustment_account_id is
  'The contra account the value hit. Defaults to the INVENTORY_ADJUSTMENT setting account.';

create index if not exists stock_adjustments_entity_date_idx
  on inv.stock_adjustments (entity_id, adjustment_date desc);

select app.enable_updated_at('inv.stock_adjustments');
select app.enable_audit('inv.stock_adjustments');
select app.enforce_rls_everywhere();
select app.apply_entity_read_policy('inv.stock_adjustments'::regclass);

-- Written only by inv.save_adjustment, which runs as its owner.
grant select on inv.stock_adjustments to skyjet_app, authenticated;

-- ---------------------------------------------------------------------------
-- inv.save_item — unchanged behaviour, plus the commercial fields
-- ---------------------------------------------------------------------------

create or replace function inv.save_item(p_entity_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_id           uuid := nullif(p_payload ->> 'item_id', '')::uuid;
  v_part         text := btrim(coalesce(p_payload ->> 'part_number', ''));
  v_description  text := btrim(coalesce(p_payload ->> 'description', ''));
  v_uom          text := coalesce(nullif(p_payload ->> 'uom_code', ''), 'EA');
  v_type         text := upper(coalesce(nullif(p_payload ->> 'item_type', ''), 'INVENTORY'));
  v_supplier     uuid := nullif(p_payload ->> 'preferred_supplier_id', '')::uuid;
  v_tracking     inv.tracking_mode;
  v_costing      inv.costing_method;
  v_stocked      boolean;
  v_sellable     boolean;
  v_purchasable  boolean;
  v_requires_cert boolean;
  v_requires_serial boolean;
begin
  perform app.require_permission(p_entity_id, 'masters.manage_items');

  if v_description = '' then
    raise exception 'description is required' using errcode = 'null_value_not_allowed';
  end if;

  if v_part = '' then
    v_part := upper(left(regexp_replace(v_description, '[^A-Za-z0-9]+', '-', 'g'), 24));
    if v_part = '' then
      v_part := 'ITEM';
    end if;
    if exists (select 1 from inv.items where entity_id = p_entity_id and part_number = v_part) then
      v_part := v_part || '-' || substr(gen_random_uuid()::text, 1, 4);
    end if;
  end if;

  if not exists (select 1 from inv.units_of_measure where code = v_uom and is_active) then
    raise exception 'Unknown unit of measure %', v_uom using errcode = 'foreign_key_violation';
  end if;

  -- A supplier from another entity would leak a name across the tenant line.
  if v_supplier is not null
     and not exists (
       select 1 from app.suppliers s where s.id = v_supplier and s.entity_id = p_entity_id
     ) then
    raise exception 'Preferred supplier does not belong to this entity'
      using errcode = 'foreign_key_violation';
  end if;

  -- Map QBO product types onto the aviation flags we already store.
  case v_type
    when 'INVENTORY' then
      v_stocked := true;
      v_sellable := true;
      v_purchasable := true;
      v_tracking := coalesce(
        nullif(p_payload ->> 'tracking_mode', '')::inv.tracking_mode,
        'SERIAL'::inv.tracking_mode
      );
    when 'NON_INVENTORY' then
      v_stocked := false;
      v_sellable := true;
      v_purchasable := true;
      v_tracking := 'NONE'::inv.tracking_mode;
    when 'SERVICE' then
      v_stocked := false;
      v_sellable := true;
      v_purchasable := false;
      v_tracking := 'NONE'::inv.tracking_mode;
    else
      raise exception 'item_type must be INVENTORY, NON_INVENTORY or SERVICE'
        using errcode = 'check_violation';
  end case;

  v_stocked := coalesce((p_payload ->> 'is_stocked')::boolean, v_stocked);
  v_sellable := coalesce((p_payload ->> 'is_sellable')::boolean, v_sellable);
  v_purchasable := coalesce((p_payload ->> 'is_purchasable')::boolean, v_purchasable);

  if nullif(p_payload ->> 'tracking_mode', '') is not null then
    v_tracking := (p_payload ->> 'tracking_mode')::inv.tracking_mode;
  end if;

  v_costing := case
    when v_tracking = 'SERIAL' then 'SPECIFIC'::inv.costing_method
    else coalesce(
      nullif(p_payload ->> 'costing_method', '')::inv.costing_method,
      'WEIGHTED_AVERAGE'::inv.costing_method
    )
  end;

  v_requires_cert := coalesce(
    (p_payload ->> 'requires_certificate')::boolean,
    v_tracking = 'SERIAL'
  );
  v_requires_serial := coalesce(
    (p_payload ->> 'requires_serial_on_receipt')::boolean,
    v_tracking = 'SERIAL'
  );

  if v_id is not null then
    update inv.items
       set part_number = v_part,
           description = v_description,
           sales_description = nullif(btrim(coalesce(p_payload ->> 'sales_description', '')), ''),
           purchase_description = nullif(btrim(coalesce(p_payload ->> 'purchase_description', '')), ''),
           sales_price = nullif(p_payload ->> 'sales_price', '')::numeric,
           purchase_cost = nullif(p_payload ->> 'purchase_cost', '')::numeric,
           preferred_supplier_id = v_supplier,
           category_id = nullif(p_payload ->> 'category_id', '')::uuid,
           manufacturer_id = nullif(p_payload ->> 'manufacturer_id', '')::uuid,
           manufacturer_part_number = nullif(p_payload ->> 'manufacturer_part_number', ''),
           nsn = nullif(p_payload ->> 'nsn', ''),
           uom_code = v_uom,
           tracking_mode = v_tracking,
           costing_method = v_costing,
           requires_certificate = v_requires_cert,
           requires_serial_on_receipt = v_requires_serial,
           is_life_limited = coalesce((p_payload ->> 'is_life_limited')::boolean, is_life_limited),
           shelf_life_days = nullif(p_payload ->> 'shelf_life_days', '')::integer,
           is_hazardous = coalesce((p_payload ->> 'is_hazardous')::boolean, is_hazardous),
           is_dangerous_goods = coalesce((p_payload ->> 'is_dangerous_goods')::boolean, is_dangerous_goods),
           un_number = nullif(p_payload ->> 'un_number', ''),
           is_export_controlled = coalesce((p_payload ->> 'is_export_controlled')::boolean, is_export_controlled),
           eccn = nullif(p_payload ->> 'eccn', ''),
           inventory_account_id = nullif(p_payload ->> 'inventory_account_id', '')::uuid,
           cogs_account_id = nullif(p_payload ->> 'cogs_account_id', '')::uuid,
           revenue_account_id = nullif(p_payload ->> 'revenue_account_id', '')::uuid,
           default_tax_code_id = nullif(p_payload ->> 'default_tax_code_id', '')::uuid,
           reorder_point = nullif(p_payload ->> 'reorder_point', '')::numeric,
           reorder_quantity = nullif(p_payload ->> 'reorder_quantity', '')::numeric,
           lead_time_days = nullif(p_payload ->> 'lead_time_days', '')::integer,
           is_stocked = v_stocked,
           is_sellable = v_sellable,
           is_purchasable = v_purchasable,
           is_active = coalesce((p_payload ->> 'is_active')::boolean, is_active),
           updated_by = app.acting_user_id()
     where id = v_id and entity_id = p_entity_id;
    if not found then
      raise exception 'Item was not found' using errcode = 'no_data_found';
    end if;
    return v_id;
  end if;

  insert into inv.items (
    entity_id, part_number, description, sales_description, purchase_description,
    sales_price, purchase_cost, preferred_supplier_id, category_id, manufacturer_id,
    manufacturer_part_number, nsn, uom_code, tracking_mode, costing_method,
    requires_certificate, requires_serial_on_receipt, is_life_limited,
    shelf_life_days, is_hazardous, is_dangerous_goods, un_number,
    is_export_controlled, eccn, inventory_account_id, cogs_account_id,
    revenue_account_id, default_tax_code_id, reorder_point, reorder_quantity,
    lead_time_days, is_stocked, is_sellable, is_purchasable,
    created_by, updated_by
  ) values (
    p_entity_id, v_part, v_description,
    nullif(btrim(coalesce(p_payload ->> 'sales_description', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'purchase_description', '')), ''),
    nullif(p_payload ->> 'sales_price', '')::numeric,
    nullif(p_payload ->> 'purchase_cost', '')::numeric,
    v_supplier,
    nullif(p_payload ->> 'category_id', '')::uuid,
    nullif(p_payload ->> 'manufacturer_id', '')::uuid,
    nullif(p_payload ->> 'manufacturer_part_number', ''),
    nullif(p_payload ->> 'nsn', ''),
    v_uom, v_tracking, v_costing,
    v_requires_cert, v_requires_serial,
    coalesce((p_payload ->> 'is_life_limited')::boolean, false),
    nullif(p_payload ->> 'shelf_life_days', '')::integer,
    coalesce((p_payload ->> 'is_hazardous')::boolean, false),
    coalesce((p_payload ->> 'is_dangerous_goods')::boolean, false),
    nullif(p_payload ->> 'un_number', ''),
    coalesce((p_payload ->> 'is_export_controlled')::boolean, false),
    nullif(p_payload ->> 'eccn', ''),
    nullif(p_payload ->> 'inventory_account_id', '')::uuid,
    nullif(p_payload ->> 'cogs_account_id', '')::uuid,
    nullif(p_payload ->> 'revenue_account_id', '')::uuid,
    nullif(p_payload ->> 'default_tax_code_id', '')::uuid,
    nullif(p_payload ->> 'reorder_point', '')::numeric,
    nullif(p_payload ->> 'reorder_quantity', '')::numeric,
    nullif(p_payload ->> 'lead_time_days', '')::integer,
    v_stocked, v_sellable, v_purchasable,
    app.acting_user_id(), app.acting_user_id()
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function inv.save_item(uuid, jsonb) is
  'Creates or amends a product/part. item_type INVENTORY | NON_INVENTORY | SERVICE mirrors QuickBooks Online product types.';

-- ---------------------------------------------------------------------------
-- inv.save_adjustment — now writes a header, then posts the movement against it
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
  v_reference     text := nullif(btrim(coalesce(p_payload ->> 'reference', '')), '');
  v_reason        text := upper(coalesce(nullif(btrim(p_payload ->> 'reason'), ''), 'OTHER'));
  v_account_id    uuid := nullif(p_payload ->> 'adjustment_account_id', '')::uuid;
  v_date          date := coalesce(
    nullif(p_payload ->> 'movement_date', '')::date,
    current_date
  );
  v_direction     text := upper(btrim(coalesce(p_payload ->> 'direction', '')));
  v_qty           app.quantity;
  v_type          inv.movement_type;
  v_adjustment_id uuid;
  v_next          integer;
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

  if v_reason not in
     ('SHRINKAGE', 'DAMAGED', 'EXPIRED', 'STOCK_COUNT', 'SUPPLIES_USED', 'FOUND', 'OTHER') then
    raise exception 'Unknown adjustment reason %', v_reason using errcode = 'check_violation';
  end if;

  if v_account_id is null then
    v_account_id := gl.setting_account(p_entity_id, 'INVENTORY_ADJUSTMENT');
    if v_account_id is null then
      raise exception 'No inventory adjustment account is configured for this entity'
        using errcode = 'null_value_not_allowed';
    end if;
  elsif not exists (
    select 1 from gl.accounts a where a.id = v_account_id and a.entity_id = p_entity_id
  ) then
    raise exception 'Adjustment account does not belong to this entity'
      using errcode = 'foreign_key_violation';
  end if;

  -- References are per entity and readable, because someone will quote one
  -- back over the phone when they query a write-off.
  if v_reference is null then
    select coalesce(max((substring(reference from '^ADJ-([0-9]+)$'))::integer), 0) + 1
      into v_next
      from inv.stock_adjustments
     where entity_id = p_entity_id
       and reference ~ '^ADJ-[0-9]+$';
    v_reference := 'ADJ-' || lpad(coalesce(v_next, 1)::text, 4, '0');
  elsif exists (
    select 1 from inv.stock_adjustments
     where entity_id = p_entity_id and reference = v_reference
  ) then
    raise exception 'Adjustment reference % has already been used', v_reference
      using errcode = 'unique_violation';
  end if;

  insert into inv.stock_adjustments (
    entity_id, reference, adjustment_date, reason, adjustment_account_id, notes,
    created_by, updated_by
  ) values (
    p_entity_id, v_reference, v_date, v_reason, v_account_id, v_notes,
    app.acting_user_id(), app.acting_user_id()
  )
  returning id into v_adjustment_id;

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
    p_offset_account_id => v_account_id,
    p_source_type      => 'STOCK_ADJUSTMENT',
    p_source_id        => v_adjustment_id,
    p_reference        => v_reference,
    p_notes            => v_notes
  );

  return v_ledger_id;
end;
$$;

comment on function inv.save_adjustment(uuid, jsonb) is
  'Writes an inv.stock_adjustments header and posts the ADJUSTMENT_IN or ADJUSTMENT_OUT against it. Requires inv.adjust_stock.';
