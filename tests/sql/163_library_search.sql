-- ===========================================================================
-- Catalogue FTS: generated tsvector, GIN, RLS still hides uncleared hits.
-- ===========================================================================

do $$
declare
  v_suite      text := 'library search';
  v_entity     uuid := test.entity();
  v_sha        text := repeat('ef', 32);
  v_hit        uuid := gen_random_uuid();
  v_restricted uuid := gen_random_uuid();
  v_viewer     uuid := gen_random_uuid();
  v_found      integer;
  v_hidden     integer;
begin
  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_hit,
      'title', 'CFM56-7B engine AMM',
      'description', 'High bypass turbofan shop manual',
      'document_type', 'manuals',
      'classification', 'internal',
      'part_number', 'CFM56-7B27',
      'file_name', 'cfm56-amm.pdf',
      'file_size', 2048,
      'mime_type', 'application/pdf',
      'sha256', v_sha,
      'storage_path', v_entity::text || '/manuals/' || v_hit::text || '/cfm56-amm.pdf',
      'storage_bucket', 'library-documents'
    )
  );

  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_restricted,
      'title', 'ITAR export pack',
      'description', 'Restricted technical data',
      'document_type', 'technical',
      'classification', 'restricted',
      'file_name', 'itar-export.pdf',
      'file_size', 1024,
      'mime_type', 'application/pdf',
      'sha256', v_sha,
      'storage_path', v_entity::text || '/technical/' || v_restricted::text || '/itar-export.pdf',
      'storage_bucket', 'library-documents'
    )
  );

  perform test.ok(
    v_suite,
    'search_vector indexes the title',
    exists (
      select 1
        from library.documents
       where id = v_hit
         and search_vector @@ websearch_to_tsquery('simple', 'cfm56')
    )
  );

  perform test.ok(
    v_suite,
    'search_vector indexes the part number',
    exists (
      select 1
        from library.documents
       where id = v_hit
         and search_vector @@ websearch_to_tsquery('simple', 'CFM56-7B27')
    )
  );

  perform test.ok(
    v_suite,
    'a quoted phrase in the description matches',
    exists (
      select 1
        from library.documents
       where id = v_hit
         and search_vector @@ websearch_to_tsquery('simple', '"shop manual"')
    )
  );

  perform test.ok(
    v_suite,
    'the catalogue has a GIN index on search_vector',
    exists (
      select 1
        from pg_indexes
       where schemaname = 'library'
         and indexname = 'library_documents_search_idx'
    )
  );

  insert into auth.users (id, email) values (v_viewer, 'library.search.viewer@skyjet.test');
  perform app.provision_entity_user(
    v_entity, v_viewer, 'library.search.viewer@skyjet.test', 'Library Search Viewer', 'viewer'
  );

  if not (select r.rolsuper from pg_roles r where r.rolname = current_user) then
    execute format('grant skyjet_app to %I with set true, inherit false', current_user);
  end if;

  perform set_config('app.current_user_id', v_viewer::text, true);
  perform set_config('app.current_entity_id', v_entity::text, true);
  perform set_config('app.force_unprivileged', 'on', true);

  execute 'set local role skyjet_app';
  select count(*) into v_found
    from library.documents
   where id = v_hit
     and search_vector @@ websearch_to_tsquery('simple', 'cfm56');
  select count(*) into v_hidden
    from library.documents
   where id = v_restricted
     and search_vector @@ websearch_to_tsquery('simple', 'itar');
  execute 'set local role none';

  perform test.eq_num(v_suite, 'FTS still returns an internal document to a viewer', v_found, 1);
  perform test.eq_num(
    v_suite,
    'FTS does not leak a restricted row the viewer cannot open',
    v_hidden,
    0
  );

  perform set_config('app.force_unprivileged', '', true);
  perform set_config('app.current_user_id', '', true);
end;
$$;
