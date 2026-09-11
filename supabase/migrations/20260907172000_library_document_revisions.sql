-- ===========================================================================
-- File revisions. Replace keeps the previous bytes. Restore is a pointer
-- move, not a copy. Delete returns every stored path so the action can
-- remove them all.
--
-- Existing objects stay at {entity}/{type}/{id}/{fileName} as revision 1.
-- New uploads and replacements use {entity}/{type}/{id}/{revisionId}/{fileName}.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

create table library.document_revisions (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references library.documents (id) on delete cascade,
  entity_id       uuid not null references app.entities (id) on delete restrict,
  revision_no     integer not null,
  storage_path    text not null,
  file_name       text not null,
  file_size       bigint not null,
  mime_type       text not null,
  sha256          char(64) not null,
  extracted_text  text,
  is_current      boolean not null default false,
  created_at      timestamptz not null default now(),
  created_by      uuid references app.users (id),
  constraint library_document_revisions_no_chk
    check (revision_no > 0),
  constraint library_document_revisions_size_chk
    check (file_size > 0 and file_size <= 33554432),
  constraint library_document_revisions_sha_chk
    check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint library_document_revisions_path_entity_chk
    check (storage_path like entity_id::text || '/%'),
  constraint library_document_revisions_doc_no_uq unique (document_id, revision_no)
);

comment on table library.document_revisions is
  'Each stored file for a library document. The catalogue row points at the current revision. Previous bytes stay until the document is deleted.';

comment on column library.document_revisions.storage_path is
  'Path inside library-documents. Legacy: {entity}/{type}/{id}/{fileName}. Later revisions: {entity}/{type}/{id}/{revision_id}/{fileName}.';

comment on column library.document_revisions.is_current is
  'Exactly one current revision per document. Restore flips this flag; it does not copy the blob.';

comment on column library.documents.storage_path is
  'Path of the current file inside library-documents. Legacy rows: {entity_id}/{document_type}/{document_id}/{file_name}. Later files: {entity_id}/{document_type}/{document_id}/{revision_id}/{file_name}.';

create unique index library_document_revisions_current_uq
  on library.document_revisions (document_id)
  where is_current;

create unique index library_document_revisions_path_uq
  on library.document_revisions (storage_path);

create index library_document_revisions_document_idx
  on library.document_revisions (document_id, revision_no desc);

select app.enable_audit('library.document_revisions');
select app.enforce_rls_everywhere();

create policy library_read_document_revisions on library.document_revisions
  for select to authenticated, skyjet_app
  using (
    exists (
      select 1 from library.documents d
       where d.id = document_id
    )
  );

grant select on library.document_revisions to skyjet_app, authenticated;

revoke insert, update, delete, truncate
  on library.document_revisions
  from skyjet_app, authenticated, anon, public;

insert into library.document_revisions (
  document_id, entity_id, revision_no, storage_path, file_name, file_size,
  mime_type, sha256, extracted_text, is_current, created_at, created_by
)
select d.id,
       d.entity_id,
       1,
       d.storage_path,
       d.file_name,
       d.file_size,
       d.mime_type,
       d.sha256,
       d.extracted_text,
       true,
       d.created_at,
       coalesce(d.uploaded_by, d.created_by)
  from library.documents d
 where not exists (
   select 1 from library.document_revisions r where r.document_id = d.id
 );

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
  v_extracted   text;
  v_revision_id uuid := nullif(p_payload ->> 'revision_id', '')::uuid;
  v_legacy_path text;
  v_rev_path    text;
  v_next_no     integer;
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

  if p_payload ? 'extracted_text' then
    v_extracted := nullif(left(btrim(coalesce(p_payload ->> 'extracted_text', '')), 500000), '');
  end if;

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

    if not v_is_new and v_revision_id is null then
      raise exception 'Replacing a file requires a new revision id'
        using errcode = 'check_violation';
    end if;

    v_legacy_path := p_entity_id::text || '/' || v_type || '/' || v_id::text || '/' || v_file_name;
    v_rev_path := p_entity_id::text || '/' || v_type || '/' || v_id::text || '/'
                  || coalesce(v_revision_id::text, '') || '/' || v_file_name;

    if v_revision_id is not null then
      if v_path is distinct from v_rev_path then
        raise exception 'Storage path does not match this organisation and document'
          using errcode = 'check_violation';
      end if;
    elsif v_path is distinct from v_legacy_path then
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
      sha256, extracted_text, uploaded_by, created_by, updated_by
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
      v_extracted,
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
           extracted_text = case
             when v_has_file and (p_payload ? 'extracted_text') then v_extracted
             when v_has_file then null
             when p_payload ? 'extracted_text' then v_extracted
             else extracted_text
           end,
           updated_by     = app.acting_user_id()
     where id = v_id and entity_id = p_entity_id;
  end if;

  if v_has_file then
    if not v_is_new then
      update library.document_revisions
         set is_current = false
       where document_id = v_id
         and is_current;
    end if;

    select coalesce(max(revision_no), 0) + 1
      into v_next_no
      from library.document_revisions
     where document_id = v_id;

    insert into library.document_revisions (
      id, document_id, entity_id, revision_no, storage_path, file_name, file_size,
      mime_type, sha256, extracted_text, is_current, created_by
    ) values (
      coalesce(v_revision_id, gen_random_uuid()),
      v_id,
      p_entity_id,
      v_next_no,
      v_path,
      v_file_name,
      v_file_size,
      v_mime,
      v_sha,
      case when p_payload ? 'extracted_text' then v_extracted else null end,
      true,
      app.acting_user_id()
    );
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

create or replace function library.restore_revision(
  p_entity_id   uuid,
  p_document_id uuid,
  p_revision_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_rev library.document_revisions%rowtype;
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.manage');
  perform library.assert_readable(p_entity_id, p_document_id);

  select * into v_rev
    from library.document_revisions
   where id = p_revision_id
     and document_id = p_document_id
     and entity_id = p_entity_id;

  if not found then
    raise exception 'Revision was not found' using errcode = 'no_data_found';
  end if;

  if not v_rev.is_current then
    update library.document_revisions
       set is_current = false
     where document_id = p_document_id
       and is_current;

    update library.document_revisions
       set is_current = true
     where id = p_revision_id;
  end if;

  update library.documents
     set storage_path   = v_rev.storage_path,
         file_name      = v_rev.file_name,
         file_size      = v_rev.file_size,
         mime_type      = v_rev.mime_type,
         sha256         = v_rev.sha256,
         extracted_text = v_rev.extracted_text,
         updated_by     = app.acting_user_id()
   where id = p_document_id
     and entity_id = p_entity_id;

  return p_document_id;
end;
$$;

comment on function library.restore_revision(uuid, uuid, uuid) is
  'Makes an existing revision current. Does not copy or delete stored bytes.';

drop function if exists library.delete_document(uuid, uuid);

create function library.delete_document(p_entity_id uuid, p_document_id uuid)
returns text[]
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_paths text[];
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.manage');
  perform library.assert_readable(p_entity_id, p_document_id);

  if not exists (
    select 1 from library.documents
     where id = p_document_id and entity_id = p_entity_id
  ) then
    raise exception 'Document was not found' using errcode = 'no_data_found';
  end if;

  select coalesce(array_agg(distinct p.storage_path), '{}')
    into v_paths
    from (
      select r.storage_path
        from library.document_revisions r
       where r.document_id = p_document_id
      union
      select d.storage_path
        from library.documents d
       where d.id = p_document_id
         and d.entity_id = p_entity_id
    ) as p;

  delete from library.documents
   where id = p_document_id and entity_id = p_entity_id;

  return v_paths;
end;
$$;

comment on function library.delete_document(uuid, uuid) is
  'Removes the catalogue row and returns every revision storage path so the application can delete the blobs.';

grant execute on function
  library.save_document(uuid, jsonb),
  library.restore_revision(uuid, uuid, uuid),
  library.delete_document(uuid, uuid)
to skyjet_app;

revoke all on function
  library.save_document(uuid, jsonb),
  library.restore_revision(uuid, uuid, uuid),
  library.delete_document(uuid, uuid)
from public, anon, authenticated;
