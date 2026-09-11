-- ===========================================================================
-- 0007_etims_architecture.sql
--
-- The shape of the eTIMS integration, without the integration.
--
-- There is no live connection to the Kenya Revenue Authority here, and there
-- deliberately will not be until the sales cycle exists to feed it. What this
-- migration establishes is the one architectural decision that is expensive to
-- change later: fiscalisation is asynchronous.
--
-- An invoice is a commercial fact the moment the business raises it. Whether
-- the revenue authority's control unit has acknowledged it is a separate
-- question with a separate answer that arrives at a separate time. If those
-- two things are conflated - if posting an invoice waits on an HTTP call to
-- KRA - then a network problem in Nairobi stops the business from trading.
--
-- So: postings commit, an outbox row is written in the same transaction, and
-- a worker delivers it afterwards. This is the transactional outbox pattern,
-- and the reason it is here on day one is that retrofitting it means unpicking
-- every posting path in the system.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

create schema if not exists integration;

comment on schema integration is
  'Outbound integrations. Everything here is asynchronous by design: no external system may block a posting.';

-- ---------------------------------------------------------------------------
-- The outbox
-- ---------------------------------------------------------------------------

create type integration.delivery_status as enum (
  'PENDING',
  'IN_FLIGHT',
  'SUCCEEDED',
  'FAILED',
  'DEAD'
);

create table integration.outbox (
  id              uuid primary key default gen_random_uuid(),
  entity_id       uuid not null references app.entities (id) on delete restrict,
  channel         text not null check (channel in ('ETIMS', 'EMAIL', 'WEBHOOK', 'SMS')),
  event_type      text not null,
  payload         jsonb not null,

  -- Written in the same transaction as the business event. This is the whole
  -- point: if the posting rolls back, so does the intention to transmit it.
  source_type     text not null,
  source_id       uuid,

  -- Two different documents must never collapse into one transmission, and one
  -- document must never be transmitted twice. The dedupe key enforces both.
  dedupe_key      text not null,

  status          integration.delivery_status not null default 'PENDING',
  attempts        integer not null default 0 check (attempts >= 0),
  max_attempts    integer not null default 12 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  response        jsonb,

  available_after timestamptz not null default now(),
  locked_at       timestamptz,
  locked_by       text,

  created_at      timestamptz not null default now(),
  completed_at    timestamptz,

  unique (entity_id, channel, dedupe_key)
);

comment on table integration.outbox is
  'Transactional outbox. A row here is a promise made inside a committed business transaction; the worker keeps it.';
comment on column integration.outbox.max_attempts is
  'After this many failures the row becomes DEAD and stops retrying. Dead rows are an operational alert, not a silent loss.';

create index outbox_claimable_idx
  on integration.outbox (channel, next_attempt_at)
  where status in ('PENDING', 'FAILED');
create index outbox_source_idx on integration.outbox (entity_id, source_type, source_id);
create index outbox_status_idx on integration.outbox (entity_id, status, created_at desc);

create table integration.outbox_attempt (
  id             uuid primary key default gen_random_uuid(),
  outbox_id      uuid not null references integration.outbox (id) on delete cascade,
  attempt_no     integer not null,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  succeeded      boolean,
  http_status    integer,
  request_body   jsonb,
  response_body  jsonb,
  error_message  text,
  duration_ms    integer,
  unique (outbox_id, attempt_no)
);

comment on table integration.outbox_attempt is
  'Every transmission attempt, kept in full. When the revenue authority disputes what was sent, this is the answer.';

select app.enable_append_only('integration.outbox_attempt');

-- Enqueue. Called from inside the transaction that produced the business
-- event. Returns the existing row if this event was already queued, so a
-- retried posting does not queue a duplicate transmission.
create or replace function integration.enqueue(
  p_entity_id   uuid,
  p_channel     text,
  p_event_type  text,
  p_payload     jsonb,
  p_dedupe_key  text,
  p_source_type text default 'MANUAL',
  p_source_id   uuid default null,
  p_delay       interval default '0 seconds'
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into integration.outbox (
    entity_id, channel, event_type, payload, dedupe_key,
    source_type, source_id, next_attempt_at, available_after
  )
  values (
    p_entity_id, p_channel, p_event_type, p_payload, p_dedupe_key,
    p_source_type, p_source_id, now() + p_delay, now() + p_delay
  )
  on conflict (entity_id, channel, dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
      from integration.outbox
     where entity_id = p_entity_id and channel = p_channel and dedupe_key = p_dedupe_key;
  end if;

  return v_id;
end;
$$;

-- Claim a batch for delivery. SKIP LOCKED lets several workers run at once
-- without any of them waiting on the others or handling the same row.
create or replace function integration.claim_batch(
  p_channel   text,
  p_worker_id text,
  p_limit     integer default 20
)
returns setof integration.outbox
language sql
as $$
  update integration.outbox o
     set status          = 'IN_FLIGHT',
         attempts        = o.attempts + 1,
         locked_at       = now(),
         locked_by       = p_worker_id
   where o.id in (
     select id
       from integration.outbox
      where channel = p_channel
        and status in ('PENDING', 'FAILED')
        and next_attempt_at <= now()
        and available_after <= now()
      order by next_attempt_at
      limit p_limit
      for update skip locked
   )
  returning o.*;
$$;

create or replace function integration.complete_delivery(
  p_outbox_id uuid,
  p_response  jsonb default null
)
returns void
language sql
as $$
  update integration.outbox
     set status = 'SUCCEEDED',
         response = p_response,
         completed_at = now(),
         locked_at = null,
         locked_by = null,
         last_error = null
   where id = p_outbox_id;
$$;

-- Exponential backoff, capped. A revenue authority outage lasting hours must
-- not produce thousands of pointless requests, and must not give up either.
create or replace function integration.fail_delivery(
  p_outbox_id uuid,
  p_error     text
)
returns void
language plpgsql
as $$
declare
  v_row   integration.outbox%rowtype;
  v_delay interval;
begin
  select * into v_row from integration.outbox where id = p_outbox_id;
  if not found then
    return;
  end if;

  v_delay := least(
    make_interval(secs => power(2, least(v_row.attempts, 12))::double precision * 15),
    interval '6 hours'
  );

  update integration.outbox
     set status = case when v_row.attempts >= v_row.max_attempts then 'DEAD' else 'FAILED' end,
         last_error = p_error,
         next_attempt_at = now() + v_delay,
         locked_at = null,
         locked_by = null
   where id = p_outbox_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- eTIMS device registration
-- ---------------------------------------------------------------------------

create table integration.etims_device (
  id                uuid primary key default gen_random_uuid(),
  entity_id         uuid not null references app.entities (id) on delete restrict,
  tax_pin           text not null,
  branch_id         text not null default '00',
  device_serial     text not null,
  sdc_id            text,
  cmc_key           text,
  environment       text not null default 'SANDBOX' check (environment in ('SANDBOX', 'PRODUCTION')),
  base_url          text,
  last_invoice_no   bigint not null default 0,
  last_sync_at      timestamptz,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid,
  unique (entity_id, branch_id, environment)
);

comment on table integration.etims_device is
  'Registration details for the control unit. cmc_key is a credential and must be held in a secret store in production, not in this column.';
comment on column integration.etims_device.last_invoice_no is
  'The control unit maintains its own invoice counter. It is mirrored here so a mismatch with KRA can be detected rather than discovered at audit.';

-- ---------------------------------------------------------------------------
-- Fiscalised documents
--
-- One row per document that has been, or needs to be, transmitted. The signed
-- fields are what the customer's copy must legally display: without the
-- control code and the QR, the document is not a tax invoice.
-- ---------------------------------------------------------------------------

create type integration.etims_document_type as enum (
  'SALES_INVOICE',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
  'PURCHASE_INVOICE',
  'STOCK_MOVEMENT',
  'STOCK_ADJUSTMENT'
);

create type integration.etims_status as enum (
  'NOT_REQUIRED',
  'PENDING',
  'TRANSMITTED',
  'ACKNOWLEDGED',
  'REJECTED',
  'VOIDED'
);

create table integration.etims_document (
  id                 uuid primary key default gen_random_uuid(),
  entity_id          uuid not null references app.entities (id) on delete restrict,
  device_id          uuid references integration.etims_device (id) on delete restrict,
  document_type      integration.etims_document_type not null,

  -- The internal document. Sales invoices arrive in phase 2; until then this
  -- is a loose reference rather than a foreign key.
  source_type        text not null,
  source_id          uuid not null,
  internal_document_no text not null,

  status             integration.etims_status not null default 'PENDING',
  outbox_id          uuid references integration.outbox (id) on delete set null,

  -- Returned by the control unit and legally required on the printed document.
  cu_invoice_no      text,
  cu_receipt_no      text,
  control_code       text,
  internal_data      text,
  receipt_signature  text,
  qr_code_url        text,
  sdc_datetime       timestamptz,
  signed_at          timestamptz,

  -- What was declared, kept so the transmission can be reconciled against the
  -- ledger without reconstructing it from the invoice.
  total_taxable_base app.money_amount,
  total_tax_base     app.money_amount,
  total_gross_base   app.money_amount,

  rejection_reason   text,
  voided_at          timestamptz,
  void_reason        text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  updated_by         uuid,

  unique (entity_id, source_type, source_id, document_type),
  constraint etims_signed_documents_are_complete check (
    status <> 'ACKNOWLEDGED'
    or (cu_invoice_no is not null and control_code is not null and signed_at is not null)
  )
);

comment on table integration.etims_document is
  'The fiscalisation record for a document. A sales invoice may exist and be posted without one of these being ACKNOWLEDGED; it simply is not yet a valid tax invoice.';
comment on column integration.etims_document.control_code is
  'The control unit signature. Together with the QR it is what a KRA officer scans to verify the invoice.';

create index etims_document_status_idx
  on integration.etims_document (entity_id, status, created_at desc);
create index etims_document_source_idx
  on integration.etims_document (entity_id, source_type, source_id);

-- ---------------------------------------------------------------------------
-- Classification reference
--
-- KRA requires every item on a transmitted invoice to carry a classification
-- code from their published list. An unclassified part cannot be sold on a
-- fiscal invoice, so this is validated at the point of sale rather than
-- discovered when transmission fails.
-- ---------------------------------------------------------------------------

create table integration.etims_item_classification (
  code        text primary key,
  name        text not null,
  tax_type    char(1),
  major_group text,
  is_active   boolean not null default true,
  synced_at   timestamptz
);

comment on table integration.etims_item_classification is
  'Mirror of the KRA item classification list, refreshed from their code lookup endpoint.';

create or replace function integration.item_is_fiscalisable(p_item_id uuid)
returns boolean
language sql
stable
as $$
  select i.etims_item_class_code is not null
     and i.etims_quantity_unit is not null
     and i.etims_packaging_unit is not null
     and exists (
       select 1 from integration.etims_item_classification c
        where c.code = i.etims_item_class_code and c.is_active
     )
    from inv.items i
   where i.id = p_item_id;
$$;

comment on function integration.item_is_fiscalisable(uuid) is
  'Whether this part carries everything KRA needs. Checked when a sales line is added, not when the invoice is transmitted.';

-- Parts that cannot legally be invoiced yet. This is a work queue for whoever
-- maintains the item master, and it should always be empty.
create or replace view integration.v_items_missing_classification as
select
  i.entity_id,
  i.id as item_id,
  i.part_number,
  i.description,
  case when i.etims_item_class_code is null then 'classification code' end as missing_class,
  case when i.etims_quantity_unit is null then 'quantity unit' end as missing_quantity_unit,
  case when i.etims_packaging_unit is null then 'packaging unit' end as missing_packaging_unit
from inv.items i
where i.is_active
  and i.is_sellable
  and not integration.item_is_fiscalisable(i.id);

-- Documents that have not reached the revenue authority. Anything sitting here
-- for more than a day is a compliance problem.
create or replace view integration.v_fiscalisation_backlog as
select
  d.entity_id,
  d.document_type,
  d.internal_document_no,
  d.status,
  d.created_at,
  o.attempts,
  o.last_error,
  o.next_attempt_at,
  (now() - d.created_at) as age
from integration.etims_document d
left join integration.outbox o on o.id = d.outbox_id
where d.status in ('PENDING', 'TRANSMITTED', 'REJECTED');

select app.enable_updated_at('integration.etims_device');
select app.enable_updated_at('integration.etims_document');

select app.enable_audit('integration.etims_device');
select app.enable_audit('integration.etims_document');

grant usage on schema integration to skyjet_app;
grant select on all tables in schema integration to skyjet_app;
alter default privileges in schema integration grant select on tables to skyjet_app;

grant insert, update on
  integration.outbox, integration.etims_device, integration.etims_document,
  integration.etims_item_classification
to skyjet_app;

grant insert on integration.outbox_attempt to skyjet_app;

grant execute on function
  integration.enqueue(uuid, text, text, jsonb, text, text, uuid, interval),
  integration.claim_batch(text, text, integer),
  integration.complete_delivery(uuid, jsonb),
  integration.fail_delivery(uuid, text),
  integration.item_is_fiscalisable(uuid)
to skyjet_app;
