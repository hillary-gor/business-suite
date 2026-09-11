-- ===========================================================================
-- Library classification, restricted read, and access events.
--
-- A catalogue that every organisation member can open is not a controlled
-- library. Classification is stored on the document and enforced in RLS, not
-- as a badge. Opening or downloading a file writes library.access_events;
-- changing a row still goes through audit.log.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

insert into app.permissions (code, domain, description, is_sensitive) values
  ('library.document.read_confidential', 'library',
   'Read confidential library documents', true),
  ('library.document.read_restricted', 'library',
   'Read restricted library documents', true),
  ('library.access.read', 'library',
   'Read who opened or downloaded library documents, and when', true)
on conflict (code) do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, p.code
  from app.roles r
  cross join app.permissions p
 where r.code in ('owner', 'super_admin')
   and p.code in (
     'library.document.read_confidential',
     'library.document.read_restricted',
     'library.access.read'
   )
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values
    ('library.document.read_confidential'),
    ('library.document.read_restricted'),
    ('library.access.read')
  ) as x(code) on true
 where r.code = 'manager'
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, 'library.document.read_confidential'
  from app.roles r
 where r.code in ('inventory', 'accountant', 'procurement')
on conflict do nothing;

alter table library.documents
  add column if not exists classification text not null default 'internal';

alter table library.documents
  drop constraint if exists library_documents_classification_chk;

alter table library.documents
  add constraint library_documents_classification_chk
    check (classification in ('internal', 'confidential', 'restricted'));

comment on column library.documents.classification is
  'Access level. internal: library.document.read. confidential and restricted require the matching read permission. Enforced in RLS, not only in the UI.';

create index if not exists library_documents_entity_class_idx
  on library.documents (entity_id, classification);

create table if not exists library.access_events (
  id           uuid primary key default gen_random_uuid(),
  entity_id    uuid not null references app.entities (id) on delete restrict,
  document_id  uuid not null references library.documents (id) on delete cascade,
  actor_id     uuid references app.users (id),
  action       text not null,
  request_id   text,
  created_at   timestamptz not null default now(),
  constraint library_access_action_chk
    check (action in ('VIEW', 'PREVIEW', 'DOWNLOAD'))
);

comment on table library.access_events is
  'Who opened or retrieved a library file, and when. Append-only from record_access(). Not a substitute for audit.log row changes.';

create index if not exists library_access_events_entity_created_idx
  on library.access_events (entity_id, created_at desc);

create index if not exists library_access_events_document_created_idx
  on library.access_events (document_id, created_at desc);

select app.enforce_rls_everywhere();

-- ---------------------------------------------------------------------------
-- Who may see a document of this classification.
-- Does not query library.documents, so document RLS can call it without
-- recursion.
-- ---------------------------------------------------------------------------

create or replace function library.can_read_document(p_entity_id uuid, p_classification text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select
    app.user_has_entity_access(p_entity_id)
    and app.entity_has_module(p_entity_id, 'library')
    and app.user_has_permission(p_entity_id, 'library.document.read')
    and (
      p_classification = 'internal'
      or (
        p_classification = 'confidential'
        and app.user_has_permission(p_entity_id, 'library.document.read_confidential')
      )
      or (
        p_classification = 'restricted'
        and app.user_has_permission(p_entity_id, 'library.document.read_restricted')
      )
    );
$$;

comment on function library.can_read_document(uuid, text) is
  'True when the current actor may see a library document of this classification in this organisation.';

create or replace function library.assert_readable(p_entity_id uuid, p_document_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_class text;
begin
  select d.classification into v_class
    from library.documents d
   where d.id = p_document_id
     and d.entity_id = p_entity_id;

  if v_class is null then
    raise exception 'Document was not found' using errcode = 'no_data_found';
  end if;

  if not app.is_privileged_session()
     and not library.can_read_document(p_entity_id, v_class) then
    raise exception 'Document was not found' using errcode = 'no_data_found';
  end if;

  return v_class;
end;
$$;

comment on function library.assert_readable(uuid, uuid) is
  'Returns the document classification, or not-found, including when the actor is not cleared for that level. Used by write and access functions so SECURITY DEFINER cannot be used to touch an uncleared file.';

create or replace function library.require_classification(p_entity_id uuid, p_classification text)
returns void
language plpgsql
stable
set search_path = pg_catalog, public, extensions
as $$
begin
  if p_classification = 'internal' then
    return;
  end if;
  if p_classification = 'confidential' then
    perform app.require_permission(p_entity_id, 'library.document.read_confidential');
    return;
  end if;
  if p_classification = 'restricted' then
    perform app.require_permission(p_entity_id, 'library.document.read_restricted');
    return;
  end if;
  raise exception 'Unknown classification %', p_classification
    using errcode = 'check_violation';
end;
$$;

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
       using (
         app.user_has_entity_access(entity_id)
         and app.entity_has_module(entity_id, ''library'')
         and app.user_has_permission(entity_id, ''library.document.read'')
       )',
    v_name, p_table
  );
end;
$$;

select library.apply_read_policy(t) from (values
  ('library.categories'::regclass),
  ('library.tags'::regclass)
) as tables(t);

drop policy if exists library_read_library_documents on library.documents;
create policy library_read_library_documents on library.documents
  for select to authenticated, skyjet_app
  using (library.can_read_document(entity_id, classification));

drop policy if exists library_read_document_tags on library.document_tags;
create policy library_read_document_tags on library.document_tags
  for select to authenticated, skyjet_app
  using (
    exists (
      select 1 from library.documents d
       where d.id = document_id
    )
  );

drop policy if exists library_read_document_links on library.document_links;
create policy library_read_document_links on library.document_links
  for select to authenticated, skyjet_app
  using (
    exists (
      select 1 from library.documents d
       where d.id = document_id
    )
  );

drop policy if exists library_read_access_events on library.access_events;
create policy library_read_access_events on library.access_events
  for select to authenticated, skyjet_app
  using (
    app.user_has_entity_access(entity_id)
    and app.entity_has_module(entity_id, 'library')
    and app.user_has_permission(entity_id, 'library.access.read')
  );

-- ---------------------------------------------------------------------------
-- Writes. Classification is checked here so a stolen form cannot raise a
-- document the actor is not cleared to handle.
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
  v_class       text;
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
    v_class := coalesce(nullif(btrim(p_payload ->> 'classification'), ''), 'internal');
  else
    perform app.require_permission(p_entity_id, 'library.document.manage');
    v_is_new := false;
    v_class := library.assert_readable(p_entity_id, v_id);
    v_class := coalesce(nullif(btrim(p_payload ->> 'classification'), ''), v_class);
  end if;

  if v_class not in ('internal', 'confidential', 'restricted') then
    raise exception 'Unknown classification %', v_class using errcode = 'check_violation';
  end if;
  perform library.require_classification(p_entity_id, v_class);

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
      id, entity_id, category_id, title, description, document_type, classification,
      aircraft_type, aircraft_model, part_number, manufacturer, revision, version,
      effective_date, storage_bucket, storage_path, file_name, file_size, mime_type,
      sha256, uploaded_by, created_by, updated_by
    ) values (
      v_id, p_entity_id, v_category_id, v_title,
      nullif(btrim(coalesce(p_payload ->> 'description', '')), ''),
      v_type,
      v_class,
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
           classification = v_class,
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

create or replace function library.record_access(
  p_entity_id   uuid,
  p_document_id uuid,
  p_action      text,
  p_request_id  text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_id uuid;
begin
  perform app.require_module(p_entity_id, 'library');

  if p_action not in ('VIEW', 'PREVIEW', 'DOWNLOAD') then
    raise exception 'Unknown access action %', p_action using errcode = 'check_violation';
  end if;

  perform library.assert_readable(p_entity_id, p_document_id);

  insert into library.access_events (entity_id, document_id, actor_id, action, request_id)
  values (
    p_entity_id,
    p_document_id,
    app.acting_user_id(),
    p_action,
    nullif(btrim(coalesce(p_request_id, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function library.record_access(uuid, uuid, text, text) is
  'Appends who accessed a document. Refuses (as not found) when the actor cannot read that classification.';

create or replace function library.list_access_events(
  p_entity_id   uuid,
  p_document_id uuid default null,
  p_limit       integer default 100
)
returns table (
  id               uuid,
  document_id      uuid,
  document_title   text,
  classification   text,
  action           text,
  actor_name       text,
  actor_email      text,
  request_id       text,
  created_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.access.read');

  if p_document_id is not null
     and not exists (
       select 1 from library.documents d
        where d.id = p_document_id and d.entity_id = p_entity_id
     ) then
    raise exception 'Document was not found' using errcode = 'no_data_found';
  end if;

  return query
    select e.id,
           e.document_id,
           d.title,
           d.classification,
           e.action,
           u.full_name,
           u.email,
           e.request_id,
           e.created_at
      from library.access_events e
      join library.documents d on d.id = e.document_id
      left join app.users u on u.id = e.actor_id
     where e.entity_id = p_entity_id
       and (p_document_id is null or e.document_id = p_document_id)
     order by e.created_at desc
     limit least(coalesce(p_limit, 100), 500);
end;
$$;

comment on function library.list_access_events(uuid, uuid, integer) is
  'Access history for the organisation or one document. Bypasses document RLS so an auditor can see restricted-file access they are cleared to review.';

create or replace function library.archive_document(p_entity_id uuid, p_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.manage');
  perform library.assert_readable(p_entity_id, p_document_id);

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
  perform library.assert_readable(p_entity_id, p_document_id);

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

revoke insert, update, delete, truncate
  on library.access_events
  from skyjet_app, authenticated, anon, public;

grant select on library.access_events to skyjet_app, authenticated;

grant execute on function
  library.can_read_document(uuid, text)
to skyjet_app, authenticated;

grant execute on function
  library.assert_readable(uuid, uuid),
  library.require_classification(uuid, text),
  library.save_document(uuid, jsonb),
  library.record_access(uuid, uuid, text, text),
  library.list_access_events(uuid, uuid, integer)
to skyjet_app;

revoke all on function
  library.can_read_document(uuid, text),
  library.assert_readable(uuid, uuid),
  library.require_classification(uuid, text),
  library.save_document(uuid, jsonb),
  library.record_access(uuid, uuid, text, text),
  library.list_access_events(uuid, uuid, integer)
from public, anon;

revoke all on function
  library.assert_readable(uuid, uuid),
  library.require_classification(uuid, text),
  library.save_document(uuid, jsonb),
  library.record_access(uuid, uuid, text, text),
  library.list_access_events(uuid, uuid, integer)
from authenticated;
