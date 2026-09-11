-- ===========================================================================
-- OCR jobs, mixed-type collections, and polymorphic document links.
--
-- OCR writes extracted_text onto the revision that was scanned. It is not a
-- second search engine. Collections are named piles across categories.
-- Links attach a file to an item, user, employee or supplier in this org.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

create or replace function library.require_upload_or_manage(p_entity_id uuid)
returns void
language plpgsql
stable
set search_path = pg_catalog, public, extensions
as $$
begin
  if app.is_privileged_session() then
    return;
  end if;
  if app.user_has_permission(p_entity_id, 'library.document.manage')
     or app.user_has_permission(p_entity_id, 'library.document.upload') then
    return;
  end if;
  raise exception 'Permission denied: library.document.upload is required on entity %', p_entity_id
    using errcode = 'insufficient_privilege';
end;
$$;

-- ---------------------------------------------------------------------------
-- OCR jobs
-- ---------------------------------------------------------------------------

create table library.ocr_jobs (
  id            uuid primary key default gen_random_uuid(),
  entity_id     uuid not null references app.entities (id) on delete restrict,
  document_id   uuid not null references library.documents (id) on delete cascade,
  revision_id   uuid not null references library.document_revisions (id) on delete cascade,
  storage_path  text not null,
  mime_type     text not null,
  status        text not null default 'queued',
  attempts      integer not null default 0,
  last_error    text,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  created_by    uuid references app.users (id),
  constraint library_ocr_jobs_status_chk
    check (status in ('queued', 'running', 'done', 'failed', 'skipped'))
);

comment on table library.ocr_jobs is
  'Background OCR for scans with no PDF/text layer. Completing a job writes extracted_text; search_vector stays generated.';

create unique index library_ocr_jobs_open_uq
  on library.ocr_jobs (document_id)
  where status in ('queued', 'running');

create index library_ocr_jobs_document_idx
  on library.ocr_jobs (document_id, created_at desc);

select app.enable_audit('library.ocr_jobs');

-- ---------------------------------------------------------------------------
-- Collections (mixed types). Categories remain the type taxonomy.
-- ---------------------------------------------------------------------------

create table library.collections (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references app.entities (id) on delete restrict,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid,
  constraint library_collections_name_chk
    check (char_length(btrim(name)) between 1 and 80)
);

comment on table library.collections is
  'Named piles of documents that can mix categories. Not a replacement for manuals vs certificates.';

create unique index library_collections_entity_name_uq
  on library.collections (entity_id, lower(btrim(name)));

create table library.collection_documents (
  collection_id uuid not null references library.collections (id) on delete cascade,
  document_id   uuid not null references library.documents (id) on delete cascade,
  added_at      timestamptz not null default now(),
  added_by      uuid references app.users (id),
  primary key (collection_id, document_id)
);

select app.enable_updated_at('library.collections');
select app.enable_audit('library.collections');
select app.enable_audit('library.collection_documents');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

select app.enforce_rls_everywhere();

select library.apply_read_policy('library.collections'::regclass);

create policy library_read_collection_documents on library.collection_documents
  for select to authenticated, skyjet_app
  using (
    exists (
      select 1 from library.collections c
       where c.id = collection_id
    )
  );

create policy library_read_ocr_jobs on library.ocr_jobs
  for select to authenticated, skyjet_app
  using (
    exists (
      select 1 from library.documents d
       where d.id = document_id
    )
  );

grant select on library.ocr_jobs, library.collections, library.collection_documents
  to skyjet_app, authenticated;

revoke insert, update, delete, truncate
  on library.ocr_jobs, library.collections, library.collection_documents
  from skyjet_app, authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- OCR functions
-- ---------------------------------------------------------------------------

create or replace function library.enqueue_ocr(
  p_entity_id   uuid,
  p_document_id uuid,
  p_force       boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_mime text;
  v_path text;
  v_text text;
  v_rev  uuid;
  v_job  uuid;
begin
  perform app.require_module(p_entity_id, 'library');
  perform library.require_upload_or_manage(p_entity_id);
  perform library.assert_readable(p_entity_id, p_document_id);

  select d.mime_type, d.storage_path, d.extracted_text
    into v_mime, v_path, v_text
    from library.documents d
   where d.id = p_document_id and d.entity_id = p_entity_id;

  if v_mime is null then
    raise exception 'Document was not found' using errcode = 'no_data_found';
  end if;

  if v_mime not in (
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/tiff'
  ) then
    raise exception 'OCR is only for PDFs and images' using errcode = 'check_violation';
  end if;

  if not p_force and v_text is not null then
    return null;
  end if;

  select r.id into v_rev
    from library.document_revisions r
   where r.document_id = p_document_id
     and r.is_current;

  if v_rev is null then
    raise exception 'Document has no current file revision' using errcode = 'no_data_found';
  end if;

  select id into v_job
    from library.ocr_jobs
   where document_id = p_document_id
     and status = 'running'
   limit 1;
  if v_job is not null then
    return v_job;
  end if;

  update library.ocr_jobs
     set status = 'skipped',
         last_error = 'Superseded by a newer OCR request',
         finished_at = now()
   where document_id = p_document_id
     and status = 'queued';

  insert into library.ocr_jobs (
    entity_id, document_id, revision_id, storage_path, mime_type, created_by
  ) values (
    p_entity_id, p_document_id, v_rev, v_path, v_mime, app.acting_user_id()
  )
  returning id into v_job;

  return v_job;
end;
$$;

create or replace function library.claim_ocr_job(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_id uuid;
begin
  update library.ocr_jobs
     set status = 'running',
         started_at = now(),
         attempts = attempts + 1
   where id = p_job_id
     and status = 'queued'
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function library.finish_ocr_job(
  p_job_id uuid,
  p_status text,
  p_error  text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if p_status not in ('done', 'failed', 'skipped') then
    raise exception 'Unknown OCR status %', p_status using errcode = 'check_violation';
  end if;

  update library.ocr_jobs
     set status = p_status,
         last_error = nullif(btrim(coalesce(p_error, '')), ''),
         finished_at = now()
   where id = p_job_id
     and status in ('queued', 'running');

  if not found then
    raise exception 'OCR job was not found' using errcode = 'no_data_found';
  end if;

  return p_job_id;
end;
$$;

create or replace function library.apply_ocr_text(
  p_entity_id uuid,
  p_job_id    uuid,
  p_text      text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_job library.ocr_jobs%rowtype;
  v_text text;
begin
  perform app.require_module(p_entity_id, 'library');
  perform library.require_upload_or_manage(p_entity_id);

  select * into v_job
    from library.ocr_jobs
   where id = p_job_id
     and entity_id = p_entity_id;

  if not found then
    raise exception 'OCR job was not found' using errcode = 'no_data_found';
  end if;

  perform library.assert_readable(p_entity_id, v_job.document_id);

  v_text := nullif(left(btrim(coalesce(p_text, '')), 500000), '');
  if v_text is null then
    perform library.finish_ocr_job(p_job_id, 'skipped', 'OCR found no usable text');
    return v_job.document_id;
  end if;

  update library.document_revisions
     set extracted_text = v_text
   where id = v_job.revision_id;

  update library.documents
     set extracted_text = v_text,
         updated_by = app.acting_user_id()
   where id = v_job.document_id
     and entity_id = p_entity_id
     and exists (
       select 1 from library.document_revisions r
        where r.id = v_job.revision_id
          and r.document_id = v_job.document_id
          and r.is_current
     );

  update library.ocr_jobs
     set status = 'done',
         last_error = null,
         finished_at = now()
   where id = p_job_id;

  return v_job.document_id;
end;
$$;

comment on function library.apply_ocr_text(uuid, uuid, text) is
  'Writes OCR text onto the scanned revision. The catalogue card is updated only if that revision is still current.';

-- ---------------------------------------------------------------------------
-- Collections
-- ---------------------------------------------------------------------------

create or replace function library.save_collection(p_entity_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_id   uuid := nullif(p_payload ->> 'collection_id', '')::uuid;
  v_name text := btrim(coalesce(p_payload ->> 'name', ''));
  v_desc text := nullif(btrim(coalesce(p_payload ->> 'description', '')), '');
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.manage');

  if char_length(v_name) < 1 then
    raise exception 'A collection name is required' using errcode = 'null_value_not_allowed';
  end if;
  if char_length(v_name) > 80 then
    raise exception 'Collection name is too long' using errcode = 'check_violation';
  end if;

  if v_id is null then
    insert into library.collections (entity_id, name, description, created_by, updated_by)
    values (p_entity_id, v_name, v_desc, app.acting_user_id(), app.acting_user_id())
    returning id into v_id;
  else
    update library.collections
       set name = v_name,
           description = v_desc,
           updated_by = app.acting_user_id()
     where id = v_id and entity_id = p_entity_id;
    if not found then
      raise exception 'Collection was not found' using errcode = 'no_data_found';
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function library.delete_collection(p_entity_id uuid, p_collection_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.manage');

  delete from library.collections
   where id = p_collection_id and entity_id = p_entity_id;

  if not found then
    raise exception 'Collection was not found' using errcode = 'no_data_found';
  end if;

  return p_collection_id;
end;
$$;

create or replace function library.add_to_collection(
  p_entity_id     uuid,
  p_collection_id uuid,
  p_document_id   uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.manage');
  perform library.assert_readable(p_entity_id, p_document_id);

  if not exists (
    select 1 from library.collections
     where id = p_collection_id and entity_id = p_entity_id
  ) then
    raise exception 'Collection was not found' using errcode = 'no_data_found';
  end if;

  insert into library.collection_documents (collection_id, document_id, added_by)
  values (p_collection_id, p_document_id, app.acting_user_id())
  on conflict do nothing;

  return p_document_id;
end;
$$;

create or replace function library.remove_from_collection(
  p_entity_id     uuid,
  p_collection_id uuid,
  p_document_id   uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.manage');

  if not exists (
    select 1 from library.collections
     where id = p_collection_id and entity_id = p_entity_id
  ) then
    raise exception 'Collection was not found' using errcode = 'no_data_found';
  end if;

  delete from library.collection_documents
   where collection_id = p_collection_id
     and document_id = p_document_id;

  return p_document_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Links: item, user, employee, supplier. Not invoices.
-- ---------------------------------------------------------------------------

create or replace function library.link_kind_parts(p_kind text, out schema_name text, out table_name text)
returns record
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  if p_kind = 'item' then
    schema_name := 'inv';
    table_name := 'items';
  elsif p_kind = 'user' then
    schema_name := 'app';
    table_name := 'users';
  elsif p_kind = 'employee' then
    schema_name := 'app';
    table_name := 'employees';
  elsif p_kind = 'supplier' then
    schema_name := 'app';
    table_name := 'suppliers';
  else
    raise exception 'Unknown link type %', p_kind using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function library.assert_link_target(
  p_entity_id uuid,
  p_kind      text,
  p_record_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_ok boolean := false;
begin
  if p_kind = 'item' then
    select exists (
      select 1 from inv.items i
       where i.id = p_record_id and i.entity_id = p_entity_id
    ) into v_ok;
  elsif p_kind = 'user' then
    select exists (
      select 1
        from app.users u
        join app.user_roles ur on ur.user_id = u.id and ur.entity_id = p_entity_id
       where u.id = p_record_id
    ) into v_ok;
  elsif p_kind = 'employee' then
    select exists (
      select 1 from app.employees e
       where e.id = p_record_id and e.entity_id = p_entity_id
    ) into v_ok;
  elsif p_kind = 'supplier' then
    select exists (
      select 1 from app.suppliers s
       where s.id = p_record_id and s.entity_id = p_entity_id
    ) into v_ok;
  else
    raise exception 'Unknown link type %', p_kind using errcode = 'check_violation';
  end if;

  if not v_ok then
    raise exception 'That record was not found in this organisation' using errcode = 'no_data_found';
  end if;
end;
$$;

create or replace function library.link_document(
  p_entity_id   uuid,
  p_document_id uuid,
  p_kind        text,
  p_record_id   uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_schema text;
  v_table  text;
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.manage');
  perform library.assert_readable(p_entity_id, p_document_id);
  perform library.assert_link_target(p_entity_id, p_kind, p_record_id);

  select schema_name, table_name
    into v_schema, v_table
    from library.link_kind_parts(p_kind);

  insert into library.document_links (
    document_id, record_schema, record_table, record_id, linked_by
  ) values (
    p_document_id, v_schema, v_table, p_record_id, app.acting_user_id()
  )
  on conflict do nothing;

  return p_document_id;
end;
$$;

create or replace function library.unlink_document(
  p_entity_id   uuid,
  p_document_id uuid,
  p_kind        text,
  p_record_id   uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_schema text;
  v_table  text;
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.manage');
  perform library.assert_readable(p_entity_id, p_document_id);

  select schema_name, table_name
    into v_schema, v_table
    from library.link_kind_parts(p_kind);

  delete from library.document_links
   where document_id = p_document_id
     and record_schema = v_schema
     and record_table = v_table
     and record_id = p_record_id
     and link_role = 'RELATED';

  return p_document_id;
end;
$$;

create or replace function library.list_document_links(p_entity_id uuid, p_document_id uuid)
returns table (
  kind       text,
  record_id  uuid,
  label      text,
  hint       text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  perform app.require_module(p_entity_id, 'library');
  perform library.assert_readable(p_entity_id, p_document_id);

  return query
    select case
             when l.record_schema = 'inv' and l.record_table = 'items' then 'item'
             when l.record_schema = 'app' and l.record_table = 'users' then 'user'
             when l.record_schema = 'app' and l.record_table = 'employees' then 'employee'
             when l.record_schema = 'app' and l.record_table = 'suppliers' then 'supplier'
             else l.record_table
           end,
           l.record_id,
           coalesce(
             i.part_number || ' · ' || i.description,
             u.full_name,
             e.display_name,
             coalesce(nullif(s.trading_name, ''), s.legal_name),
             l.record_id::text
           ),
           coalesce(i.part_number, u.email, e.employee_no, s.code),
           l.linked_at
      from library.document_links l
      left join inv.items i
        on i.id = l.record_id
       and l.record_schema = 'inv' and l.record_table = 'items'
       and i.entity_id = p_entity_id
      left join app.users u
        on u.id = l.record_id
       and l.record_schema = 'app' and l.record_table = 'users'
      left join app.employees e
        on e.id = l.record_id
       and l.record_schema = 'app' and l.record_table = 'employees'
       and e.entity_id = p_entity_id
      left join app.suppliers s
        on s.id = l.record_id
       and l.record_schema = 'app' and l.record_table = 'suppliers'
       and s.entity_id = p_entity_id
     where l.document_id = p_document_id
     order by l.linked_at desc;
end;
$$;

create or replace function library.search_link_targets(
  p_entity_id uuid,
  p_kind      text,
  p_query     text,
  p_limit     integer default 20
)
returns table (
  kind      text,
  record_id uuid,
  label     text,
  hint      text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_q     text;
  v_limit integer := least(coalesce(p_limit, 20), 50);
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.manage');

  v_q := replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_');

  if p_kind = 'item' then
    return query
      select 'item'::text, i.id,
             i.part_number || ' · ' || i.description,
             i.part_number
        from inv.items i
       where i.entity_id = p_entity_id
         and i.is_active
         and (
           v_q = ''
           or i.part_number ilike '%' || v_q || '%' escape '\'
           or i.description ilike '%' || v_q || '%' escape '\'
         )
       order by i.part_number
       limit v_limit;
  elsif p_kind = 'user' then
    return query
      select 'user'::text, u.id, u.full_name, u.email
        from app.users u
        join app.user_roles ur on ur.user_id = u.id and ur.entity_id = p_entity_id
       where u.is_active
         and (
           v_q = ''
           or u.full_name ilike '%' || v_q || '%' escape '\'
           or u.email ilike '%' || v_q || '%' escape '\'
         )
       order by u.full_name
       limit v_limit;
  elsif p_kind = 'employee' then
    return query
      select 'employee'::text, e.id, e.display_name, e.employee_no
        from app.employees e
       where e.entity_id = p_entity_id
         and (
           v_q = ''
           or e.display_name ilike '%' || v_q || '%' escape '\'
           or coalesce(e.employee_no, '') ilike '%' || v_q || '%' escape '\'
           or coalesce(e.email, '') ilike '%' || v_q || '%' escape '\'
         )
       order by e.display_name
       limit v_limit;
  elsif p_kind = 'supplier' then
    return query
      select 'supplier'::text, s.id,
             coalesce(nullif(s.trading_name, ''), s.legal_name),
             s.code
        from app.suppliers s
       where s.entity_id = p_entity_id
         and s.is_active
         and (
           v_q = ''
           or s.legal_name ilike '%' || v_q || '%' escape '\'
           or coalesce(s.trading_name, '') ilike '%' || v_q || '%' escape '\'
           or s.code ilike '%' || v_q || '%' escape '\'
         )
       order by s.legal_name
       limit v_limit;
  else
    raise exception 'Unknown link type %', p_kind using errcode = 'check_violation';
  end if;
end;
$$;

comment on function library.search_link_targets(uuid, text, text, integer) is
  'Label lookup for linking a library file. Returns names only, not HR or stock quantities. Not a Business Suite search.';

comment on function library.link_document(uuid, uuid, text, uuid) is
  'Attaches a document to an item, user, employee or supplier in this organisation.';

grant execute on function
  library.require_upload_or_manage(uuid),
  library.enqueue_ocr(uuid, uuid, boolean),
  library.claim_ocr_job(uuid),
  library.finish_ocr_job(uuid, text, text),
  library.apply_ocr_text(uuid, uuid, text),
  library.save_collection(uuid, jsonb),
  library.delete_collection(uuid, uuid),
  library.add_to_collection(uuid, uuid, uuid),
  library.remove_from_collection(uuid, uuid, uuid),
  library.link_kind_parts(text),
  library.assert_link_target(uuid, text, uuid),
  library.link_document(uuid, uuid, text, uuid),
  library.unlink_document(uuid, uuid, text, uuid),
  library.list_document_links(uuid, uuid),
  library.search_link_targets(uuid, text, text, integer)
to skyjet_app;

revoke all on function
  library.require_upload_or_manage(uuid),
  library.enqueue_ocr(uuid, uuid, boolean),
  library.claim_ocr_job(uuid),
  library.finish_ocr_job(uuid, text, text),
  library.apply_ocr_text(uuid, uuid, text),
  library.save_collection(uuid, jsonb),
  library.delete_collection(uuid, uuid),
  library.add_to_collection(uuid, uuid, uuid),
  library.remove_from_collection(uuid, uuid, uuid),
  library.link_kind_parts(text),
  library.assert_link_target(uuid, text, uuid),
  library.link_document(uuid, uuid, text, uuid),
  library.unlink_document(uuid, uuid, text, uuid),
  library.list_document_links(uuid, uuid),
  library.search_link_targets(uuid, text, text, integer)
from public, anon, authenticated;
