-- ===========================================================================
-- Collections: mixed-type piles, not a second category tree.
-- ===========================================================================

do $$
declare
  v_suite text := 'library collections';
  v_entity uuid := test.entity();
  v_sha    text := repeat('33', 32);
  v_doc    uuid := gen_random_uuid();
  v_col    uuid;
  v_count  integer;
  v_viewer uuid := gen_random_uuid();
begin
  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_doc,
      'title', 'AOG pack AMM',
      'document_type', 'manuals',
      'classification', 'internal',
      'file_name', 'amm.pdf',
      'file_size', 1024,
      'mime_type', 'application/pdf',
      'sha256', v_sha,
      'storage_path', v_entity::text || '/manuals/' || v_doc::text || '/amm.pdf',
      'storage_bucket', 'library-documents'
    )
  );

  v_col := library.save_collection(
    v_entity,
    jsonb_build_object('name', 'AOG pack', 'description', 'Mixed types for a grounded aircraft')
  );

  perform test.ok(v_suite, 'save_collection returns an id', v_col is not null);

  perform library.add_to_collection(v_entity, v_col, v_doc);

  perform test.eq_num(
    v_suite,
    'the document is in the collection',
    (select count(*) from library.collection_documents where collection_id = v_col),
    1
  );

  perform library.add_to_collection(v_entity, v_col, v_doc);
  perform test.eq_num(
    v_suite,
    'adding the same document twice is a no-op',
    (select count(*) from library.collection_documents where collection_id = v_col),
    1
  );

  perform test.throws(
    v_suite,
    'two collections cannot share a name in the organisation',
    format(
      $q$select library.save_collection(%L::uuid, jsonb_build_object('name', 'AOG pack'))$q$,
      v_entity
    ),
    'duplicate'
  );

  perform library.delete_collection(v_entity, v_col);
  select count(*) into v_count from library.documents where id = v_doc;
  perform test.eq_num(v_suite, 'deleting a collection keeps the catalogue row', v_count, 1);

  insert into auth.users (id, email) values (v_viewer, 'library.col.viewer@skyjet.test');
  perform app.provision_entity_user(
    v_entity, v_viewer, 'library.col.viewer@skyjet.test', 'Library Col Viewer', 'viewer'
  );
  perform set_config('app.current_user_id', v_viewer::text, true);
  perform set_config('app.current_entity_id', v_entity::text, true);
  perform set_config('app.force_unprivileged', 'on', true);

  perform test.throws(
    v_suite,
    'a viewer cannot create a collection',
    format(
      $q$select library.save_collection(%L::uuid, jsonb_build_object('name', 'Secret pile'))$q$,
      v_entity
    ),
    'permission denied'
  );

  perform set_config('app.force_unprivileged', '', true);
  perform set_config('app.current_user_id', '', true);

  perform test.ok(
    v_suite,
    'skyjet_app has no insert on library.collections',
    not has_table_privilege('skyjet_app', 'library.collections', 'INSERT')
  );
end;
$$;
