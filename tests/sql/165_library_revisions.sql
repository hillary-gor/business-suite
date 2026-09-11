-- ===========================================================================
-- File revisions: replace keeps the old path, restore is a pointer move,
-- delete returns every stored path, clearance still hides restricted rows.
-- ===========================================================================

do $$
declare
  v_suite      text := 'library revisions';
  v_entity     uuid := test.entity();
  v_sha1       text := repeat('11', 32);
  v_sha2       text := repeat('22', 32);
  v_id         uuid := gen_random_uuid();
  v_rev2       uuid := gen_random_uuid();
  v_restricted uuid := gen_random_uuid();
  v_path1      text;
  v_path2      text;
  v_paths      text[];
  v_count      integer;
  v_visible    integer;
  v_stock      uuid := gen_random_uuid();
  v_viewer     uuid := gen_random_uuid();
  v_old_rev    uuid;
begin
  v_path1 := v_entity::text || '/manuals/' || v_id::text || '/amm.pdf';

  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_id,
      'title', '737 AMM',
      'document_type', 'manuals',
      'classification', 'internal',
      'file_name', 'amm.pdf',
      'file_size', 1024,
      'mime_type', 'application/pdf',
      'sha256', v_sha1,
      'storage_path', v_path1,
      'storage_bucket', 'library-documents',
      'extracted_text', 'original turbine chapter'
    )
  );

  perform test.eq_num(
    v_suite,
    'the first file is stored as revision 1',
    (select count(*) from library.document_revisions where document_id = v_id),
    1
  );

  perform test.ok(
    v_suite,
    'revision 1 is current and keeps the legacy path',
    exists (
      select 1 from library.document_revisions
       where document_id = v_id
         and revision_no = 1
         and is_current
         and storage_path = v_path1
         and sha256 = v_sha1
    )
  );

  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'document_id', v_id,
      'title', '737 AMM',
      'document_type', 'manuals',
      'classification', 'internal'
    )
  );

  perform test.eq_num(
    v_suite,
    'a metadata-only save does not add a revision',
    (select count(*) from library.document_revisions where document_id = v_id),
    1
  );

  perform test.throws(
    v_suite,
    'replacing a file without a revision id is refused',
    format(
      $q$select library.save_document(%L::uuid, jsonb_build_object(
            'document_id', %L::uuid,
            'title', '737 AMM',
            'document_type', 'manuals',
            'file_name', 'amm-r2.pdf',
            'file_size', 2048,
            'mime_type', 'application/pdf',
            'sha256', %L,
            'storage_path', %L,
            'storage_bucket', 'library-documents'
          ))$q$,
      v_entity, v_id, v_sha2, v_path1
    ),
    'revision id'
  );

  v_path2 := v_entity::text || '/manuals/' || v_id::text || '/' || v_rev2::text || '/amm-r2.pdf';

  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'document_id', v_id,
      'title', '737 AMM',
      'document_type', 'manuals',
      'classification', 'internal',
      'file_name', 'amm-r2.pdf',
      'file_size', 2048,
      'mime_type', 'application/pdf',
      'sha256', v_sha2,
      'storage_path', v_path2,
      'storage_bucket', 'library-documents',
      'revision_id', v_rev2,
      'extracted_text', 'replaced fan chapter'
    )
  );

  perform test.eq_num(
    v_suite,
    'replace adds a second revision',
    (select count(*) from library.document_revisions where document_id = v_id),
    2
  );

  perform test.ok(
    v_suite,
    'the previous path is still on revision 1',
    exists (
      select 1 from library.document_revisions
       where document_id = v_id
         and revision_no = 1
         and not is_current
         and storage_path = v_path1
         and sha256 = v_sha1
    )
  );

  perform test.ok(
    v_suite,
    'the catalogue now points at the new file',
    exists (
      select 1 from library.documents
       where id = v_id
         and storage_path = v_path2
         and sha256 = v_sha2
         and extracted_text = 'replaced fan chapter'
    )
  );

  select id into v_old_rev
    from library.document_revisions
   where document_id = v_id and revision_no = 1;

  perform library.restore_revision(v_entity, v_id, v_old_rev);

  perform test.ok(
    v_suite,
    'restore makes revision 1 current without inventing a third row',
    (select count(*) from library.document_revisions where document_id = v_id) = 2
    and exists (
      select 1 from library.document_revisions
       where id = v_old_rev and is_current
    )
    and exists (
      select 1 from library.documents
       where id = v_id
         and storage_path = v_path1
         and sha256 = v_sha1
         and extracted_text = 'original turbine chapter'
    )
  );

  v_paths := library.delete_document(v_entity, v_id);
  perform test.eq_num(v_suite, 'delete returns both stored paths', cardinality(v_paths), 2);
  perform test.ok(
    v_suite,
    'delete lists the original and replacement paths',
    v_path1 = any (v_paths) and v_path2 = any (v_paths)
  );
  perform test.eq_num(
    v_suite,
    'delete removes the catalogue row',
    (select count(*) from library.documents where id = v_id),
    0
  );

  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_restricted,
      'title', 'Restricted export file',
      'document_type', 'technical',
      'classification', 'restricted',
      'file_name', 'itar.pdf',
      'file_size', 1024,
      'mime_type', 'application/pdf',
      'sha256', v_sha1,
      'storage_path', v_entity::text || '/technical/' || v_restricted::text || '/itar.pdf',
      'storage_bucket', 'library-documents'
    )
  );

  insert into auth.users (id, email) values (v_viewer, 'library.rev.viewer@skyjet.test');
  perform app.provision_entity_user(
    v_entity, v_viewer, 'library.rev.viewer@skyjet.test', 'Library Rev Viewer', 'viewer'
  );

  insert into auth.users (id, email) values (v_stock, 'library.rev.stock@skyjet.test');
  perform app.provision_entity_user(
    v_entity, v_stock, 'library.rev.stock@skyjet.test', 'Library Rev Stock', 'inventory'
  );

  if not (select r.rolsuper from pg_roles r where r.rolname = current_user) then
    execute format('grant skyjet_app to %I with set true, inherit false', current_user);
  end if;

  perform set_config('app.current_user_id', v_stock::text, true);
  perform set_config('app.current_entity_id', v_entity::text, true);
  perform set_config('app.force_unprivileged', 'on', true);

  execute 'set local role skyjet_app';
  select count(*) into v_visible
    from library.document_revisions
   where document_id = v_restricted;
  execute 'set local role none';

  perform test.eq_num(
    v_suite,
    'inventory cannot see revisions of a restricted document',
    v_visible,
    0
  );

  select id into v_old_rev
    from library.document_revisions
   where document_id = v_restricted
   limit 1;

  perform test.throws(
    v_suite,
    'inventory cannot restore a restricted revision they cannot see',
    format(
      $q$select library.restore_revision(%L::uuid, %L::uuid, %L::uuid)$q$,
      v_entity, v_restricted, v_old_rev
    ),
    'not found'
  );

  perform set_config('app.current_user_id', v_viewer::text, true);

  perform test.throws(
    v_suite,
    'a viewer cannot restore a file',
    format(
      $q$select library.restore_revision(%L::uuid, %L::uuid, %L::uuid)$q$,
      v_entity, v_restricted, v_old_rev
    ),
    'permission denied'
  );

  perform set_config('app.force_unprivileged', '', true);
  perform set_config('app.current_user_id', '', true);

  perform test.ok(
    v_suite,
    'skyjet_app has no insert on library.document_revisions',
    not has_table_privilege('skyjet_app', 'library.document_revisions', 'INSERT')
  );

  select count(*) into v_count from library.documents where id = v_restricted;
  perform test.eq_num(v_suite, 'the restricted document is still there', v_count, 1);
end;
$$;
