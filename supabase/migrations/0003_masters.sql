-- ===========================================================================
-- 0003_masters.sql
--
-- Master data: trading partners, locations, parts and tax codes.
--
-- Aircraft parts differ from ordinary merchandise in three ways that shape
-- this schema:
--   * a part is identified by several competing numbers (the manufacturer's,
--     the NATO stock number, the airline's own, a supersession chain), and any
--     of them may be what a customer quotes at you;
--   * a part's value depends on its condition and its paperwork, not only on
--     what it is;
--   * shelf life is a physical property of some parts, and selling an expired
--     one is a regulatory event, not a customer service problem.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

create schema if not exists inv;

comment on schema inv is
  'Inventory: locations, parts, serialised units, lots, certificates and the stock ledger.';

-- ---------------------------------------------------------------------------
-- Shared master data
-- ---------------------------------------------------------------------------

create table app.payment_terms (
  id                uuid    primary key default gen_random_uuid(),
  entity_id         uuid    not null references app.entities (id) on delete restrict,
  code              text    not null,
  name              text    not null,
  days_net          integer not null default 0 check (days_net >= 0),
  is_end_of_month   boolean not null default false,
  discount_days     integer check (discount_days >= 0),
  discount_percent  app.tax_rate,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid,
  unique (entity_id, code),
  constraint payment_terms_discount_complete check (
    (discount_days is null) = (discount_percent is null)
  )
);

comment on column app.payment_terms.is_end_of_month is
  'When true, days_net counts from the end of the invoice month rather than the invoice date.';

create type app.address_kind as enum ('BILLING', 'SHIPPING', 'REGISTERED', 'WAREHOUSE');

create table app.addresses (
  id           uuid    primary key default gen_random_uuid(),
  entity_id    uuid    not null references app.entities (id) on delete restrict,
  kind         app.address_kind not null default 'BILLING',
  label        text,
  line1        text    not null,
  line2        text,
  city         text,
  region       text,
  postal_code  text,
  country_code char(2) not null default 'KE',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  updated_by   uuid
);

create table app.contacts (
  id         uuid primary key default gen_random_uuid(),
  entity_id  uuid not null references app.entities (id) on delete restrict,
  full_name  text not null,
  job_title  text,
  email      text,
  phone      text,
  is_primary boolean not null default false,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

-- ---------------------------------------------------------------------------
-- Tax codes
--
-- Kenya. The eTIMS letter is what the revenue authority expects on the
-- transmitted document, and it is not derivable from the rate alone: a 0%
-- zero-rated supply and a 0% exempt supply carry different letters and have
-- different consequences for input tax recovery.
-- ---------------------------------------------------------------------------

create type app.tax_kind as enum (
  'STANDARD',
  'ZERO_RATED',
  'EXEMPT',
  'NON_VAT',
  'REVERSE_CHARGE',
  'WITHHOLDING'
);

create table app.tax_codes (
  id                    uuid         primary key default gen_random_uuid(),
  entity_id             uuid         not null references app.entities (id) on delete restrict,
  code                  text         not null,
  name                  text         not null,
  kind                  app.tax_kind not null,
  rate                  app.tax_rate not null,
  is_recoverable        boolean      not null default true,
  output_tax_account_id uuid         references gl.accounts (id) on delete restrict,
  input_tax_account_id  uuid         references gl.accounts (id) on delete restrict,
  etims_tax_code        char(1)      check (etims_tax_code in ('A', 'B', 'C', 'D', 'E')),
  effective_from        date         not null default '2000-01-01',
  effective_to          date,
  is_active             boolean      not null default true,
  is_default_sales      boolean      not null default false,
  is_default_purchase   boolean      not null default false,
  created_at            timestamptz  not null default now(),
  updated_at            timestamptz  not null default now(),
  created_by            uuid,
  updated_by            uuid,
  unique (entity_id, code),
  check (effective_to is null or effective_to >= effective_from),
  constraint tax_codes_zero_rate_kinds check (
    kind not in ('ZERO_RATED', 'EXEMPT', 'NON_VAT') or rate = 0
  )
);

comment on column app.tax_codes.etims_tax_code is
  'KRA eTIMS tax letter: A exempt, B standard rate, C zero rated, D non-VAT, E the reduced 8 percent rate.';
comment on column app.tax_codes.is_recoverable is
  'False for input tax on exempt supplies, which must be absorbed into cost rather than reclaimed.';

create unique index tax_codes_default_sales_idx
  on app.tax_codes (entity_id) where is_default_sales;
create unique index tax_codes_default_purchase_idx
  on app.tax_codes (entity_id) where is_default_purchase;

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------

create table app.customers (
  id                    uuid    primary key default gen_random_uuid(),
  entity_id             uuid    not null references app.entities (id) on delete restrict,
  code                  text    not null,
  legal_name            text    not null,
  trading_name          text,
  tax_pin               text,
  currency_code         char(3) not null references app.currencies (code),
  payment_terms_id      uuid    references app.payment_terms (id) on delete restrict,
  credit_limit          app.money_amount not null default 0 check (credit_limit >= 0),
  is_credit_hold        boolean not null default false,
  credit_hold_reason    text,
  ar_account_id         uuid    references gl.accounts (id) on delete restrict,
  default_tax_code_id   uuid    references app.tax_codes (id) on delete restrict,
  billing_address_id    uuid    references app.addresses (id) on delete restrict,
  shipping_address_id   uuid    references app.addresses (id) on delete restrict,
  primary_contact_id    uuid    references app.contacts (id) on delete restrict,
  email                 text,
  phone                 text,
  -- Aircraft-parts specific: who the customer is determines what paperwork
  -- must accompany a shipment.
  requires_certificate  boolean not null default true,
  customer_type         text    not null default 'COMMERCIAL'
                          check (customer_type in ('COMMERCIAL', 'AIRLINE', 'MRO', 'BROKER', 'GOVERNMENT', 'INTERNAL')),
  etims_customer_type   text    check (etims_customer_type in ('INDIVIDUAL', 'BUSINESS', 'GOVERNMENT', 'FOREIGNER')),
  notes                 text,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  updated_by            uuid,
  unique (entity_id, code),
  constraint customers_credit_hold_has_reason check (
    not is_credit_hold or length(btrim(coalesce(credit_hold_reason, ''))) > 0
  )
);

comment on column app.customers.ar_account_id is
  'Optional override of the entity default receivables control account, for customers reported separately.';
comment on column app.customers.requires_certificate is
  'When true, a delivery cannot be confirmed unless every serialised line carries an airworthiness certificate.';

create index customers_name_idx on app.customers (entity_id, legal_name);
create unique index customers_tax_pin_idx
  on app.customers (entity_id, tax_pin) where tax_pin is not null;

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------

create table app.suppliers (
  id                     uuid    primary key default gen_random_uuid(),
  entity_id              uuid    not null references app.entities (id) on delete restrict,
  code                   text    not null,
  legal_name             text    not null,
  trading_name           text,
  tax_pin                text,
  currency_code          char(3) not null references app.currencies (code),
  payment_terms_id       uuid    references app.payment_terms (id) on delete restrict,
  ap_account_id          uuid    references gl.accounts (id) on delete restrict,
  default_tax_code_id    uuid    references app.tax_codes (id) on delete restrict,
  remit_to_address_id    uuid    references app.addresses (id) on delete restrict,
  primary_contact_id     uuid    references app.contacts (id) on delete restrict,
  email                  text,
  phone                  text,
  -- Supply-chain assurance: an unapproved supplier is how bogus parts enter a
  -- fleet, so approval state is master data, not a note in a spreadsheet.
  approval_status        text    not null default 'PENDING'
                           check (approval_status in ('PENDING', 'APPROVED', 'SUSPENDED', 'BLACKLISTED')),
  approval_expires_on    date,
  approved_at            timestamptz,
  approved_by            uuid    references app.users (id),
  quality_certifications text[],
  is_foreign             boolean not null default false,
  notes                  text,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid,
  updated_by             uuid,
  unique (entity_id, code)
);

comment on column app.suppliers.approval_status is
  'Only APPROVED suppliers may receive purchase orders. Approval lapses on approval_expires_on.';
comment on column app.suppliers.quality_certifications is
  'For example AS9120, ISO 9001, ASA-100. Held for supplier audit evidence.';

create index suppliers_name_idx on app.suppliers (entity_id, legal_name);

-- ---------------------------------------------------------------------------
-- Locations
-- ---------------------------------------------------------------------------

create table inv.warehouses (
  id                   uuid    primary key default gen_random_uuid(),
  entity_id            uuid    not null references app.entities (id) on delete restrict,
  code                 text    not null,
  name                 text    not null,
  address_id           uuid    references app.addresses (id) on delete restrict,
  inventory_account_id uuid    references gl.accounts (id) on delete restrict,
  is_consignment       boolean not null default false,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  updated_by           uuid,
  unique (entity_id, code)
);

comment on column inv.warehouses.is_consignment is
  'Consignment stock is held but not owned. It is tracked in quantity and excluded from the inventory valuation posted to the ledger.';

create type inv.bin_type as enum (
  'STOCK',
  'GOODS_IN',
  'QUARANTINE',
  'PICK_FACE',
  'PACKING',
  'DESPATCH',
  'SCRAP',
  'REPAIR'
);

create table inv.bins (
  id           uuid    primary key default gen_random_uuid(),
  entity_id    uuid    not null references app.entities (id) on delete restrict,
  warehouse_id uuid    not null references inv.warehouses (id) on delete restrict,
  code         text    not null,
  name         text    not null,
  bin_type     inv.bin_type not null default 'STOCK',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  updated_by   uuid,
  unique (warehouse_id, code)
);

comment on table inv.bins is
  'QUARANTINE bins hold stock that is physically present but not available: awaiting inspection, paperwork or disposition.';

-- ---------------------------------------------------------------------------
-- Parts
-- ---------------------------------------------------------------------------

create table inv.units_of_measure (
  code      text primary key check (code ~ '^[A-Z]{1,6}$'),
  name      text not null,
  category  text not null default 'COUNT',
  is_active boolean not null default true
);

create table inv.manufacturers (
  id         uuid primary key default gen_random_uuid(),
  entity_id  uuid not null references app.entities (id) on delete restrict,
  code       text not null,
  name       text not null,
  cage_code  text,
  country_code char(2),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (entity_id, code)
);

comment on column inv.manufacturers.cage_code is
  'Commercial and Government Entity code. The unambiguous identifier for a parts manufacturer.';

create table inv.item_categories (
  id                   uuid primary key default gen_random_uuid(),
  entity_id            uuid not null references app.entities (id) on delete restrict,
  code                 text not null,
  name                 text not null,
  parent_id            uuid references inv.item_categories (id) on delete restrict,
  ata_chapter          text,
  inventory_account_id uuid references gl.accounts (id) on delete restrict,
  cogs_account_id      uuid references gl.accounts (id) on delete restrict,
  revenue_account_id   uuid references gl.accounts (id) on delete restrict,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  updated_by           uuid,
  unique (entity_id, code)
);

comment on column inv.item_categories.ata_chapter is
  'ATA 100 chapter, the industry-standard grouping for aircraft systems. Drives reporting the trade recognises.';

create type inv.tracking_mode as enum ('NONE', 'LOT', 'SERIAL');
create type inv.costing_method as enum ('WEIGHTED_AVERAGE', 'SPECIFIC');

create table inv.items (
  id                       uuid primary key default gen_random_uuid(),
  entity_id                uuid not null references app.entities (id) on delete restrict,
  part_number              text not null,
  description              text not null,
  category_id              uuid references inv.item_categories (id) on delete restrict,
  manufacturer_id          uuid references inv.manufacturers (id) on delete restrict,
  manufacturer_part_number text,
  nsn                      text,
  uom_code                 text not null references inv.units_of_measure (code),

  tracking_mode            inv.tracking_mode  not null default 'SERIAL',
  costing_method           inv.costing_method not null default 'SPECIFIC',

  -- Airworthiness controls
  requires_certificate     boolean not null default true,
  requires_serial_on_receipt boolean not null default true,
  is_life_limited          boolean not null default false,
  shelf_life_days          integer check (shelf_life_days is null or shelf_life_days > 0),
  is_hazardous             boolean not null default false,
  is_dangerous_goods       boolean not null default false,
  un_number                text,
  is_export_controlled     boolean not null default false,
  eccn                     text,

  -- Account overrides; when null the category, then the entity default, applies
  inventory_account_id     uuid references gl.accounts (id) on delete restrict,
  cogs_account_id          uuid references gl.accounts (id) on delete restrict,
  revenue_account_id       uuid references gl.accounts (id) on delete restrict,
  default_tax_code_id      uuid references app.tax_codes (id) on delete restrict,

  -- eTIMS classification, needed before a sale of this part can be transmitted
  etims_item_class_code    text,
  etims_item_type          char(1),
  etims_packaging_unit     text,
  etims_quantity_unit      text,

  -- Planning
  reorder_point            app.quantity,
  reorder_quantity         app.quantity,
  lead_time_days           integer check (lead_time_days is null or lead_time_days >= 0),

  is_stocked               boolean not null default true,
  is_sellable              boolean not null default true,
  is_purchasable           boolean not null default true,
  is_active                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid,
  updated_by               uuid,

  unique (entity_id, part_number),

  -- A serialised part is costed by specific identification. Averaging the cost
  -- of individually identifiable units destroys the link between the part on
  -- the shelf and what was paid for it, which is exactly the link an aircraft
  -- parts business is required to be able to demonstrate.
  constraint items_serial_implies_specific_cost check (
    tracking_mode <> 'SERIAL' or costing_method = 'SPECIFIC'
  ),
  constraint items_non_serial_implies_average_cost check (
    tracking_mode = 'SERIAL' or costing_method = 'WEIGHTED_AVERAGE'
  ),
  constraint items_dangerous_goods_have_un_number check (
    not is_dangerous_goods or un_number is not null
  )
);

comment on column inv.items.is_life_limited is
  'Life-limited parts have a hard retirement point in cycles or hours and cannot be returned to service beyond it.';
comment on column inv.items.shelf_life_days is
  'Set for seals, adhesives, oxygen bottles and similar. Drives expiry on receipt and blocks issue of expired stock.';
comment on column inv.items.eccn is
  'Export Control Classification Number. Present on parts whose export requires a licence.';

create index items_description_idx on inv.items (entity_id, description);
create index items_manufacturer_idx on inv.items (entity_id, manufacturer_id, manufacturer_part_number);
create index items_nsn_idx on inv.items (entity_id, nsn) where nsn is not null;
create index items_category_idx on inv.items (entity_id, category_id);

-- The several numbers a single part answers to. A customer enquiry quoting any
-- of these must find the part, and a supersession must be visible so an
-- obsolete number is not quoted as available.
create type inv.part_number_kind as enum (
  'ALTERNATE',
  'SUPERSEDES',
  'SUPERSEDED_BY',
  'CUSTOMER',
  'SUPPLIER',
  'NATO',
  'INTERCHANGEABLE'
);

create table inv.item_alternate_numbers (
  id           uuid primary key default gen_random_uuid(),
  entity_id    uuid not null references app.entities (id) on delete restrict,
  item_id      uuid not null references inv.items (id) on delete restrict,
  number_kind  inv.part_number_kind not null,
  part_number  text not null,
  counterparty_id uuid,
  notes        text,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  unique (entity_id, item_id, number_kind, part_number)
);

comment on column inv.item_alternate_numbers.counterparty_id is
  'For CUSTOMER and SUPPLIER kinds, the customer or supplier who uses this number. Not a foreign key because it points at either table.';

create index item_alternate_numbers_lookup_idx
  on inv.item_alternate_numbers (entity_id, part_number);

-- ---------------------------------------------------------------------------
-- Close the loop on the ledger's analysis dimensions
--
-- These columns were declared in 0002 without foreign keys because the tables
-- they point at did not exist yet. Adding the constraints here means a journal
-- line can never reference a customer or part that was never created.
-- ---------------------------------------------------------------------------

alter table gl.journal_entry_line
  add constraint jel_customer_fk
    foreign key (customer_id) references app.customers (id) on delete restrict,
  add constraint jel_supplier_fk
    foreign key (supplier_id) references app.suppliers (id) on delete restrict,
  add constraint jel_warehouse_fk
    foreign key (warehouse_id) references inv.warehouses (id) on delete restrict,
  add constraint jel_item_fk
    foreign key (item_id) references inv.items (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

select app.enable_updated_at('app.payment_terms');
select app.enable_updated_at('app.addresses');
select app.enable_updated_at('app.contacts');
select app.enable_updated_at('app.tax_codes');
select app.enable_updated_at('app.customers');
select app.enable_updated_at('app.suppliers');
select app.enable_updated_at('inv.warehouses');
select app.enable_updated_at('inv.bins');
select app.enable_updated_at('inv.manufacturers');
select app.enable_updated_at('inv.item_categories');
select app.enable_updated_at('inv.items');

select app.enable_audit('app.payment_terms');
select app.enable_audit('app.tax_codes');
select app.enable_audit('app.customers');
select app.enable_audit('app.suppliers');
select app.enable_audit('inv.warehouses');
select app.enable_audit('inv.bins');
select app.enable_audit('inv.item_categories');
select app.enable_audit('inv.items');
select app.enable_audit('inv.item_alternate_numbers');

-- ---------------------------------------------------------------------------
-- Reference data that is the same everywhere
-- ---------------------------------------------------------------------------

insert into inv.units_of_measure (code, name, category) values
  ('EA',   'Each',            'COUNT'),
  ('SET',  'Set',             'COUNT'),
  ('KIT',  'Kit',             'COUNT'),
  ('PR',   'Pair',            'COUNT'),
  ('BOX',  'Box',             'COUNT'),
  ('RL',   'Roll',            'COUNT'),
  ('M',    'Metre',           'LENGTH'),
  ('FT',   'Foot',            'LENGTH'),
  ('KG',   'Kilogram',        'MASS'),
  ('G',    'Gram',            'MASS'),
  ('L',    'Litre',           'VOLUME'),
  ('ML',   'Millilitre',      'VOLUME'),
  ('GAL',  'Gallon',          'VOLUME'),
  ('HR',   'Hour',            'TIME')
on conflict (code) do nothing;
