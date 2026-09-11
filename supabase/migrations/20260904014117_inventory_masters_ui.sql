-- ===========================================================================
-- Inventory and vendor master-data write path
--
-- Tables already exist (0003). The application role has no DML under RLS, so
-- creates go through SECURITY DEFINER functions — same pattern as
-- app.save_customer. This unlocks the QBO-shaped Products and Vendors UI.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

-- ---------------------------------------------------------------------------
-- Suppliers (Vendors in QuickBooks Online)
-- ---------------------------------------------------------------------------

create or replace function app.save_supplier(p_entity_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_id       uuid := nullif(p_payload ->> 'supplier_id', '')::uuid;
  v_code     text := btrim(coalesce(p_payload ->> 'code', ''));
  v_name     text := btrim(coalesce(p_payload ->> 'legal_name', ''));
  v_currency char(3);
  v_status   text := coalesce(nullif(p_payload ->> 'approval_status', ''), 'PENDING');
begin
  perform app.require_permission(p_entity_id, 'masters.manage_suppliers');

  if v_name = '' then
    raise exception 'legal_name is required' using errcode = 'null_value_not_allowed';
  end if;

  if v_status not in ('PENDING', 'APPROVED', 'SUSPENDED', 'BLACKLISTED') then
    raise exception 'Invalid approval status' using errcode = 'check_violation';
  end if;

  if v_status = 'APPROVED' then
    perform app.require_permission(p_entity_id, 'masters.approve_supplier');
  end if;

  select coalesce(nullif(p_payload ->> 'currency_code', ''), e.base_currency_code)
    into v_currency
    from app.entities e
   where e.id = p_entity_id;

  if v_code = '' then
    v_code := upper(left(regexp_replace(v_name, '[^A-Za-z0-9]+', '', 'g'), 8));
    if v_code = '' then
      v_code := 'VEND';
    end if;
    if exists (select 1 from app.suppliers where entity_id = p_entity_id and code = v_code) then
      v_code := v_code || '-' || substr(gen_random_uuid()::text, 1, 4);
    end if;
  end if;

  if v_id is not null then
    update app.suppliers
       set code = v_code,
           legal_name = v_name,
           trading_name = nullif(p_payload ->> 'trading_name', ''),
           tax_pin = nullif(p_payload ->> 'tax_pin', ''),
           currency_code = v_currency,
           payment_terms_id = nullif(p_payload ->> 'payment_terms_id', '')::uuid,
           email = nullif(p_payload ->> 'email', ''),
           phone = nullif(p_payload ->> 'phone', ''),
           notes = nullif(p_payload ->> 'notes', ''),
           is_foreign = coalesce((p_payload ->> 'is_foreign')::boolean, is_foreign),
           approval_status = v_status,
           approved_at = case
             when v_status = 'APPROVED' and approval_status is distinct from 'APPROVED'
               then now()
             when v_status <> 'APPROVED' then null
             else approved_at
           end,
           approved_by = case
             when v_status = 'APPROVED' and approval_status is distinct from 'APPROVED'
               then app.acting_user_id()
             when v_status <> 'APPROVED' then null
             else approved_by
           end,
           is_active = coalesce((p_payload ->> 'is_active')::boolean, is_active),
           updated_by = app.acting_user_id()
     where id = v_id and entity_id = p_entity_id;
    if not found then
      raise exception 'Supplier was not found' using errcode = 'no_data_found';
    end if;
    return v_id;
  end if;

  insert into app.suppliers (
    entity_id, code, legal_name, trading_name, tax_pin, currency_code,
    payment_terms_id, email, phone, notes, is_foreign, approval_status,
    approved_at, approved_by, created_by, updated_by
  ) values (
    p_entity_id, v_code, v_name, nullif(p_payload ->> 'trading_name', ''),
    nullif(p_payload ->> 'tax_pin', ''), v_currency,
    nullif(p_payload ->> 'payment_terms_id', '')::uuid,
    nullif(p_payload ->> 'email', ''), nullif(p_payload ->> 'phone', ''),
    nullif(p_payload ->> 'notes', ''),
    coalesce((p_payload ->> 'is_foreign')::boolean, false),
    v_status,
    case when v_status = 'APPROVED' then now() else null end,
    case when v_status = 'APPROVED' then app.acting_user_id() else null end,
    app.acting_user_id(), app.acting_user_id()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Item categories
-- ---------------------------------------------------------------------------

create or replace function inv.save_item_category(p_entity_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_id   uuid := nullif(p_payload ->> 'category_id', '')::uuid;
  v_code text := btrim(coalesce(p_payload ->> 'code', ''));
  v_name text := btrim(coalesce(p_payload ->> 'name', ''));
begin
  perform app.require_permission(p_entity_id, 'masters.manage_items');

  if v_name = '' then
    raise exception 'name is required' using errcode = 'null_value_not_allowed';
  end if;

  if v_code = '' then
    v_code := upper(left(regexp_replace(v_name, '[^A-Za-z0-9]+', '', 'g'), 12));
    if v_code = '' then
      v_code := 'CAT';
    end if;
    if exists (select 1 from inv.item_categories where entity_id = p_entity_id and code = v_code) then
      v_code := v_code || '-' || substr(gen_random_uuid()::text, 1, 4);
    end if;
  end if;

  if v_id is not null then
    update inv.item_categories
       set code = v_code,
           name = v_name,
           parent_id = nullif(p_payload ->> 'parent_id', '')::uuid,
           ata_chapter = nullif(p_payload ->> 'ata_chapter', ''),
           inventory_account_id = nullif(p_payload ->> 'inventory_account_id', '')::uuid,
           cogs_account_id = nullif(p_payload ->> 'cogs_account_id', '')::uuid,
           revenue_account_id = nullif(p_payload ->> 'revenue_account_id', '')::uuid,
           is_active = coalesce((p_payload ->> 'is_active')::boolean, is_active),
           updated_by = app.acting_user_id()
     where id = v_id and entity_id = p_entity_id;
    if not found then
      raise exception 'Category was not found' using errcode = 'no_data_found';
    end if;
    return v_id;
  end if;

  insert into inv.item_categories (
    entity_id, code, name, parent_id, ata_chapter,
    inventory_account_id, cogs_account_id, revenue_account_id,
    created_by, updated_by
  ) values (
    p_entity_id, v_code, v_name,
    nullif(p_payload ->> 'parent_id', '')::uuid,
    nullif(p_payload ->> 'ata_chapter', ''),
    nullif(p_payload ->> 'inventory_account_id', '')::uuid,
    nullif(p_payload ->> 'cogs_account_id', '')::uuid,
    nullif(p_payload ->> 'revenue_account_id', '')::uuid,
    app.acting_user_id(), app.acting_user_id()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Manufacturers
-- ---------------------------------------------------------------------------

create or replace function inv.save_manufacturer(p_entity_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_id   uuid := nullif(p_payload ->> 'manufacturer_id', '')::uuid;
  v_code text := btrim(coalesce(p_payload ->> 'code', ''));
  v_name text := btrim(coalesce(p_payload ->> 'name', ''));
begin
  perform app.require_permission(p_entity_id, 'masters.manage_items');

  if v_name = '' then
    raise exception 'name is required' using errcode = 'null_value_not_allowed';
  end if;

  if v_code = '' then
    v_code := upper(left(regexp_replace(v_name, '[^A-Za-z0-9]+', '', 'g'), 10));
    if v_code = '' then
      v_code := 'MFG';
    end if;
    if exists (select 1 from inv.manufacturers where entity_id = p_entity_id and code = v_code) then
      v_code := v_code || '-' || substr(gen_random_uuid()::text, 1, 4);
    end if;
  end if;

  if v_id is not null then
    update inv.manufacturers
       set code = v_code,
           name = v_name,
           cage_code = nullif(p_payload ->> 'cage_code', ''),
           country_code = nullif(p_payload ->> 'country_code', '')::char(2),
           is_active = coalesce((p_payload ->> 'is_active')::boolean, is_active),
           updated_by = app.acting_user_id()
     where id = v_id and entity_id = p_entity_id;
    if not found then
      raise exception 'Manufacturer was not found' using errcode = 'no_data_found';
    end if;
    return v_id;
  end if;

  insert into inv.manufacturers (
    entity_id, code, name, cage_code, country_code, created_by, updated_by
  ) values (
    p_entity_id, v_code, v_name,
    nullif(p_payload ->> 'cage_code', ''),
    nullif(p_payload ->> 'country_code', '')::char(2),
    app.acting_user_id(), app.acting_user_id()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Warehouses
-- ---------------------------------------------------------------------------

create or replace function inv.save_warehouse(p_entity_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_id   uuid := nullif(p_payload ->> 'warehouse_id', '')::uuid;
  v_code text := btrim(coalesce(p_payload ->> 'code', ''));
  v_name text := btrim(coalesce(p_payload ->> 'name', ''));
  v_inv  uuid;
begin
  perform app.require_permission(p_entity_id, 'masters.manage_items');

  if v_name = '' then
    raise exception 'name is required' using errcode = 'null_value_not_allowed';
  end if;

  if v_code = '' then
    v_code := upper(left(regexp_replace(v_name, '[^A-Za-z0-9]+', '', 'g'), 8));
    if v_code = '' then
      v_code := 'WH';
    end if;
    if exists (select 1 from inv.warehouses where entity_id = p_entity_id and code = v_code) then
      v_code := v_code || '-' || substr(gen_random_uuid()::text, 1, 4);
    end if;
  end if;

  v_inv := coalesce(
    nullif(p_payload ->> 'inventory_account_id', '')::uuid,
    gl.setting_account(p_entity_id, 'DEFAULT_INVENTORY')
  );

  if v_id is not null then
    update inv.warehouses
       set code = v_code,
           name = v_name,
           inventory_account_id = coalesce(v_inv, inventory_account_id),
           is_consignment = coalesce((p_payload ->> 'is_consignment')::boolean, is_consignment),
           is_active = coalesce((p_payload ->> 'is_active')::boolean, is_active),
           updated_by = app.acting_user_id()
     where id = v_id and entity_id = p_entity_id;
    if not found then
      raise exception 'Warehouse was not found' using errcode = 'no_data_found';
    end if;
    return v_id;
  end if;

  insert into inv.warehouses (
    entity_id, code, name, inventory_account_id, is_consignment, created_by, updated_by
  ) values (
    p_entity_id, v_code, v_name, v_inv,
    coalesce((p_payload ->> 'is_consignment')::boolean, false),
    app.acting_user_id(), app.acting_user_id()
  )
  returning id into v_id;

  -- Default stock bin so the warehouse is usable immediately.
  insert into inv.bins (entity_id, warehouse_id, code, name, bin_type, created_by, updated_by)
  values (p_entity_id, v_id, 'MAIN', 'Main Bin', 'STOCK', app.acting_user_id(), app.acting_user_id())
  on conflict do nothing;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Products / parts (QBO: Inventory, Non-inventory, Service)
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
    entity_id, part_number, description, category_id, manufacturer_id,
    manufacturer_part_number, nsn, uom_code, tracking_mode, costing_method,
    requires_certificate, requires_serial_on_receipt, is_life_limited,
    shelf_life_days, is_hazardous, is_dangerous_goods, un_number,
    is_export_controlled, eccn, inventory_account_id, cogs_account_id,
    revenue_account_id, default_tax_code_id, reorder_point, reorder_quantity,
    lead_time_days, is_stocked, is_sellable, is_purchasable,
    created_by, updated_by
  ) values (
    p_entity_id, v_part, v_description,
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

comment on function app.save_supplier(uuid, jsonb) is
  'Creates or amends a supplier (vendor). APPROVED status requires masters.approve_supplier.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

grant execute on function
  app.save_supplier(uuid, jsonb),
  inv.save_item_category(uuid, jsonb),
  inv.save_manufacturer(uuid, jsonb),
  inv.save_warehouse(uuid, jsonb),
  inv.save_item(uuid, jsonb)
to skyjet_app;
