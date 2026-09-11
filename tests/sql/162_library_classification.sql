-- ===========================================================================
-- Library classification, restricted read, and access events.
-- ===========================================================================

do $$
declare
  v_suite       text := 'library classification';
  v_entity      uuid := test.entity();
  v_sha         text := repeat('cd', 32);
  v_internal    uuid := gen_random_uuid();
  v_secret      uuid := gen_random_uuid();
  v_restricted  uuid := gen_random_uuid();
  v_viewer      uuid := gen_random_uuid();
  v_stock       uuid := gen_random_uuid();
  v_visible     integer;
  v_hidden      integer;
  v_logged      integer;
  v_event       uuid;
begin
  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_internal,
      'title', 'Internal AMM',
      'document_type', 'manuals',
      'classification', 'internal',
      'file_name', 'amm.pdf',
      'file_size', 1024,
      'mime_type', 'application/pdf',
      'sha256', v_sha,
      'storage_path', v_entity::text || '/manuals/' || v_internal::text || '/amm.pdf',
      'storage_bucket', 'library-documents'
    )
  );

  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_secret,
      'title', 'Confidential C of A',
      'document_type', 'certificates',
      'classification', 'confidential',
      'file_name', 'coa.pdf',
      'file_size', 1024,
      'mime_type', 'application/pdf',
      'sha256', v_sha,
      'storage_path', v_entity::text || '/certificates/' || v_secret::text || '/coa.pdf',
      'storage_bucket', 'library-documents'
    )
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
      'sha256', v_sha,
      'storage_path', v_entity::text || '/technical/' || v_restricted::text || '/itar.pdf',
      'storage_bucket', 'library-documents'
    )
  );

  perform test.eq(
    v_suite,
    'new documents default to the requested classification',
    (select classification from library.documents where id = v_secret),
    'confidential'
  );

  perform test.eq(
    v_suite,
    'omitted classification is stored as internal',
    (select classification from library.documents where id = v_internal),
    'internal'
  );

  insert into auth.users (id, email) values (v_viewer, 'library.viewer@skyjet.test');
  perform app.provision_entity_user(
    v_entity, v_viewer, 'library.viewer@skyjet.test', 'Library Viewer', 'viewer'
  );

  perform test.ok(
    v_suite,
    'a viewer can read internal documents',
    app.user_has_permission(v_entity, 'library.document.read', v_viewer)
  );
  perform test.ok(
    v_suite,
    'a viewer cannot read confidential documents',
    not app.user_has_permission(v_entity, 'library.document.read_confidential', v_viewer)
  );
  perform test.ok(
    v_suite,
    'a viewer cannot read restricted documents',
    not app.user_has_permission(v_entity, 'library.document.read_restricted', v_viewer)
  );

  if not (select r.rolsuper from pg_roles r where r.rolname = current_user) then
    execute format('grant skyjet_app to %I with set true, inherit false', current_user);
  end if;

  perform set_config('app.current_user_id', v_viewer::text, true);
  perform set_config('app.current_entity_id', v_entity::text, true);
  perform set_config('app.force_unprivileged', 'on', true);

  execute 'set local role skyjet_app';
  select count(*) into v_visible from library.documents where id = v_internal;
  select count(*) into v_hidden from library.documents where id in (v_secret, v_restricted);
  execute 'set local role none';

  perform test.eq_num(v_suite, 'a viewer can still see internal documents', v_visible, 1);
  perform test.eq_num(
    v_suite,
    'confidential and restricted rows are invisible to a viewer',
    v_hidden,
    0
  );

  perform test.throws(
    v_suite,
    'a viewer cannot record access to a restricted file',
    format(
      $q$select library.record_access(%L::uuid, %L::uuid, 'DOWNLOAD', 'req-1')$q$,
      v_entity, v_restricted
    ),
    'not found'
  );

  perform test.throws(
    v_suite,
    'a viewer cannot read the access log',
    format($q$select * from library.list_access_events(%L::uuid, null::uuid, 20)$q$, v_entity),
    'permission denied'
  );

  perform test.throws(
    v_suite,
    'a viewer cannot raise a document to confidential',
    format(
      $q$select library.save_document(%L::uuid, jsonb_build_object(
            'document_id', %L::uuid,
            'title', 'Internal AMM',
            'document_type', 'manuals',
            'classification', 'confidential'
          ))$q$,
      v_entity, v_internal
    ),
    'permission denied'
  );

  perform set_config('app.force_unprivileged', '', true);
  perform set_config('app.current_user_id', '', true);

  insert into auth.users (id, email) values (v_stock, 'library.stock@skyjet.test');
  perform app.provision_entity_user(
    v_entity, v_stock, 'library.stock@skyjet.test', 'Library Stock', 'inventory'
  );

  perform test.ok(
    v_suite,
    'inventory can read confidential documents',
    app.user_has_permission(v_entity, 'library.document.read_confidential', v_stock)
  );
  perform test.ok(
    v_suite,
    'inventory cannot read restricted documents',
    not app.user_has_permission(v_entity, 'library.document.read_restricted', v_stock)
  );

  perform set_config('app.current_user_id', v_stock::text, true);
  perform set_config('app.current_entity_id', v_entity::text, true);
  perform set_config('app.force_unprivileged', 'on', true);

  execute 'set local role skyjet_app';
  select count(*) into v_visible from library.documents where id = v_secret;
  select count(*) into v_hidden from library.documents where id = v_restricted;
  execute 'set local role none';

  perform test.eq_num(v_suite, 'inventory can see a confidential row', v_visible, 1);
  perform test.eq_num(v_suite, 'a restricted row is invisible to inventory', v_hidden, 0);

  perform test.throws(
    v_suite,
    'inventory cannot mark a file restricted',
    format(
      $q$select library.save_document(%L::uuid, jsonb_build_object(
            'document_id', %L::uuid,
            'title', 'Internal AMM',
            'document_type', 'manuals',
            'classification', 'restricted'
          ))$q$,
      v_entity, v_internal
    ),
    'permission denied'
  );

  perform test.throws(
    v_suite,
    'inventory cannot archive a restricted file they cannot read',
    format(
      $q$select library.archive_document(%L::uuid, %L::uuid)$q$,
      v_entity, v_restricted
    ),
    'not found'
  );

  perform test.throws(
    v_suite,
    'inventory cannot delete a restricted file they cannot read',
    format(
      $q$select library.delete_document(%L::uuid, %L::uuid)$q$,
      v_entity, v_restricted
    ),
    'not found'
  );

  perform test.throws(
    v_suite,
    'inventory cannot downgrade a restricted file they cannot see',
    format(
      $q$select library.save_document(%L::uuid, jsonb_build_object(
            'document_id', %L::uuid,
            'title', 'Restricted export file',
            'document_type', 'technical',
            'classification', 'internal'
          ))$q$,
      v_entity, v_restricted
    ),
    'not found'
  );

  perform test.throws(
    v_suite,
    'inventory cannot upload a restricted file',
    format(
      $q$select library.save_document(%L::uuid, jsonb_build_object(
            'title', 'ITAR pack',
            'document_type', 'technical',
            'classification', 'restricted',
            'file_name', 'itar2.pdf',
            'file_size', 1024,
            'mime_type', 'application/pdf',
            'sha256', %L,
            'storage_path', %L,
            'storage_bucket', 'library-documents'
          ))$q$,
      v_entity, v_sha,
      v_entity::text || '/technical/' || gen_random_uuid()::text || '/itar2.pdf'
    ),
    'permission denied'
  );

  perform test.throws(
    v_suite,
    'inventory cannot read the access log',
    format($q$select * from library.list_access_events(%L::uuid, null::uuid, 20)$q$, v_entity),
    'permission denied'
  );

  perform set_config('app.force_unprivileged', '', true);
  perform set_config('app.current_user_id', '', true);

  v_event := library.record_access(v_entity, v_secret, 'VIEW', 'req-audit');
  perform test.ok(v_suite, 'record_access returns an event id', v_event is not null);

  select count(*) into v_logged
    from library.list_access_events(v_entity, v_secret, 20)
   where action = 'VIEW' and document_id = v_secret;
  perform test.ok(v_suite, 'the access event is listed for an auditor', v_logged >= 1);

  perform test.ok(v_suite, 'skyjet_app has no insert on library.access_events',
    not has_table_privilege('skyjet_app', 'library.access_events', 'INSERT'));
end;
$$;
