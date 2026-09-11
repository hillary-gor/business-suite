-- ===========================================================================
-- Catalogue peek, per-file grants, access requests, and notifications.
-- Direct SELECT on library.documents must still hide uncleared rows.
-- ===========================================================================

do $$
declare
  v_suite        text := 'library grants';
  v_entity       uuid := test.entity();
  v_sha          text := repeat('a1', 32);
  v_internal     uuid := gen_random_uuid();
  v_secret       uuid := gen_random_uuid();
  v_restricted   uuid := gen_random_uuid();
  v_denied       uuid := gen_random_uuid();
  v_viewer       uuid := gen_random_uuid();
  v_stock        uuid := gen_random_uuid();
  v_request      uuid;
  v_denied_req   uuid;
  v_open         boolean;
  v_name         text;
  v_path         text;
  v_visible      integer;
  v_hidden       integer;
  v_notices      integer;
  v_peek         integer;
begin
  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_internal,
      'title', 'Internal shop manual',
      'document_type', 'manuals',
      'classification', 'internal',
      'file_name', 'shop.pdf',
      'file_size', 1024,
      'mime_type', 'application/pdf',
      'sha256', v_sha,
      'storage_path', v_entity::text || '/manuals/' || v_internal::text || '/shop.pdf',
      'storage_bucket', 'library-documents'
    )
  );

  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_secret,
      'title', 'Confidential C of A pack',
      'description', 'UniqueBodyTokenXYZ for leak checks',
      'document_type', 'certificates',
      'classification', 'confidential',
      'file_name', 'coa-secret.pdf',
      'file_size', 2048,
      'mime_type', 'application/pdf',
      'sha256', v_sha,
      'storage_path', v_entity::text || '/certificates/' || v_secret::text || '/coa-secret.pdf',
      'storage_bucket', 'library-documents'
    )
  );

  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_restricted,
      'title', 'Restricted export file',
      'description', 'ITARBodyTokenXYZ',
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

  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_denied,
      'title', 'Confidential second file',
      'document_type', 'certificates',
      'classification', 'confidential',
      'file_name', 'second.pdf',
      'file_size', 512,
      'mime_type', 'application/pdf',
      'sha256', v_sha,
      'storage_path', v_entity::text || '/certificates/' || v_denied::text || '/second.pdf',
      'storage_bucket', 'library-documents'
    )
  );

  insert into auth.users (id, email) values
    (v_viewer, 'library.grants.viewer@skyjet.test'),
    (v_stock, 'library.grants.stock@skyjet.test');
  perform app.provision_entity_user(
    v_entity, v_viewer, 'library.grants.viewer@skyjet.test', 'Library Grants Viewer', 'viewer'
  );
  perform app.provision_entity_user(
    v_entity, v_stock, 'library.grants.stock@skyjet.test', 'Library Grants Stock', 'inventory'
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
  select count(*) into v_peek
    from library.list_catalogue(v_entity, jsonb_build_object('status', 'ACTIVE', 'limit', 200))
   where id in (v_secret, v_restricted);
  select can_open, file_name, storage_path
    into v_open, v_name, v_path
    from library.get_catalogue_document(v_entity, v_secret);
  execute 'set local role none';

  perform test.eq_num(v_suite, 'a viewer can still see internal documents', v_visible, 1);
  perform test.eq_num(
    v_suite,
    'direct SELECT still hides confidential and restricted rows',
    v_hidden,
    0
  );
  perform test.eq_num(v_suite, 'the catalogue peek still shows locked titles', v_peek, 2);
  perform test.eq(v_suite, 'a locked peek cannot be opened', v_open, false);
  perform test.eq(v_suite, 'a locked peek hides the file name', v_name, '');
  perform test.eq(v_suite, 'a locked peek hides the storage path', v_path, '');

  execute 'set local role skyjet_app';
  select count(*) into v_hidden
    from library.list_catalogue(
      v_entity,
      jsonb_build_object(
        'status', 'ACTIVE',
        'q', 'UniqueBodyTokenXYZ',
        'like', 'UniqueBodyTokenXYZ',
        'limit', 200
      )
    )
   where id = v_secret;
  select count(*) into v_peek
    from library.list_catalogue(
      v_entity,
      jsonb_build_object(
        'status', 'ACTIVE',
        'q', 'Confidential C of A',
        'like', 'Confidential C of A',
        'limit', 200
      )
    )
   where id = v_secret;
  execute 'set local role none';

  perform test.eq_num(
    v_suite,
    'locked search does not match extracted or description body text',
    v_hidden,
    0
  );
  perform test.eq_num(v_suite, 'locked search still matches the title', v_peek, 1);

  perform test.throws(
    v_suite,
    'assert_readable still hides a file the viewer cannot open',
    format($q$select library.assert_readable(%L::uuid, %L::uuid)$q$, v_entity, v_secret),
    'not found'
  );

  perform test.throws(
    v_suite,
    'internal files cannot be requested because the viewer can already open them',
    format(
      $q$select library.request_document_access(%L::uuid, %L::uuid, 'need it')$q$,
      v_entity, v_internal
    ),
    'already open'
  );

  v_request := library.request_document_access(v_entity, v_secret, 'Need the certificate');
  perform test.ok(v_suite, 'a viewer can request a confidential file', v_request is not null);

  perform test.throws(
    v_suite,
    'a second pending request for the same file is refused',
    format(
      $q$select library.request_document_access(%L::uuid, %L::uuid, 'again')$q$,
      v_entity, v_secret
    ),
    'pending request'
  );

  v_denied_req := library.request_document_access(v_entity, v_denied, 'Need the second file');
  perform test.ok(v_suite, 'a viewer can request a second confidential file', v_denied_req is not null);

  perform library.request_document_access(v_entity, v_restricted, 'Need the export pack');

  perform test.throws(
    v_suite,
    'a viewer cannot decide an access request',
    format(
      $q$select library.decide_document_access(%L::uuid, %L::uuid, true)$q$,
      v_entity, v_request
    ),
    'permission denied'
  );

  execute 'set local role skyjet_app';
  select count(*) into v_notices from library.notifications;
  execute 'set local role none';
  perform test.eq_num(v_suite, 'the requester is not notified of their own request', v_notices, 0);

  perform set_config('app.current_user_id', v_stock::text, true);

  execute 'set local role skyjet_app';
  select count(*) into v_notices
    from library.notifications
   where kind = 'access_requested'
     and document_id = v_secret;
  select count(*) into v_hidden from library.documents where id = v_restricted;
  execute 'set local role none';

  perform test.eq_num(v_suite, 'managers are notified of an access request', v_notices, 1);
  perform test.eq_num(
    v_suite,
    'inventory still cannot SELECT a restricted row they have not been granted',
    v_hidden,
    0
  );

  perform library.decide_document_access(v_entity, v_request, true);
  perform library.decide_document_access(v_entity, v_denied_req, false);

  perform test.ok(
    v_suite,
    'inventory can grant a restricted file they cannot open',
    library.decide_document_access(
      v_entity,
      (select id from library.access_requests
        where document_id = v_restricted and requester_id = v_viewer and status = 'pending'),
      true
    ) is not null
  );

  perform set_config('app.current_user_id', v_viewer::text, true);

  execute 'set local role skyjet_app';
  select count(*) into v_visible from library.documents where id = v_secret;
  select can_open, file_name
    into v_open, v_name
    from library.get_catalogue_document(v_entity, v_secret);
  select count(*) into v_notices
    from library.notifications
   where kind = 'access_approved' and document_id = v_secret;
  select count(*) into v_hidden
    from library.notifications
   where kind = 'access_denied' and document_id = v_denied;
  execute 'set local role none';

  perform test.eq_num(v_suite, 'a grant lets the viewer SELECT that one confidential row', v_visible, 1);
  perform test.eq(v_suite, 'after a grant the catalogue marks the file openable', v_open, true);
  perform test.eq(v_suite, 'after a grant the file name is visible', v_name, 'coa-secret.pdf');
  perform test.eq_num(v_suite, 'the requester is notified of an approval', v_notices, 1);
  perform test.eq_num(v_suite, 'the requester is notified of a refusal', v_hidden, 1);

  perform test.ok(
    v_suite,
    'assert_readable succeeds after a grant',
    library.assert_readable(v_entity, v_secret) = 'confidential'
  );

  perform test.throws(
    v_suite,
    'a granted file cannot be requested again',
    format(
      $q$select library.request_document_access(%L::uuid, %L::uuid, 'again')$q$,
      v_entity, v_secret
    ),
    'already open'
  );

  perform set_config('app.current_user_id', v_stock::text, true);
  perform library.revoke_document_grant(v_entity, v_secret, v_viewer);

  perform set_config('app.current_user_id', v_viewer::text, true);
  execute 'set local role skyjet_app';
  select count(*) into v_visible from library.documents where id = v_secret;
  select can_open into v_open from library.get_catalogue_document(v_entity, v_secret);
  execute 'set local role none';

  perform test.eq_num(v_suite, 'revoking the grant hides the row again', v_visible, 0);
  perform test.eq(v_suite, 'revoking the grant locks the catalogue card again', v_open, false);

  perform test.ok(
    v_suite,
    'skyjet_app has no insert on library.notifications',
    not has_table_privilege('skyjet_app', 'library.notifications', 'INSERT')
  );
  perform test.ok(
    v_suite,
    'skyjet_app has no insert on library.document_grants',
    not has_table_privilege('skyjet_app', 'library.document_grants', 'INSERT')
  );

  perform set_config('app.force_unprivileged', '', true);
  perform set_config('app.current_user_id', '', true);
end;
$$;
