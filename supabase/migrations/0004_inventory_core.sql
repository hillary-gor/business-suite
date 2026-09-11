-- ===========================================================================
-- 0004_inventory_core.sql
--
-- The inventory sub-ledger.
--
-- Two ledgers are maintained here and they must agree at all times:
--   * a quantity ledger, which says where every part is;
--   * a value ledger, which says what it cost.
--
-- The value ledger is a subordinate of the general ledger. Every valued stock
-- movement carries the identifier of the journal entry that recorded it, and
-- inv.verify_inventory_ties_to_gl() proves the two agree. If they ever do not,
-- that is a defect of the first order and the test suite fails.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

-- ---------------------------------------------------------------------------
-- Condition and certification reference data
--
-- In this trade, condition is not a note. It is a price, a market and a legal
-- statement about whether the part may be fitted to an aircraft.
-- ---------------------------------------------------------------------------

create table inv.condition_codes (
  code            text primary key check (code ~ '^[A-Z]{2,4}$'),
  name            text not null,
  description     text not null default '',
  is_serviceable  boolean not null,
  is_installable  boolean not null,
  sort_order      smallint not null default 0
);

comment on column inv.condition_codes.is_installable is
  'Whether a part in this condition may be released to service. Unserviceable stock has value but may not be sold as fit for use.';

insert into inv.condition_codes (code, name, description, is_serviceable, is_installable, sort_order) values
  ('NE',  'New',                 'Unused, with manufacturer certification and full traceability to the OEM.', true,  true,  10),
  ('NS',  'New Surplus',         'Unused but sold from surplus stock rather than direct from the manufacturer.', true, true, 20),
  ('OH',  'Overhauled',          'Disassembled, inspected and restored to OEM limits by an approved facility.', true, true, 30),
  ('SV',  'Serviceable',         'Inspected and certified fit for installation.', true, true, 40),
  ('RP',  'Repaired',            'Returned to serviceable condition by repair rather than full overhaul.', true, true, 50),
  ('IN',  'Inspected',           'Inspected and found to meet requirements, pending certification.', true, false, 60),
  ('AR',  'As Removed',          'Removed from an aircraft with unknown serviceability. Requires inspection before use.', false, false, 70),
  ('US',  'Unserviceable',       'Known not to meet requirements. Repairable but not installable.', false, false, 80),
  ('BER', 'Beyond Economic Repair', 'Repair cost exceeds value. Held for teardown or disposal only.', false, false, 90),
  ('SCR', 'Scrap',               'Mutilated or condemned. Must never re-enter the supply chain.', false, false, 99)
on conflict (code) do nothing;

create table inv.certificate_types (
  code                 text primary key check (code ~ '^[A-Z0-9_]{2,32}$'),
  name                 text not null,
  issuing_authority    text,
  proves_airworthiness boolean not null default false,
  description          text not null default ''
);

insert into inv.certificate_types (code, name, issuing_authority, proves_airworthiness, description) values
  ('FAA_8130_3',   'FAA Form 8130-3 Authorised Release Certificate', 'FAA',  true,
   'The primary US airworthiness release document.'),
  ('EASA_FORM_1',  'EASA Form 1 Authorised Release Certificate',     'EASA', true,
   'The European equivalent of the 8130-3.'),
  ('KCAA_FORM_1',  'KCAA Form 1 Authorised Release Certificate',     'KCAA', true,
   'Kenya Civil Aviation Authority release certificate.'),
  ('TCCA_24_0078', 'TCCA Form One',                                  'TCCA', true,
   'Transport Canada authorised release certificate.'),
  ('COC',          'Certificate of Conformity',                      null,   false,
   'Manufacturer statement that the item conforms to specification.'),
  ('ATA_106',      'ATA Specification 106 Part or Material Certification', null, false,
   'Supplier declaration of part origin and condition, used for traceability rather than release.'),
  ('TEARDOWN',     'Teardown or Removal Report',                     null,   false,
   'Records the aircraft, position and reason for removal. Establishes provenance for as-removed parts.'),
  ('TRACE',        'Trace Documentation',                            null,   false,
   'Chain-of-custody paperwork back to a recognised source.'),
  ('DGD',          'Dangerous Goods Declaration',                    null,   false,
   'Required for shipment of hazardous items.')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Lots
-- ---------------------------------------------------------------------------

create table inv.stock_lots (
  id               uuid    primary key default gen_random_uuid(),
  entity_id        uuid    not null references app.entities (id) on delete restrict,
  item_id          uuid    not null references inv.items (id) on delete restrict,
  lot_number       text    not null,
  condition_code   text    not null references inv.condition_codes (code),
  manufacture_date date,
  expiry_date      date,
  received_date    date    not null default current_date,
  supplier_id      uuid    references app.suppliers (id) on delete restrict,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (entity_id, item_id, lot_number),
  check (expiry_date is null or manufacture_date is null or expiry_date >= manufacture_date)
);

create index stock_lots_expiry_idx on inv.stock_lots (entity_id, expiry_date)
  where expiry_date is not null;

-- ---------------------------------------------------------------------------
-- Serialised units
--
-- One row per physical part. This is the table that lets the business answer
-- "where did this specific component come from, what did it cost, what
-- paperwork does it carry, and who did we sell it to" - which is the question
-- an airworthiness investigation actually asks.
-- ---------------------------------------------------------------------------

create type inv.stock_unit_status as enum (
  'ON_HAND',       -- physically present and available
  'ALLOCATED',     -- reserved against a sales order, still physically present
  'PICKED',        -- removed from the bin, staged for despatch
  'IN_TRANSIT',    -- despatched, not yet delivered
  'DELIVERED',     -- title passed to the customer
  'QUARANTINE',    -- present but unavailable pending inspection or paperwork
  'IN_REPAIR',     -- away at a repair facility
  'CONSUMED',      -- issued internally
  'SCRAPPED',      -- condemned
  'RETURNED'       -- returned to a supplier
);

create table inv.stock_units (
  id                 uuid    primary key default gen_random_uuid(),
  entity_id          uuid    not null references app.entities (id) on delete restrict,
  item_id            uuid    not null references inv.items (id) on delete restrict,
  serial_number      text    not null,
  batch_number       text,
  lot_id             uuid    references inv.stock_lots (id) on delete restrict,

  condition_code     text    not null references inv.condition_codes (code),
  status             inv.stock_unit_status not null default 'ON_HAND',

  warehouse_id       uuid    references inv.warehouses (id) on delete restrict,
  bin_id             uuid    references inv.bins (id) on delete restrict,

  manufacture_date   date,
  expiry_date        date,
  last_overhaul_date date,
  -- Life-limited parts are retired on hours or cycles, not on a date.
  total_time_hours   numeric(12, 2) check (total_time_hours is null or total_time_hours >= 0),
  total_cycles       integer check (total_cycles is null or total_cycles >= 0),
  life_limit_hours   numeric(12, 2),
  life_limit_cycles  integer,

  -- Acquisition. unit_cost_base is the number that flows to cost of sales when
  -- this unit is sold, because a serialised part is costed by specific
  -- identification.
  received_date      date    not null default current_date,
  supplier_id        uuid    references app.suppliers (id) on delete restrict,
  acquisition_currency char(3) references app.currencies (code),
  acquisition_cost   app.money_amount check (acquisition_cost is null or acquisition_cost >= 0),
  unit_cost_base     app.money_amount not null default 0 check (unit_cost_base >= 0),
  landed_cost_base   app.money_amount not null default 0 check (landed_cost_base >= 0),

  -- Disposition
  sold_at            timestamptz,
  customer_id        uuid    references app.customers (id) on delete restrict,

  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  updated_by         uuid,

  unique (entity_id, item_id, serial_number),
  check (expiry_date is null or manufacture_date is null or expiry_date >= manufacture_date),
  -- Anything physically in the building must have a location.
  constraint stock_units_present_has_location check (
    status not in ('ON_HAND', 'ALLOCATED', 'PICKED', 'QUARANTINE')
    or (warehouse_id is not null and bin_id is not null)
  )
);

comment on table inv.stock_units is
  'One physical serialised part. Its cost travels with it: the value posted to cost of sales is this row unit_cost_base plus landed_cost_base.';
comment on column inv.stock_units.landed_cost_base is
  'Freight, duty, clearing and handling apportioned to this unit. Part of inventory value, not an expense of the period.';
comment on column inv.stock_units.total_time_hours is
  'Accumulated time in service. Meaningless for new parts, essential for rotables.';

create index stock_units_item_status_idx
  on inv.stock_units (entity_id, item_id, status)
  where status in ('ON_HAND', 'ALLOCATED');
create index stock_units_location_idx on inv.stock_units (entity_id, warehouse_id, bin_id);
create index stock_units_serial_idx on inv.stock_units (entity_id, serial_number);
create index stock_units_expiry_idx on inv.stock_units (entity_id, expiry_date)
  where expiry_date is not null;
create index stock_units_customer_idx on inv.stock_units (entity_id, customer_id)
  where customer_id is not null;

-- Close the last ledger dimension foreign key, now that stock units exist.
alter table gl.journal_entry_line
  add constraint jel_stock_unit_fk
    foreign key (stock_unit_id) references inv.stock_units (id) on delete restrict;

-- A unit's condition may not silently improve. Moving from unserviceable to
-- serviceable is a certification event and must be accompanied by a new
-- certificate, so it is refused here and handled by inv.certify_unit().
create or replace function inv.fn_stock_unit_condition_guard()
returns trigger
language plpgsql
as $$
declare
  v_was_installable boolean;
  v_now_installable boolean;
begin
  if new.condition_code = old.condition_code then
    return new;
  end if;

  select is_installable into v_was_installable
    from inv.condition_codes where code = old.condition_code;
  select is_installable into v_now_installable
    from inv.condition_codes where code = new.condition_code;

  if v_now_installable and not v_was_installable
     and coalesce(current_setting('app.allow_condition_upgrade', true), '') <> 'on' then
    raise exception
      'Stock unit % cannot move from % to % directly. Upgrading condition requires a certification event.',
      new.serial_number, old.condition_code, new.condition_code
      using errcode = 'restrict_violation';
  end if;

  if old.condition_code = 'SCR' then
    raise exception 'Stock unit % is scrapped and may not be reinstated.', new.serial_number
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger stock_units_condition_guard
  before update on inv.stock_units
  for each row execute function inv.fn_stock_unit_condition_guard();

-- ---------------------------------------------------------------------------
-- Certificates
-- ---------------------------------------------------------------------------

create table inv.certificates (
  id                 uuid    primary key default gen_random_uuid(),
  entity_id          uuid    not null references app.entities (id) on delete restrict,
  certificate_type   text    not null references inv.certificate_types (code),
  certificate_number text    not null,
  issued_by          text    not null,
  issuing_approval_no text,
  issue_date         date    not null,
  expiry_date        date,
  attachment_id      uuid    references app.attachments (id) on delete restrict,

  stock_unit_id      uuid    references inv.stock_units (id) on delete restrict,
  stock_lot_id       uuid    references inv.stock_lots (id) on delete restrict,

  verified_at        timestamptz,
  verified_by        uuid    references app.users (id),
  notes              text,
  created_at         timestamptz not null default now(),
  created_by         uuid,

  check (expiry_date is null or expiry_date >= issue_date),
  constraint certificates_attach_to_something check (
    stock_unit_id is not null or stock_lot_id is not null
  )
);

comment on column inv.certificates.attachment_id is
  'The scanned document. A certificate record without the document behind it is an assertion, not evidence.';
comment on column inv.certificates.verified_at is
  'Set when a qualified person has compared the physical document against this record.';

create index certificates_unit_idx on inv.certificates (stock_unit_id);
create index certificates_lot_idx on inv.certificates (stock_lot_id);
create unique index certificates_number_idx
  on inv.certificates (entity_id, certificate_type, certificate_number, coalesce(stock_unit_id, stock_lot_id));

-- Answers "may this specific unit be sold as airworthy today".
create or replace function inv.unit_is_releasable(p_stock_unit_id uuid, p_as_at date default current_date)
returns boolean
language sql
stable
as $$
  select
    c.is_installable
    and (u.expiry_date is null or u.expiry_date >= p_as_at)
    and (
      not i.requires_certificate
      or exists (
        select 1
          from inv.certificates cert
          join inv.certificate_types ct on ct.code = cert.certificate_type
         where cert.stock_unit_id = u.id
           and ct.proves_airworthiness
           and (cert.expiry_date is null or cert.expiry_date >= p_as_at)
      )
    )
    and (u.life_limit_hours is null or coalesce(u.total_time_hours, 0) < u.life_limit_hours)
    and (u.life_limit_cycles is null or coalesce(u.total_cycles, 0) < u.life_limit_cycles)
  from inv.stock_units u
  join inv.items i on i.id = u.item_id
  join inv.condition_codes c on c.code = u.condition_code
  where u.id = p_stock_unit_id;
$$;

comment on function inv.unit_is_releasable(uuid, date) is
  'Condition installable, not expired, within life limits, and carrying a valid airworthiness certificate when the part requires one.';

create or replace function inv.assert_unit_releasable(p_stock_unit_id uuid, p_as_at date default current_date)
returns void
language plpgsql
stable
as $$
declare
  v_serial text;
begin
  if not coalesce(inv.unit_is_releasable(p_stock_unit_id, p_as_at), false) then
    select serial_number into v_serial from inv.stock_units where id = p_stock_unit_id;
    raise exception
      'Stock unit % is not releasable as at %: check condition, expiry, life limits and airworthiness certification.',
      coalesce(v_serial, p_stock_unit_id::text), p_as_at
      using errcode = 'restrict_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The stock ledger
--
-- Append-only, exactly like the general ledger, and for the same reason: the
-- history of where stock went is evidence.
-- ---------------------------------------------------------------------------

create type inv.movement_type as enum (
  'OPENING',
  'RECEIPT',
  'ISSUE',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'REVALUATION',
  'SCRAP',
  'CUSTOMER_RETURN',
  'SUPPLIER_RETURN'
);

create table inv.stock_ledger (
  id                bigint  generated always as identity primary key,
  entity_id         uuid    not null references app.entities (id) on delete restrict,
  item_id           uuid    not null references inv.items (id) on delete restrict,
  warehouse_id      uuid    not null references inv.warehouses (id) on delete restrict,
  bin_id            uuid    references inv.bins (id) on delete restrict,
  stock_unit_id     uuid    references inv.stock_units (id) on delete restrict,
  stock_lot_id      uuid    references inv.stock_lots (id) on delete restrict,

  movement_type     inv.movement_type not null,
  movement_date     date    not null,
  occurred_at       timestamptz not null default now(),

  -- Signed. Positive increases stock, negative decreases it. Storing the sign
  -- rather than a direction flag means quantity on hand is a plain SUM and
  -- cannot be got wrong by forgetting to branch on the direction.
  quantity          app.quantity not null check (quantity <> 0),
  unit_cost_base    app.money_amount not null default 0 check (unit_cost_base >= 0),
  value_base        app.money_amount not null default 0,

  -- Invariant 8: a movement that changes inventory value carries the journal
  -- entry that recorded that change, written in the same transaction.
  journal_entry_id  uuid    references gl.journal_entry (id) on delete restrict,

  source_type       text    not null default 'MANUAL',
  source_id         uuid,
  source_line_id    uuid,
  reference         text,
  notes             text,
  created_at        timestamptz not null default now(),
  created_by        uuid    references app.users (id),

  constraint stock_ledger_value_has_journal check (
    value_base = 0 or journal_entry_id is not null
  ),
  -- Value moves in the same direction as quantity. A receipt cannot reduce the
  -- value of stock, and an issue cannot increase it.
  constraint stock_ledger_value_sign_matches_quantity check (
    value_base = 0 or sign(value_base) = sign(quantity)
  ),
  -- A serialised movement is always exactly one unit; that is what serialised
  -- means.
  constraint stock_ledger_serial_is_single_unit check (
    stock_unit_id is null or abs(quantity) = 1
  )
);

comment on table inv.stock_ledger is
  'Append-only quantity and value movement log. inv.stock_balances is derived from it and can always be rebuilt.';

create index stock_ledger_item_location_idx
  on inv.stock_ledger (entity_id, item_id, warehouse_id, movement_date);
create index stock_ledger_unit_idx on inv.stock_ledger (stock_unit_id) where stock_unit_id is not null;
create index stock_ledger_lot_idx on inv.stock_ledger (stock_lot_id) where stock_lot_id is not null;
create index stock_ledger_journal_idx on inv.stock_ledger (journal_entry_id);
create index stock_ledger_source_idx on inv.stock_ledger (entity_id, source_type, source_id);
create index stock_ledger_date_idx on inv.stock_ledger (entity_id, movement_date);

select app.enable_append_only('inv.stock_ledger');

-- ---------------------------------------------------------------------------
-- Derived balances
-- ---------------------------------------------------------------------------

create table inv.stock_balances (
  entity_id         uuid not null references app.entities (id) on delete restrict,
  item_id           uuid not null references inv.items (id) on delete restrict,
  warehouse_id      uuid not null references inv.warehouses (id) on delete restrict,
  quantity_on_hand  app.quantity     not null default 0,
  value_base        app.money_amount not null default 0,
  average_cost_base app.money_amount not null default 0,
  last_movement_at  timestamptz,
  updated_at        timestamptz not null default now(),
  primary key (entity_id, item_id, warehouse_id)
);

comment on column inv.stock_balances.average_cost_base is
  'Weighted average unit cost, recomputed on every movement. Used to cost issues of non-serialised parts.';

create or replace function inv.fn_accumulate_stock_balance()
returns trigger
language plpgsql
as $$
declare
  v_qty   app.quantity;
  v_value app.money_amount;
  v_part  text;
  v_wh    text;
begin
  insert into inv.stock_balances as b (
    entity_id, item_id, warehouse_id, quantity_on_hand, value_base, average_cost_base, last_movement_at
  )
  values (
    new.entity_id, new.item_id, new.warehouse_id, new.quantity, new.value_base,
    case when new.quantity > 0 then round(new.value_base / new.quantity, 4) else 0 end,
    new.occurred_at
  )
  on conflict (entity_id, item_id, warehouse_id) do update
    set quantity_on_hand = b.quantity_on_hand + excluded.quantity_on_hand,
        value_base       = b.value_base + excluded.value_base,
        last_movement_at = excluded.last_movement_at,
        updated_at       = now()
  returning b.quantity_on_hand, b.value_base into v_qty, v_value;

  -- Negative stock is not an accounting adjustment, it is a count that is
  -- wrong. Refusing it here forces the discrepancy to be investigated at the
  -- moment it happens rather than discovered at year end.
  if v_qty < 0 then
    select i.part_number, w.code into v_part, v_wh
      from inv.items i, inv.warehouses w
     where i.id = new.item_id and w.id = new.warehouse_id;
    raise exception
      'Movement would drive % in warehouse % to % units. Negative stock is not permitted; investigate the count.',
      coalesce(v_part, new.item_id::text), coalesce(v_wh, new.warehouse_id::text), v_qty
      using errcode = 'check_violation';
  end if;

  -- Value must not survive the quantity going to zero, and cannot be negative.
  if v_qty = 0 and v_value <> 0 then
    raise exception
      'Stock of % in warehouse % is nil but carries a residual value of %. The costing of this movement is wrong.',
      new.item_id, new.warehouse_id, v_value
      using errcode = 'check_violation';
  end if;

  if v_value < 0 then
    raise exception 'Stock value for % in warehouse % would become negative (%).',
      new.item_id, new.warehouse_id, v_value
      using errcode = 'check_violation';
  end if;

  update inv.stock_balances
     set average_cost_base = case when v_qty > 0 then round(v_value / v_qty, 4) else 0 end
   where entity_id = new.entity_id
     and item_id = new.item_id
     and warehouse_id = new.warehouse_id;

  return null;
end;
$$;

create trigger stock_ledger_accumulate
  after insert on inv.stock_ledger
  for each row execute function inv.fn_accumulate_stock_balance();

create or replace function inv.rebuild_stock_balances(p_entity_id uuid)
returns bigint
language plpgsql
as $$
declare
  v_rows bigint;
begin
  delete from inv.stock_balances where entity_id = p_entity_id;

  insert into inv.stock_balances (
    entity_id, item_id, warehouse_id, quantity_on_hand, value_base, average_cost_base, last_movement_at
  )
  select l.entity_id, l.item_id, l.warehouse_id,
         sum(l.quantity),
         sum(l.value_base),
         case when sum(l.quantity) > 0 then round(sum(l.value_base) / sum(l.quantity), 4) else 0 end,
         max(l.occurred_at)
    from inv.stock_ledger l
   where l.entity_id = p_entity_id
   group by l.entity_id, l.item_id, l.warehouse_id;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- Costing
-- ---------------------------------------------------------------------------

create or replace function inv.current_average_cost(
  p_entity_id    uuid,
  p_item_id      uuid,
  p_warehouse_id uuid
)
returns app.money_amount
language sql
stable
as $$
  select coalesce(
    (select b.average_cost_base
       from inv.stock_balances b
      where b.entity_id = p_entity_id
        and b.item_id = p_item_id
        and b.warehouse_id = p_warehouse_id),
    0
  )::app.money_amount;
$$;

-- Determines what an outbound movement should be valued at. This is the single
-- place costing policy is decided; every issue path must call it rather than
-- forming its own opinion.
create or replace function inv.issue_cost(
  p_entity_id     uuid,
  p_item_id       uuid,
  p_warehouse_id  uuid,
  p_quantity      app.quantity,
  p_stock_unit_id uuid default null
)
returns app.money_amount
language plpgsql
stable
as $$
declare
  v_method inv.costing_method;
  v_unit   inv.stock_units%rowtype;
begin
  if p_quantity <= 0 then
    raise exception 'issue_cost expects a positive quantity, received %', p_quantity;
  end if;

  select costing_method into v_method from inv.items where id = p_item_id;
  if v_method is null then
    raise exception 'Item % does not exist', p_item_id using errcode = 'no_data_found';
  end if;

  if v_method = 'SPECIFIC' then
    if p_stock_unit_id is null then
      raise exception
        'Item % is costed by specific identification; the stock unit being issued must be supplied.',
        p_item_id
        using errcode = 'null_value_not_allowed';
    end if;

    select * into v_unit from inv.stock_units where id = p_stock_unit_id;
    if not found then
      raise exception 'Stock unit % does not exist', p_stock_unit_id using errcode = 'no_data_found';
    end if;
    if v_unit.item_id <> p_item_id then
      raise exception 'Stock unit % does not belong to item %', p_stock_unit_id, p_item_id;
    end if;

    return round(v_unit.unit_cost_base + v_unit.landed_cost_base, 4)::app.money_amount;
  end if;

  return round(
    inv.current_average_cost(p_entity_id, p_item_id, p_warehouse_id) * p_quantity, 4
  )::app.money_amount;
end;
$$;

comment on function inv.issue_cost(uuid, uuid, uuid, app.quantity, uuid) is
  'Total base-currency value of an outbound movement. Specific identification for serialised parts, weighted average otherwise.';

-- Resolves the inventory, cost of sales and revenue accounts for an item,
-- falling back item -> category -> entity default.
create or replace function inv.item_account(
  p_item_id uuid,
  p_role    text  -- 'INVENTORY', 'COGS' or 'REVENUE'
)
returns uuid
language plpgsql
stable
as $$
declare
  v_item     inv.items%rowtype;
  v_account  uuid;
  v_setting  text;
begin
  select * into v_item from inv.items where id = p_item_id;
  if not found then
    raise exception 'Item % does not exist', p_item_id using errcode = 'no_data_found';
  end if;

  v_account := case p_role
    when 'INVENTORY' then v_item.inventory_account_id
    when 'COGS'      then v_item.cogs_account_id
    when 'REVENUE'   then v_item.revenue_account_id
    else null
  end;

  if v_account is null and v_item.category_id is not null then
    select case p_role
             when 'INVENTORY' then c.inventory_account_id
             when 'COGS'      then c.cogs_account_id
             when 'REVENUE'   then c.revenue_account_id
           end
      into v_account
      from inv.item_categories c
     where c.id = v_item.category_id;
  end if;

  if v_account is null then
    v_setting := case p_role
      when 'INVENTORY' then 'DEFAULT_INVENTORY'
      when 'COGS'      then 'DEFAULT_COGS'
      when 'REVENUE'   then 'DEFAULT_REVENUE'
      else null
    end;
    if v_setting is null then
      raise exception 'Unknown account role %', p_role;
    end if;
    v_account := gl.setting_account(v_item.entity_id, v_setting);
  end if;

  return v_account;
end;
$$;

-- ---------------------------------------------------------------------------
-- The tie-out
--
-- The inventory sub-ledger and the general ledger inventory control accounts
-- must agree to the cent. This function is the proof, and the test suite runs
-- it after every scenario.
-- ---------------------------------------------------------------------------

create or replace function inv.verify_inventory_ties_to_gl(
  p_entity_id uuid,
  p_as_at     date default current_date
)
returns table (
  subledger_value app.money_amount,
  ledger_value    app.money_amount,
  difference      app.money_amount
)
language sql
stable
as $$
  with sub as (
    select coalesce(sum(l.value_base), 0)::app.money_amount as v
      from inv.stock_ledger l
      join inv.warehouses w on w.id = l.warehouse_id
     where l.entity_id = p_entity_id
       and l.movement_date <= p_as_at
       and not w.is_consignment
  ),
  led as (
    select coalesce(sum(jl.debit_base - jl.credit_base), 0)::app.money_amount as v
      from gl.journal_entry_line jl
      join gl.accounts a on a.id = jl.account_id
     where jl.entity_id = p_entity_id
       and jl.entry_date <= p_as_at
       and a.control_type = 'INVENTORY'
  )
  select sub.v, led.v, (sub.v - led.v)::app.money_amount
    from sub, led;
$$;

comment on function inv.verify_inventory_ties_to_gl(uuid, date) is
  'Difference must be exactly zero. Any other result is a defect. Consignment stock is excluded because it is held, not owned.';

-- Stock on hand with its airworthiness position resolved. This is the view the
-- sales desk needs: not "do we have one" but "do we have one we can sell".
create or replace view inv.v_stock_on_hand as
select
  u.entity_id,
  u.id                as stock_unit_id,
  u.item_id,
  i.part_number,
  i.description,
  u.serial_number,
  u.condition_code,
  cc.name             as condition_name,
  u.status,
  u.warehouse_id,
  w.code              as warehouse_code,
  u.bin_id,
  b.code              as bin_code,
  u.expiry_date,
  (u.unit_cost_base + u.landed_cost_base)::app.money_amount as total_cost_base,
  inv.unit_is_releasable(u.id) as is_releasable,
  exists (
    select 1
      from inv.certificates c
      join inv.certificate_types ct on ct.code = c.certificate_type
     where c.stock_unit_id = u.id and ct.proves_airworthiness
  ) as has_airworthiness_certificate
from inv.stock_units u
join inv.items i on i.id = u.item_id
join inv.condition_codes cc on cc.code = u.condition_code
left join inv.warehouses w on w.id = u.warehouse_id
left join inv.bins b on b.id = u.bin_id
where u.status in ('ON_HAND', 'ALLOCATED', 'PICKED', 'QUARANTINE');

-- Parts approaching or past their shelf life. Expired stock on the shelf is a
-- finding; expired stock shipped to a customer is an incident.
create or replace view inv.v_expiry_watch as
select
  u.entity_id,
  u.id as stock_unit_id,
  i.part_number,
  u.serial_number,
  u.warehouse_id,
  u.expiry_date,
  (u.expiry_date - current_date) as days_remaining,
  case
    when u.expiry_date < current_date then 'EXPIRED'
    when u.expiry_date < current_date + 30 then 'EXPIRING_30_DAYS'
    when u.expiry_date < current_date + 90 then 'EXPIRING_90_DAYS'
    else 'OK'
  end as expiry_status
from inv.stock_units u
join inv.items i on i.id = u.item_id
where u.expiry_date is not null
  and u.status in ('ON_HAND', 'ALLOCATED', 'PICKED', 'QUARANTINE');

select app.enable_updated_at('inv.stock_lots');
select app.enable_updated_at('inv.stock_units');

select app.enable_audit('inv.stock_units');
select app.enable_audit('inv.stock_lots');
select app.enable_audit('inv.certificates');
