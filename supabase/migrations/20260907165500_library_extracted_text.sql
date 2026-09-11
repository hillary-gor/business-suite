-- ===========================================================================
-- Index the words inside the file, not only the catalogue card.
--
-- search_vector is generated; it must be dropped and rebuilt to include
-- extracted_text. Bytes are still stored in the bucket. This column is the
-- extracted text layer (PDF text, plain text, CSV). Scanned PDFs with no
-- text layer stay empty until OCR exists.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

drop index if exists library.library_documents_search_idx;

alter table library.documents drop column if exists search_vector;

alter table library.documents
  add column if not exists extracted_text text;

comment on column library.documents.extracted_text is
  'Text extracted at upload or replace. Truncated. Not OCR. Null when the type has no text layer.';

create index if not exists library_documents_sha_idx
  on library.documents (entity_id, sha256)
  where status = 'ACTIVE';

alter table library.documents
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(part_number, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(file_name, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(manufacturer, '')), 'B')
    || setweight(
         to_tsvector(
           'simple',
           coalesce(aircraft_type, '') || ' ' || coalesce(aircraft_model, '')
         ),
         'B'
       )
    || setweight(
         to_tsvector(
           'simple',
           coalesce(revision, '') || ' ' || coalesce(version, '')
         ),
         'C'
       )
    || setweight(to_tsvector('simple', coalesce(description, '')), 'D')
    || setweight(to_tsvector('simple', left(coalesce(extracted_text, ''), 200000)), 'C')
  ) stored;

comment on column library.documents.search_vector is
  'Catalogue plus extracted file text. Title and part number still outrank the body.';

create index library_documents_search_idx
  on library.documents using gin (search_vector);

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
           extracted_text = case when p_payload ? 'extracted_text' then v_extracted else extracted_text end,
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
