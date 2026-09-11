-- ===========================================================================
-- 0001_platform.sql
--
-- Platform layer for SkyJet Business Suite.
--
-- Establishes the primitives every other migration depends on:
--   * numeric domains that make the precision policy enforceable
--   * request context (who is acting, on behalf of which entity)
--   * a generic, append-only audit log
--   * append-only and updated_at trigger helpers
--   * entities, users and role-based access control
--   * gapless document numbering
--   * idempotency keys
--   * attachments with content hashing
--
-- Nothing in this file knows anything about accounting. Nothing in this file
-- may depend on a later migration.
-- ===========================================================================

create extension if not exists btree_gist with schema extensions;

set search_path = pg_catalog, public, extensions;

create schema if not exists app;
create schema if not exists audit;

comment on schema app is
  'Platform and master data: entities, identity, RBAC, numbering, attachments.';
comment on schema audit is
  'Append-only audit trail. Rows here are never updated or deleted.';

-- ---------------------------------------------------------------------------
-- Numeric domains
--
-- Invariant 1: money is NUMERIC(19,4), quantities NUMERIC(19,6), FX rates
-- NUMERIC(19,8). No float or double precision anywhere in the financial path.
-- Declaring these as domains means the policy is greppable and a reviewer can
-- see at a glance when a column steps outside it.
-- ---------------------------------------------------------------------------

create domain app.money_amount as numeric(19, 4);
create domain app.quantity as numeric(19, 6);
create domain app.fx_rate as numeric(19, 8) check (value > 0);
create domain app.tax_rate as numeric(9, 6) check (value >= 0 and value <= 1);

comment on domain app.money_amount is
  'Monetary value. 19 digits, 4 decimal places. Never float.';
comment on domain app.quantity is
  'Inventory quantity. 6 decimal places to survive unit-of-measure conversion.';
comment on domain app.fx_rate is
  'Foreign exchange rate expressed as units of base currency per unit of foreign currency.';

-- ---------------------------------------------------------------------------
-- Request context
--
-- The application sets these settings at the start of every transaction so
-- that triggers deep in the stack can attribute changes without every function
-- having to thread an actor parameter through its signature.
-- ---------------------------------------------------------------------------

create or replace function app.current_user_id()
returns uuid
language plpgsql
stable
as $$
declare
  v_raw text;
begin
  v_raw := nullif(current_setting('app.current_user_id', true), '');
  if v_raw is not null then
    return v_raw::uuid;
  end if;

  -- Fall back to the PostgREST JWT subject so that RLS still resolves an
  -- identity on the read path, where no explicit context is set.
  v_raw := nullif(current_setting('request.jwt.claim.sub', true), '');
  if v_raw is not null then
    return v_raw::uuid;
  end if;

  begin
    v_raw := nullif(current_setting('request.jwt.claims', true), '');
  exception when others then
    v_raw := null;
  end;
  if v_raw is not null then
    return nullif(v_raw::jsonb ->> 'sub', '')::uuid;
  end if;

  return null;
end;
$$;

create or replace function app.current_entity_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_entity_id', true), '')::uuid;
$$;

create or replace function app.current_request_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.request_id', true), '');
$$;

comment on function app.current_user_id() is
  'Acting user. Set by the application via app.current_user_id, or derived from the JWT on the read path.';

create or replace function app.system_user_id()
returns uuid
language sql
immutable
as $$
  select '00000000-0000-0000-0000-000000000001'::uuid;
$$;

-- True when the database session itself is privileged, which is the case for
-- migrations, the seed script and the test harness. The application never
-- connects this way: it uses the unprivileged skyjet_app role, for which every
-- permission check is fully enforced.
create or replace function app.is_privileged_session()
returns boolean
language sql
stable
as $$
  select coalesce((select usesuper from pg_user where usename = current_user), false);
$$;

-- The identity to stamp on an audited change. Work done by a migration, the
-- seed or a scheduled job is genuinely the system's, and saying so is more
-- honest than leaving the column null.
create or replace function app.audit_actor_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    app.current_user_id(),
    case when app.is_privileged_session() then app.system_user_id() end
  );
$$;

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

create table audit.log (
  id              bigint generated always as identity primary key,
  occurred_at     timestamptz  not null default clock_timestamp(),
  entity_id       uuid,
  actor_user_id   uuid,
  operation       char(1)      not null check (operation in ('I', 'U', 'D')),
  schema_name     text         not null,
  table_name      text         not null,
  record_id       text,
  before_data     jsonb,
  after_data      jsonb,
  changed_fields  text[],
  request_id      text,
  txid            bigint       not null default txid_current(),
  statement_ts    timestamptz  not null default statement_timestamp()
);

comment on table audit.log is
  'Every insert, update and delete on an audited table. Append-only: see the block trigger below.';

create index audit_log_table_record_idx
  on audit.log (schema_name, table_name, record_id, occurred_at desc);
create index audit_log_entity_time_idx
  on audit.log (entity_id, occurred_at desc);
create index audit_log_actor_time_idx
  on audit.log (actor_user_id, occurred_at desc);
create index audit_log_txid_idx
  on audit.log (txid);

-- ---------------------------------------------------------------------------
-- Trigger helpers
-- ---------------------------------------------------------------------------

-- Blocks UPDATE and DELETE outright. Used on the audit log and on every
-- ledger table. Corrections are made by writing a new, offsetting row.
create or replace function app.fn_block_update_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Table %.% is append-only; % is not permitted. Correct by posting a reversing record instead.',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

-- audit.log is made append-only at the foot of this file, once
-- app.enable_append_only() has been defined.

-- Maintains updated_at without trusting the caller to supply it.
create or replace function app.fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(app.current_user_id(), new.updated_by);
  return new;
end;
$$;

-- Generic audit capture. Attached by app.enable_audit().
create or replace function app.fn_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before   jsonb;
  v_after    jsonb;
  v_changed  text[];
  v_entity   uuid;
  v_record   text;
begin
  if tg_op = 'INSERT' then
    v_after := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);
    select array_agg(key order by key)
      into v_changed
      from jsonb_each(v_after) a(key, value)
     where a.value is distinct from (v_before -> a.key)
       -- updated_at and updated_by are maintained by trigger on every update,
       -- so a statement that changed no real field still moves them. Recording
       -- that would fill the trail with rows saying nothing happened, and an
       -- audit trail nobody can read is not an audit trail.
       and a.key not in ('updated_at', 'updated_by');
    if v_changed is null then
      return new;
    end if;
  else
    v_before := to_jsonb(old);
  end if;

  v_entity := nullif(coalesce(v_after, v_before) ->> 'entity_id', '')::uuid;
  v_record := coalesce(v_after, v_before) ->> 'id';

  insert into audit.log (
    entity_id, actor_user_id, operation, schema_name, table_name,
    record_id, before_data, after_data, changed_fields, request_id
  )
  values (
    v_entity,
    app.audit_actor_id(),
    left(tg_op, 1),
    tg_table_schema,
    tg_table_name,
    v_record,
    v_before,
    v_after,
    v_changed,
    app.current_request_id()
  );

  return coalesce(new, old);
end;
$$;

create or replace function app.enable_audit(p_table regclass)
returns void
language plpgsql
as $$
declare
  v_name text := 'zz_audit_' || replace(p_table::text, '.', '_');
begin
  execute format('drop trigger if exists %I on %s', v_name, p_table);
  execute format(
    'create trigger %I after insert or update or delete on %s
       for each row execute function app.fn_audit()',
    v_name, p_table
  );
end;
$$;

create or replace function app.enable_updated_at(p_table regclass)
returns void
language plpgsql
as $$
declare
  v_name text := 'set_updated_at_' || replace(p_table::text, '.', '_');
begin
  execute format('drop trigger if exists %I on %s', v_name, p_table);
  execute format(
    'create trigger %I before update on %s
       for each row execute function app.fn_set_updated_at()',
    v_name, p_table
  );
end;
$$;

create or replace function app.enable_append_only(p_table regclass)
returns void
language plpgsql
as $$
declare
  v_row  text := 'append_only_' || replace(p_table::text, '.', '_');
  v_stmt text := 'append_only_stmt_' || replace(p_table::text, '.', '_');
  v_trunc text := 'append_only_trunc_' || replace(p_table::text, '.', '_');
begin
  execute format('drop trigger if exists %I on %s', v_row, p_table);
  execute format(
    'create trigger %I before update or delete on %s
       for each row execute function app.fn_block_update_delete()',
    v_row, p_table
  );

  -- The row-level trigger above never fires for a statement that matches no
  -- rows, so `delete from ledger where true` against an empty table would
  -- appear to succeed. The statement-level trigger closes that, and makes the
  -- guard visible in the query plan rather than only at runtime.
  execute format('drop trigger if exists %I on %s', v_stmt, p_table);
  execute format(
    'create trigger %I before update or delete on %s
       for each statement execute function app.fn_block_update_delete()',
    v_stmt, p_table
  );

  execute format('drop trigger if exists %I on %s', v_trunc, p_table);
  execute format(
    'create trigger %I before truncate on %s
       for each statement execute function app.fn_block_update_delete()',
    v_trunc, p_table
  );
end;
$$;

comment on function app.enable_append_only(regclass) is
  'Installs the append-only guard. Applied to every ledger table (invariant 2).';

-- ---------------------------------------------------------------------------
-- Entities
--
-- One legal entity today. entity_id exists on every business table so a second
-- set of books can be added without a data migration.
-- ---------------------------------------------------------------------------

create table app.entities (
  id                      uuid        primary key default gen_random_uuid(),
  code                    text        not null unique
                            check (code ~ '^[A-Z0-9_]{2,20}$'),
  legal_name              text        not null,
  trading_name            text,
  tax_pin                 text,
  registration_number     text,
  country_code            char(2)     not null default 'KE',
  base_currency_code      char(3)     not null default 'KES',
  fiscal_year_start_month smallint    not null default 1
                            check (fiscal_year_start_month between 1 and 12),
  timezone                text        not null default 'Africa/Nairobi',
  address_line1           text,
  address_line2           text,
  city                    text,
  postal_code             text,
  phone                   text,
  email                   text,
  is_active               boolean     not null default true,
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid
);

comment on table app.entities is
  'A legal entity keeping its own set of books. base_currency_code is the functional currency.';
comment on column app.entities.tax_pin is
  'KRA PIN. Required before any eTIMS document can be transmitted.';

-- ---------------------------------------------------------------------------
-- Users
--
-- app.users mirrors auth.users. The foreign key is added conditionally so the
-- schema can also be materialised on a plain Postgres instance for testing.
-- ---------------------------------------------------------------------------

create table app.users (
  id           uuid        primary key,
  email        text        not null,
  full_name    text        not null,
  job_title    text,
  phone        text,
  is_active    boolean     not null default true,
  is_superuser boolean     not null default false,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

create unique index users_email_lower_key on app.users (lower(email));

comment on column app.users.is_superuser is
  'Bypasses permission checks. Intended for break-glass administration only; every action is still audited.';

-- The system actor. Work initiated by the platform itself rather than by a
-- person - a scheduled revaluation, a retry worker - is attributed here, so
-- that posted_by is never null and the audit trail never has an anonymous row.
insert into app.users (id, email, full_name, job_title)
values (
  '00000000-0000-0000-0000-000000000001',
  'system@skyjet.internal',
  'System',
  'Automated process'
)
on conflict (id) do nothing;

-- Declared NOT VALID so the pre-existing system actor, which has no
-- corresponding Supabase Auth identity, is exempt. Every subsequently created
-- user is still required to have one.
do $$
begin
  if exists (
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'auth' and c.relname = 'users'
  ) then
    alter table app.users
      add constraint users_auth_user_fk
      foreign key (id) references auth.users (id) on delete restrict
      not valid;
  end if;
end;
$$;

-- Resolves the user to attribute a write to. Fails loudly rather than
-- guessing, because an unattributed financial posting is worthless as evidence.
create or replace function app.acting_user_id()
returns uuid
language plpgsql
stable
as $$
declare
  v_user uuid := app.current_user_id();
begin
  if v_user is not null then
    return v_user;
  end if;
  if app.is_privileged_session() then
    return app.system_user_id();
  end if;
  raise exception
    'No acting user in session context. The application must set app.current_user_id before writing.'
    using errcode = 'insufficient_privilege';
end;
$$;

-- ---------------------------------------------------------------------------
-- Role-based access control
--
-- Permissions are static codes owned by the codebase. Roles bundle them.
-- Role assignment is per user, per entity.
-- ---------------------------------------------------------------------------

create table app.permissions (
  code        text primary key check (code ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  domain      text not null,
  description text not null,
  is_sensitive boolean not null default false
);

comment on table app.permissions is
  'Static permission catalogue, seeded by the codebase. Format: domain.action, e.g. gl.post_journal.';
comment on column app.permissions.is_sensitive is
  'Sensitive permissions (period reopen, cost override, credit release) warrant separate review during access audits.';

create table app.roles (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name        text not null,
  description text not null default '',
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid
);

comment on column app.roles.is_system is
  'System roles are seeded and may not be deleted, because permission checks reference them by code.';

create table app.role_permissions (
  role_id         uuid not null references app.roles (id) on delete cascade,
  permission_code text not null references app.permissions (code) on delete cascade,
  granted_at      timestamptz not null default now(),
  granted_by      uuid,
  primary key (role_id, permission_code)
);

create table app.user_roles (
  user_id    uuid not null references app.users (id) on delete cascade,
  entity_id  uuid not null references app.entities (id) on delete restrict,
  role_id    uuid not null references app.roles (id) on delete restrict,
  granted_at timestamptz not null default now(),
  granted_by uuid,
  expires_at timestamptz,
  primary key (user_id, entity_id, role_id)
);

comment on column app.user_roles.expires_at is
  'Optional automatic expiry, used for temporary elevation such as covering a period close.';

create index user_roles_entity_idx on app.user_roles (entity_id, user_id);

-- Effective permissions, expanded. Used by both the application guard and RLS.
create or replace view app.user_effective_permissions as
select
  ur.user_id,
  ur.entity_id,
  rp.permission_code
from app.user_roles ur
join app.role_permissions rp on rp.role_id = ur.role_id
where ur.expires_at is null or ur.expires_at > now();

create or replace function app.user_has_entity_access(p_entity_id uuid, p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from app.users u
     where u.id = coalesce(p_user_id, app.current_user_id())
       and u.is_active
       and (
         u.is_superuser
         or exists (
           select 1
             from app.user_roles ur
            where ur.user_id = u.id
              and ur.entity_id = p_entity_id
              and (ur.expires_at is null or ur.expires_at > now())
         )
       )
  );
$$;

create or replace function app.user_has_permission(
  p_entity_id uuid,
  p_permission text,
  p_user_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from app.users u
     where u.id = coalesce(p_user_id, app.current_user_id())
       and u.is_active
       and (
         u.is_superuser
         or exists (
           select 1
             from app.user_effective_permissions p
            where p.user_id = u.id
              and p.entity_id = p_entity_id
              and p.permission_code = p_permission
         )
       )
  );
$$;

-- Raises rather than returning false, so a missing permission can never be
-- silently swallowed by a caller that forgot to check the return value.
create or replace function app.require_permission(p_entity_id uuid, p_permission text)
returns void
language plpgsql
stable
as $$
begin
  -- Migrations, the seed script and the test harness run as a privileged
  -- database session and are not subject to application permissions. The
  -- application itself never connects this way.
  if app.is_privileged_session() then
    return;
  end if;

  if not app.user_has_permission(p_entity_id, p_permission) then
    raise exception 'Permission denied: % is required on entity %', p_permission, p_entity_id
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Document numbering
--
-- Invariant 6: numbers are gapless per entity, per document type, per fiscal
-- year. Gaplessness comes from allocating inside the caller's transaction
-- under a row lock: if the transaction rolls back, the number is released and
-- reused, so no number is ever allocated to a document that does not exist.
-- This deliberately serialises concurrent postings of the same document type,
-- which is the price of a sequence a tax authority will accept.
-- ---------------------------------------------------------------------------

create table app.document_types (
  code        text primary key check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name        text not null,
  description text not null default ''
);

create table app.numbering_sequences (
  id            uuid    primary key default gen_random_uuid(),
  entity_id     uuid    not null references app.entities (id) on delete restrict,
  document_type text    not null references app.document_types (code) on delete restrict,
  fiscal_year   smallint not null,
  prefix        text    not null default '',
  suffix        text    not null default '',
  pad_length    smallint not null default 6 check (pad_length between 1 and 12),
  next_value    bigint  not null default 1 check (next_value >= 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  updated_by    uuid,
  unique (entity_id, document_type, fiscal_year)
);

comment on table app.numbering_sequences is
  'One row per entity, document type and fiscal year. next_value is advanced under FOR UPDATE inside the posting transaction.';

create or replace function app.next_document_number(
  p_entity_id     uuid,
  p_document_type text,
  p_date          date
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_year     smallint := extract(year from p_date)::smallint;
  v_seq      app.numbering_sequences%rowtype;
  v_value    bigint;
begin
  -- Lock the counter for this entity/type/year. Concurrent callers queue here.
  select * into v_seq
    from app.numbering_sequences
   where entity_id = p_entity_id
     and document_type = p_document_type
     and fiscal_year = v_year
     for update;

  if not found then
    -- Create the counter on first use. ON CONFLICT covers the race where two
    -- transactions reach this point simultaneously.
    insert into app.numbering_sequences (entity_id, document_type, fiscal_year, prefix, pad_length)
    values (p_entity_id, p_document_type, v_year, p_document_type || '-' || v_year || '-', 6)
    on conflict (entity_id, document_type, fiscal_year) do nothing;

    select * into v_seq
      from app.numbering_sequences
     where entity_id = p_entity_id
       and document_type = p_document_type
       and fiscal_year = v_year
       for update;
  end if;

  v_value := v_seq.next_value;

  update app.numbering_sequences
     set next_value = v_value + 1,
         updated_at = now()
   where id = v_seq.id;

  return v_seq.prefix || lpad(v_value::text, v_seq.pad_length, '0') || v_seq.suffix;
end;
$$;

comment on function app.next_document_number(uuid, text, date) is
  'Allocates the next gapless document number. Must be called inside the transaction that persists the document.';

-- ---------------------------------------------------------------------------
-- Idempotency
--
-- Invariant 5: replaying a posting request cannot double-post. The key is
-- claimed in its own committed transaction by the application layer before the
-- work begins, so a crash mid-posting leaves an IN_PROGRESS marker that a
-- retry can detect rather than a silent duplicate.
-- ---------------------------------------------------------------------------

create table app.idempotency_keys (
  entity_id     uuid        not null references app.entities (id) on delete restrict,
  scope         text        not null,
  idempotency_key text      not null,
  request_hash  text        not null,
  status        text        not null default 'IN_PROGRESS'
                  check (status in ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  result        jsonb,
  error_message text,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  created_by    uuid,
  primary key (entity_id, scope, idempotency_key)
);

comment on table app.idempotency_keys is
  'Deduplicates posting requests. request_hash detects a key being reused with a different payload, which is a client bug and is rejected.';

create index idempotency_keys_created_idx on app.idempotency_keys (created_at);

-- ---------------------------------------------------------------------------
-- Attachments
--
-- Business documents live in Supabase Storage. This table is the catalogue and
-- the integrity record: sha256 lets an auditor prove a stored certificate is
-- byte-for-byte the one that was uploaded.
-- ---------------------------------------------------------------------------

create table app.attachments (
  id             uuid        primary key default gen_random_uuid(),
  entity_id      uuid        not null references app.entities (id) on delete restrict,
  storage_bucket text        not null default 'skyjet-documents',
  storage_path   text        not null,
  file_name      text        not null,
  mime_type      text        not null,
  byte_size      bigint      not null check (byte_size > 0),
  sha256         char(64)    not null check (sha256 ~ '^[0-9a-f]{64}$'),
  kind           text        not null default 'GENERAL',
  description    text,
  is_immutable   boolean     not null default true,
  uploaded_at    timestamptz not null default now(),
  uploaded_by    uuid        references app.users (id),
  unique (storage_bucket, storage_path)
);

comment on column app.attachments.sha256 is
  'Hash of the stored bytes, computed at upload. Allows tamper detection independent of the storage provider.';

create index attachments_entity_kind_idx on app.attachments (entity_id, kind);
create index attachments_sha_idx on app.attachments (sha256);

-- Polymorphic link table. Kept separate from attachments so one scanned PDF
-- covering several parts can be referenced by each of them.
create table app.attachment_links (
  attachment_id uuid not null references app.attachments (id) on delete restrict,
  record_schema text not null,
  record_table  text not null,
  record_id     uuid not null,
  link_role     text not null default 'ATTACHMENT',
  linked_at     timestamptz not null default now(),
  linked_by     uuid references app.users (id),
  primary key (attachment_id, record_schema, record_table, record_id, link_role)
);

create index attachment_links_record_idx
  on app.attachment_links (record_schema, record_table, record_id);

-- ---------------------------------------------------------------------------
-- Install triggers
-- ---------------------------------------------------------------------------

select app.enable_append_only('audit.log');

select app.enable_updated_at('app.entities');
select app.enable_updated_at('app.users');
select app.enable_updated_at('app.roles');
select app.enable_updated_at('app.numbering_sequences');

select app.enable_audit('app.entities');
select app.enable_audit('app.users');
select app.enable_audit('app.roles');
select app.enable_audit('app.role_permissions');
select app.enable_audit('app.user_roles');
select app.enable_audit('app.attachments');
select app.enable_audit('app.attachment_links');

-- Attachments are the evidence trail; the catalogue row may not be rewritten.
create or replace function app.fn_attachments_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Attachments may not be deleted; mark them superseded instead.'
      using errcode = 'restrict_violation';
  end if;
  if old.is_immutable and (
       new.sha256 is distinct from old.sha256
    or new.storage_path is distinct from old.storage_path
    or new.byte_size is distinct from old.byte_size
  ) then
    raise exception 'Attachment % is immutable; its stored bytes may not be repointed.', old.id
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger attachments_guard
  before update or delete on app.attachments
  for each row execute function app.fn_attachments_guard();

-- ---------------------------------------------------------------------------
-- Baseline document types
-- ---------------------------------------------------------------------------

insert into app.document_types (code, name, description) values
  ('JE',  'Journal Entry',       'Manual or system-generated general ledger entry'),
  ('OB',  'Opening Balance',     'Cutover opening balance entry'),
  ('REV', 'Reversal',            'Reversing entry against an existing journal entry'),
  ('FXR', 'FX Revaluation',      'Period-end foreign currency revaluation'),
  ('YEC', 'Year End Close',      'Fiscal year closing entry to retained earnings'),
  ('STK', 'Stock Movement',      'Inventory movement document')
on conflict (code) do nothing;
