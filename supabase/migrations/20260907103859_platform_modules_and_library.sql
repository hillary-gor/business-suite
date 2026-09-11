-- ===========================================================================
-- Platform module entitlements and the Library domain.
--
-- Authentication (who is signed in) stays in app.users / Auth.
-- Entitlement (which product modules an organisation may use) is a separate
-- fact on the entity, not a role and not a hard-coded organisation name.
--
-- The Library is its own schema. It does not read or write Business Suite
-- tables, and Business Suite posting functions do not know it exists.
-- File bytes live in the private `library-documents` storage bucket, not in
-- these rows. storage_path is the catalogue pointer.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

create table app.modules (
  code        text primary key
                check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  name        text not null,
  description text not null,
  href        text not null,
  sort_order  integer not null,
  created_at  timestamptz not null default now()
);

comment on table app.modules is
  'Product modules the platform can entitle an organisation to. Adding a row here is how a future module (inventory, HR, fleet) is registered without a new login system.';

create table app.entity_modules (
  entity_id   uuid not null references app.entities (id) on delete restrict,
  module_code text not null references app.modules (code) on delete restrict,
  enabled     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid,
  primary key (entity_id, module_code)
);

comment on table app.entity_modules is
  'Which modules an organisation may open. Absence or enabled=false is a denial. Hiding a button is not sufficient; require_module() and RLS both consult this table.';

select app.enable_updated_at('app.entity_modules');
select app.enable_audit('app.entity_modules');

insert into app.modules (code, name, description, href, sort_order) values
  ('business_suite', 'Business Suite',
   'Accounting, sales, purchases and reports', '/', 10),
  ('library', 'Library',
   'Manuals, certificates, technical documents and aircraft records', '/library', 20)
on conflict (code) do nothing;

-- Existing organisations keep Business Suite, and receive Library, so this
-- change is not a lockout. A library-only customer is configured by disabling
-- business_suite, not by renaming the entity.
insert into app.entity_modules (entity_id, module_code, enabled)
select e.id, m.code, true
  from app.entities e
  cross join app.modules m
on conflict (entity_id, module_code) do nothing;

create or replace function app.fn_entity_modules_defaults()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  insert into app.entity_modules (entity_id, module_code, enabled, created_by, updated_by)
  select new.id, m.code, true, app.audit_actor_id(), app.audit_actor_id()
    from app.modules m
  on conflict (entity_id, module_code) do nothing;
  return new;
end;
$$;

drop trigger if exists entity_modules_defaults on app.entities;
create trigger entity_modules_defaults
  after insert on app.entities
  for each row execute function app.fn_entity_modules_defaults();

create or replace function app.entity_has_module(p_entity_id uuid, p_module_code text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select exists (
    select 1
      from app.entity_modules em
     where em.entity_id = p_entity_id
       and em.module_code = p_module_code
       and em.enabled
  );
$$;

comment on function app.entity_has_module(uuid, text) is
  'True when the organisation is entitled to the named module. Superuser flags and role names do not bypass this.';

create or replace function app.require_module(p_entity_id uuid, p_module_code text)
returns void
language plpgsql
stable
set search_path = pg_catalog, public, extensions
as $$
begin
  if app.is_privileged_session() then
    return;
  end if;

  if not app.entity_has_module(p_entity_id, p_module_code) then
    raise exception
      'Module not entitled: % is not enabled for this organisation',
      p_module_code
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function app.set_entity_module(
  p_entity_id   uuid,
  p_module_code text,
  p_enabled     boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  perform app.require_permission(p_entity_id, 'admin.manage_entity');

  if not exists (select 1 from app.modules m where m.code = p_module_code) then
    raise exception 'Unknown module %', p_module_code using errcode = 'invalid_parameter_value';
  end if;

  insert into app.entity_modules (entity_id, module_code, enabled, created_by, updated_by)
  values (p_entity_id, p_module_code, p_enabled, app.acting_user_id(), app.acting_user_id())
  on conflict (entity_id, module_code) do update
    set enabled = excluded.enabled,
        updated_by = app.acting_user_id();
end;
$$;

-- ---------------------------------------------------------------------------
-- Library permissions
-- ---------------------------------------------------------------------------

insert into app.permissions (code, domain, description, is_sensitive) values
  ('library.document.read',   'library', 'View library documents and download files', false),
  ('library.document.upload', 'library', 'Upload library documents', false),
  ('library.document.manage', 'library', 'Edit, archive or delete library documents', true)
on conflict (code) do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, p.code
  from app.roles r
  cross join app.permissions p
 where r.code in ('owner', 'super_admin')
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values
    ('library.document.read'),
    ('library.document.upload'),
    ('library.document.manage')
  ) as x(code) on true
 where r.code = 'manager'
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, 'library.document.read'
  from app.roles r
 where r.code in (
   'accountant', 'inventory', 'warehouse_operator', 'sales', 'procurement', 'viewer'
 )
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values ('library.document.upload'), ('library.document.manage')) as x(code) on true
 where r.code = 'inventory'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Library schema
-- ---------------------------------------------------------------------------

create schema if not exists library;

comment on schema library is
  'Aircraft-spares document library. Isolated from the accounting and inventory domains.';

create table library.categories (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references app.entities (id) on delete restrict,
  code        text not null,
  name        text not null,
  description text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid,
  constraint library_categories_code_chk check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  constraint library_categories_entity_code_uq unique (entity_id, code)
);

comment on table library.categories is
  'Per-organisation document categories. Seeded with the standard aircraft-spares set; custom categories can be added later.';

create table library.tags (
  id         uuid primary key default gen_random_uuid(),
  entity_id  uuid not null references app.entities (id) on delete restrict,
  name       text not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint library_tags_name_chk check (char_length(btrim(name)) between 1 and 80)
);

create unique index library_tags_entity_name_uq
  on library.tags (entity_id, lower(btrim(name)));

create table library.documents (
  id              uuid primary key default gen_random_uuid(),
  entity_id       uuid not null references app.entities (id) on delete restrict,
  category_id     uuid references library.categories (id) on delete restrict,
  title           text not null,
  description     text,
  document_type   text not null,
  aircraft_type   text,
  aircraft_model  text,
  part_number     text,
  manufacturer    text,
  revision        text,
  version         text,
  effective_date  date,
  storage_bucket  text not null default 'library-documents',
  storage_path    text not null,
  file_name       text not null,
  file_size       bigint not null,
  mime_type       text not null,
  sha256          char(64) not null,
  status          text not null default 'ACTIVE',
  uploaded_by     uuid references app.users (id),
  archived_at     timestamptz,
  archived_by     uuid references app.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  updated_by      uuid,
  constraint library_documents_title_chk
    check (char_length(btrim(title)) between 1 and 240),
  constraint library_documents_type_chk
    check (document_type in (
      'manuals', 'certificates', 'technical', 'inspection', 'aircraft', 'part', 'other'
    )),
  constraint library_documents_status_chk
    check (status in ('ACTIVE', 'ARCHIVED')),
  constraint library_documents_size_chk
    check (file_size > 0 and file_size <= 33554432),
  constraint library_documents_sha_chk
    check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint library_documents_bucket_chk
    check (storage_bucket = 'library-documents'),
  constraint library_documents_path_entity_chk
    check (storage_path like entity_id::text || '/%'),
  unique (storage_bucket, storage_path)
);

comment on table library.documents is
  'Library catalogue. The file itself is in Supabase Storage at storage_path; this row is the metadata and integrity record.';
comment on column library.documents.storage_path is
  'Path inside library-documents: {entity_id}/{document_type}/{document_id}/{file_name}. Must never point at a Business Suite bucket or another organisation.';
comment on column library.documents.sha256 is
  'Hash of the stored bytes, computed at upload.';

create index library_documents_entity_created_idx
  on library.documents (entity_id, created_at desc);
create index library_documents_entity_type_idx
  on library.documents (entity_id, document_type);
create index library_documents_entity_status_idx
  on library.documents (entity_id, status);
create index library_documents_part_idx
  on library.documents (entity_id, part_number)
  where part_number is not null;

create table library.document_tags (
  document_id uuid not null references library.documents (id) on delete cascade,
  tag_id      uuid not null references library.tags (id) on delete cascade,
  primary key (document_id, tag_id)
);

-- Polymorphic links so a document can later be associated with an aircraft,
-- part, supplier, customer, purchase or sale without rebuilding the Library.
create table library.document_links (
  document_id   uuid not null references library.documents (id) on delete cascade,
  record_schema text not null,
  record_table  text not null,
  record_id     uuid not null,
  link_role     text not null default 'RELATED',
  linked_at     timestamptz not null default now(),
  linked_by     uuid references app.users (id),
  primary key (document_id, record_schema, record_table, record_id, link_role)
);

create index library_document_links_record_idx
  on library.document_links (record_schema, record_table, record_id);

select app.enable_updated_at('library.categories');
select app.enable_updated_at('library.documents');
select app.enable_audit('library.categories');
select app.enable_audit('library.tags');
select app.enable_audit('library.documents');
select app.enable_audit('library.document_tags');
select app.enable_audit('library.document_links');

-- ---------------------------------------------------------------------------
-- Default categories
-- ---------------------------------------------------------------------------

create or replace function library.ensure_default_categories(p_entity_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  perform app.require_module(p_entity_id, 'library');
  insert into library.categories (entity_id, code, name, description, sort_order)
  values
    (p_entity_id, 'manuals',       'Manuals',               'Aircraft and component manuals', 10),
    (p_entity_id, 'certificates',  'Certificates',          'Airworthiness and release certificates', 20),
    (p_entity_id, 'technical',     'Technical documents',   'Service bulletins and technical data', 30),
    (p_entity_id, 'inspection',    'Inspection documents',  'Inspection findings and reports', 40),
    (p_entity_id, 'aircraft',      'Aircraft records',      'Aircraft-related documentation', 50),
    (p_entity_id, 'part',          'Part documents',        'Part-related documentation', 60),
    (p_entity_id, 'other',         'Other company documents','Documents that do not fit another category', 70)
  on conflict (entity_id, code) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Writes. Application role has no DML on these tables.
-- ---------------------------------------------------------------------------

create or replace function library.save_document(p_entity_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_id          uuid := nullif(p_payload ->> 'document_id', '')::uuid;
  v_title       text := btrim(coalesce(p_payload ->> 'title', ''));
  v_type        text := coalesce(nullif(p_payload ->> 'document_type', ''), 'other');
  v_file_name   text := btrim(coalesce(p_payload ->> 'file_name', ''));
  v_file_size   bigint := nullif(p_payload ->> 'file_size', '')::bigint;
  v_mime        text := btrim(coalesce(p_payload ->> 'mime_type', ''));
  v_sha         text := lower(btrim(coalesce(p_payload ->> 'sha256', '')));
  v_path        text := btrim(coalesce(p_payload ->> 'storage_path', ''));
  v_bucket      text := coalesce(nullif(p_payload ->> 'storage_bucket', ''), 'library-documents');
  v_category_id uuid;
  v_is_new      boolean;
  v_tag         text;
  v_tag_id      uuid;
  v_has_file    boolean;
begin
  perform app.require_module(p_entity_id, 'library');
  perform library.ensure_default_categories(p_entity_id);

  if v_id is null then
    perform app.require_permission(p_entity_id, 'library.document.upload');
    v_is_new := true;
    v_id := coalesce(nullif(p_payload ->> 'new_document_id', '')::uuid, gen_random_uuid());
  else
    perform app.require_permission(p_entity_id, 'library.document.manage');
    v_is_new := false;
    if not exists (
      select 1 from library.documents d
       where d.id = v_id and d.entity_id = p_entity_id
    ) then
      raise exception 'Document was not found' using errcode = 'no_data_found';
    end if;
  end if;

  if char_length(v_title) < 1 then
    raise exception 'A title is required' using errcode = 'null_value_not_allowed';
  end if;

  if v_type not in ('manuals', 'certificates', 'technical', 'inspection', 'aircraft', 'part', 'other') then
    raise exception 'Unknown document type %', v_type using errcode = 'check_violation';
  end if;

  v_has_file := v_is_new or nullif(p_payload ->> 'file_name', '') is not null;

  if v_has_file then
    v_file_name := regexp_replace(v_file_name, '[\\/]+', '-', 'g');
    v_file_name := regexp_replace(v_file_name, '[^\w.\- ()]+', '_', 'g');
    if char_length(v_file_name) < 1 then
      v_file_name := 'document';
    end if;
    if char_length(v_file_name) > 200 then
      v_file_name := left(v_file_name, 200);
    end if;
    if v_file_size is null or v_file_size <= 0 or v_file_size > 33554432 then
      raise exception 'File must be between 1 byte and 32 MB' using errcode = 'check_violation';
    end if;
    if v_mime is null or v_mime not in (
      'application/pdf',
      'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/tiff',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv', 'application/zip'
    ) then
      raise exception 'That file type is not accepted' using errcode = 'check_violation';
    end if;
    if v_sha is null or v_sha !~ '^[0-9a-f]{64}$' then
      raise exception 'A SHA-256 digest of the file is required' using errcode = 'check_violation';
    end if;
    if v_bucket is distinct from 'library-documents' then
      raise exception 'Library files must be stored in the library-documents bucket'
        using errcode = 'check_violation';
    end if;
    if v_path is distinct from (p_entity_id::text || '/' || v_type || '/' || v_id::text || '/' || v_file_name) then
      raise exception 'Storage path does not match this organisation and document'
        using errcode = 'check_violation';
    end if;
  end if;

  select c.id into v_category_id
    from library.categories c
   where c.entity_id = p_entity_id and c.code = v_type;

  if v_is_new then
    insert into library.documents (
      id, entity_id, category_id, title, description, document_type,
      aircraft_type, aircraft_model, part_number, manufacturer, revision, version,
      effective_date, storage_bucket, storage_path, file_name, file_size, mime_type,
      sha256, uploaded_by, created_by, updated_by
    ) values (
      v_id, p_entity_id, v_category_id, v_title,
      nullif(btrim(coalesce(p_payload ->> 'description', '')), ''),
      v_type,
      nullif(btrim(coalesce(p_payload ->> 'aircraft_type', '')), ''),
      nullif(btrim(coalesce(p_payload ->> 'aircraft_model', '')), ''),
      nullif(btrim(coalesce(p_payload ->> 'part_number', '')), ''),
      nullif(btrim(coalesce(p_payload ->> 'manufacturer', '')), ''),
      nullif(btrim(coalesce(p_payload ->> 'revision', '')), ''),
      nullif(btrim(coalesce(p_payload ->> 'version', '')), ''),
      nullif(p_payload ->> 'effective_date', '')::date,
      v_bucket, v_path, v_file_name, v_file_size, v_mime, v_sha,
      app.acting_user_id(), app.acting_user_id(), app.acting_user_id()
    );
  else
    update library.documents
       set title          = v_title,
           description    = nullif(btrim(coalesce(p_payload ->> 'description', '')), ''),
           document_type  = v_type,
           category_id    = v_category_id,
           aircraft_type  = nullif(btrim(coalesce(p_payload ->> 'aircraft_type', '')), ''),
           aircraft_model = nullif(btrim(coalesce(p_payload ->> 'aircraft_model', '')), ''),
           part_number    = nullif(btrim(coalesce(p_payload ->> 'part_number', '')), ''),
           manufacturer   = nullif(btrim(coalesce(p_payload ->> 'manufacturer', '')), ''),
           revision       = nullif(btrim(coalesce(p_payload ->> 'revision', '')), ''),
           version        = nullif(btrim(coalesce(p_payload ->> 'version', '')), ''),
           effective_date = nullif(p_payload ->> 'effective_date', '')::date,
           storage_bucket = case when v_has_file then v_bucket else storage_bucket end,
           storage_path   = case when v_has_file then v_path else storage_path end,
           file_name      = case when v_has_file then v_file_name else file_name end,
           file_size      = case when v_has_file then v_file_size else file_size end,
           mime_type      = case when v_has_file then v_mime else mime_type end,
           sha256         = case when v_has_file then v_sha else sha256 end,
           updated_by     = app.acting_user_id()
     where id = v_id and entity_id = p_entity_id;
  end if;

  delete from library.document_tags where document_id = v_id;

  if p_payload ? 'tags' and jsonb_typeof(p_payload -> 'tags') = 'array' then
    for v_tag in
      select distinct btrim(value)
        from jsonb_array_elements_text(p_payload -> 'tags') as t(value)
       where char_length(btrim(value)) > 0
    loop
      if char_length(v_tag) > 80 then
        v_tag := left(v_tag, 80);
      end if;

      select t.id into v_tag_id
        from library.tags t
       where t.entity_id = p_entity_id
         and lower(btrim(t.name)) = lower(v_tag);

      if v_tag_id is null then
        insert into library.tags (entity_id, name, created_by)
        values (p_entity_id, v_tag, app.acting_user_id())
        returning id into v_tag_id;
      end if;

      insert into library.document_tags (document_id, tag_id)
      values (v_id, v_tag_id)
      on conflict do nothing;
    end loop;
  end if;

  return v_id;
end;
$$;

comment on function library.save_document(uuid, jsonb) is
  'Creates or amends a library catalogue row. The caller must already have stored the bytes at storage_path in the library-documents bucket.';

create or replace function library.archive_document(p_entity_id uuid, p_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.manage');

  update library.documents
     set status = 'ARCHIVED',
         archived_at = now(),
         archived_by = app.acting_user_id(),
         updated_by = app.acting_user_id()
   where id = p_document_id
     and entity_id = p_entity_id
     and status = 'ACTIVE';

  if not found then
    raise exception 'Document was not found or is already archived' using errcode = 'no_data_found';
  end if;

  return p_document_id;
end;
$$;

create or replace function library.delete_document(p_entity_id uuid, p_document_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_path text;
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.manage');

  select storage_path into v_path
    from library.documents
   where id = p_document_id and entity_id = p_entity_id;

  if v_path is null then
    raise exception 'Document was not found' using errcode = 'no_data_found';
  end if;

  delete from library.documents
   where id = p_document_id and entity_id = p_entity_id;

  return v_path;
end;
$$;

comment on function library.delete_document(uuid, uuid) is
  'Removes the catalogue row and returns the storage path so the application can delete the object. Does not touch Business Suite buckets.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

create or replace function app.enforce_rls_everywhere()
returns integer
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_table record;
  v_count integer := 0;
begin
  for v_table in
    select n.nspname as schema_name, c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('app', 'gl', 'inv', 'audit', 'integration', 'sales', 'purch', 'library')
       and c.relkind = 'r'
       and not c.relrowsecurity
  loop
    execute format('alter table %I.%I enable row level security',
                   v_table.schema_name, v_table.table_name);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

select app.enforce_rls_everywhere();

select app.apply_reference_read_policy('app.modules'::regclass);
select app.apply_entity_read_policy('app.entity_modules'::regclass);

create or replace function library.apply_read_policy(p_table regclass)
returns void
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
declare
  v_name text := 'library_read_' || replace(p_table::text, '.', '_');
begin
  execute format('drop policy if exists %I on %s', v_name, p_table);
  execute format(
    'create policy %I on %s for select to authenticated, skyjet_app
       using (app.user_has_entity_access(entity_id) and app.entity_has_module(entity_id, ''library''))',
    v_name, p_table
  );
end;
$$;

select library.apply_read_policy(t) from (values
  ('library.categories'::regclass),
  ('library.tags'::regclass),
  ('library.documents'::regclass)
) as tables(t);

create policy library_read_document_tags on library.document_tags
  for select to authenticated, skyjet_app
  using (
    exists (
      select 1 from library.documents d
       where d.id = document_id
         and app.user_has_entity_access(d.entity_id)
         and app.entity_has_module(d.entity_id, 'library')
    )
  );

create policy library_read_document_links on library.document_links
  for select to authenticated, skyjet_app
  using (
    exists (
      select 1 from library.documents d
       where d.id = document_id
         and app.user_has_entity_access(d.entity_id)
         and app.entity_has_module(d.entity_id, 'library')
    )
  );

grant usage on schema library to skyjet_app, authenticated;
grant select on all tables in schema library to skyjet_app, authenticated;
alter default privileges in schema library
  grant select on tables to skyjet_app, authenticated;

revoke insert, update, delete, truncate
  on all tables in schema library
  from skyjet_app, authenticated, anon, public;

revoke insert, update, delete, truncate
  on app.modules, app.entity_modules
  from authenticated, anon, public;

revoke usage on schema library from anon;

grant execute on function
  app.entity_has_module(uuid, text),
  app.require_module(uuid, text)
to skyjet_app, authenticated;

revoke all on function
  app.entity_has_module(uuid, text),
  app.require_module(uuid, text)
from public, anon;

grant execute on function
  app.set_entity_module(uuid, text, boolean),
  library.ensure_default_categories(uuid),
  library.save_document(uuid, jsonb),
  library.archive_document(uuid, uuid),
  library.delete_document(uuid, uuid)
to skyjet_app;

revoke all on function
  app.set_entity_module(uuid, text, boolean),
  library.ensure_default_categories(uuid),
  library.save_document(uuid, jsonb),
  library.archive_document(uuid, uuid),
  library.delete_document(uuid, uuid)
from public, anon, authenticated;

create or replace view app.v_rls_coverage as
select
  n.nspname                                   as schema_name,
  c.relname                                   as table_name,
  c.relrowsecurity                            as rls_enabled,
  count(p.polname)::int                       as policy_count,
  count(p.polname) filter (
    where (select r.oid from pg_roles r where r.rolname = 'skyjet_app') = any (p.polroles)
  )::int                                      as app_role_policy_count,
  count(p.polname) filter (
    where (select r.oid from pg_roles r where r.rolname = 'authenticated') = any (p.polroles)
  )::int                                      as browser_policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname in ('app', 'gl', 'inv', 'audit', 'integration', 'sales', 'purch', 'library')
  and c.relkind = 'r'
group by n.nspname, c.relname, c.relrowsecurity
order by n.nspname, c.relname;

create or replace view app.v_function_search_path as
select
  n.nspname as schema_name,
  p.proname as function_name,
  p.prosecdef as security_definer,
  exists (
    select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as c(setting)
     where c.setting like 'search\_path=%'
  ) as search_path_pinned
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('app', 'gl', 'inv', 'integration', 'sales', 'purch', 'library')
  and p.prokind in ('f', 'p');

-- ---------------------------------------------------------------------------
-- Storage. Present on hosted / `supabase start`, absent in PGlite.
-- The bucket is private. The browser has no INSERT/UPDATE/DELETE policies;
-- uploads and downloads go through Server Actions using the service role.
-- SELECT is also denied to authenticated so a leaked anon key cannot list
-- another organisation's manuals by guessing paths.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (
       select 1 from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'storage' and c.relname = 'buckets'
     ) then
    insert into storage.buckets (id, name, public)
    values ('library-documents', 'library-documents', false)
    on conflict (id) do update
      set public = false;

    -- Defence if a future change adds a policy: restrict to this bucket and
    -- to the caller's organisation folder. Today no policy is created, so
    -- authenticated cannot read or write objects.
    perform 1;
  end if;
end;
$$;
