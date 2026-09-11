-- ===========================================================================
-- Sharing a library file: in Library, by email, copied link. Notices go to
-- the named recipient, not the access log. Managers may grant that one file;
-- viewers who share a locked file only notify. File bytes are never emailed.
-- ===========================================================================

do $$
declare
  v_suite      text := 'library shares';
  v_entity     uuid := test.entity();
  v_sha        text := repeat('d1', 32);
  v_internal   uuid := gen_random_uuid();
  v_secret     uuid := gen_random_uuid();
  v_uploader   uuid := gen_random_uuid();
  v_viewer     uuid := gen_random_uuid();
  v_bystander  uuid := gen_random_uuid();
  v_stranger   uuid := gen_random_uuid();
  v_share      uuid;
  v_granted    boolean;
  v_open       boolean;
  v_count      integer;
  v_notices    integer;
  v_channel    text;
  v_email      text;
  v_self       integer;
  v_phone_leak boolean;
begin
  insert into auth.users (id, email) values
    (v_uploader, 'library.shares.uploader@skyjet.test'),
    (v_viewer, 'library.shares.viewer@skyjet.test'),
    (v_bystander, 'library.shares.bystander@skyjet.test'),
    (v_stranger, 'library.shares.stranger@skyjet.test');

  perform app.provision_entity_user(
    v_entity, v_uploader, 'library.shares.uploader@skyjet.test', 'Shares Uploader', 'manager'
  );
  perform app.provision_entity_user(
    v_entity, v_viewer, 'library.shares.viewer@skyjet.test', 'Shares Viewer', 'viewer'
  );
  perform app.provision_entity_user(
    v_entity, v_bystander, 'library.shares.bystander@skyjet.test', 'Shares Bystander', 'viewer'
  );
  perform app.provision_entity_user(
    v_entity, v_stranger, 'library.shares.stranger@skyjet.test', 'Shares Stranger', 'viewer'
  );

  perform set_config('app.current_user_id', v_uploader::text, true);
  perform set_config('app.current_entity_id', v_entity::text, true);

  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_internal,
      'title', 'Internal share notes',
      'document_type', 'manuals',
      'classification', 'internal',
      'file_name', 'share-notes.pdf',
      'file_size', 1024,
      'mime_type', 'application/pdf',
      'sha256', v_sha,
      'storage_path', v_entity::text || '/manuals/' || v_internal::text || '/share-notes.pdf',
      'storage_bucket', 'library-documents'
    )
  );

  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_secret,
      'title', 'Confidential share pack',
      'document_type', 'certificates',
      'classification', 'confidential',
      'file_name', 'share-secret.pdf',
      'file_size', 2048,
      'mime_type', 'application/pdf',
      'sha256', v_sha,
      'storage_path', v_entity::text || '/certificates/' || v_secret::text || '/share-secret.pdf',
      'storage_bucket', 'library-documents'
    )
  );

  if not (select r.rolsuper from pg_roles r where r.rolname = current_user) then
    execute format('grant skyjet_app to %I with set true, inherit false', current_user);
  end if;

  perform set_config('app.current_user_id', v_viewer::text, true);
  perform set_config('app.force_unprivileged', 'on', true);

  perform test.throws(
    v_suite,
    'a viewer cannot share a file they cannot open',
    format(
      $q$select * from library.share_document(%L::uuid, %L::uuid, 'internal', %L::uuid, null)$q$,
      v_entity, v_secret, v_bystander
    ),
    'not found'
  );

  perform test.throws(
    v_suite,
    'a viewer cannot list shares on a locked file',
    format(
      $q$select * from library.list_document_shares(%L::uuid, %L::uuid)$q$,
      v_entity, v_secret
    ),
    'not found'
  );

  perform test.throws(
    v_suite,
    'you cannot share a file with yourself',
    format(
      $q$select * from library.share_document(%L::uuid, %L::uuid, 'internal', %L::uuid, null)$q$,
      v_entity, v_internal, v_viewer
    ),
    'yourself'
  );

  select share_id, granted, already_open
    into v_share, v_granted, v_open
    from library.share_document(v_entity, v_internal, 'internal', v_bystander, 'Please review for Tuesday.');

  perform test.ok(v_suite, 'a viewer can share an internal file in Library', v_share is not null);
  perform test.eq(v_suite, 'sharing an already-open file does not grant', v_granted, false);
  perform test.eq(v_suite, 'the colleague could already open the internal file', v_open, true);

  select count(*) into v_notices
    from library.notifications
   where entity_id = v_entity
     and user_id = v_bystander
     and kind = 'document_shared'
     and document_id = v_internal;
  perform test.eq_num(v_suite, 'the named colleague is notified of an in-Library share', v_notices, 1);

  perform test.ok(
    v_suite,
    'share notices do not repeat the private note',
    not exists (
      select 1
        from library.notifications
       where document_id = v_internal
         and kind = 'document_shared'
         and body ilike '%Tuesday%'
    )
  );

  select count(*) into v_notices
    from library.notifications
   where entity_id = v_entity
     and user_id = v_stranger
     and kind = 'document_shared';
  perform test.eq_num(v_suite, 'other Library users are not notified of a directed share', v_notices, 0);

  select share_id into v_share
    from library.share_document(v_entity, v_internal, 'link', null, null);
  perform test.ok(v_suite, 'copying a link is recorded on the trail', v_share is not null);

  select count(*) into v_notices
    from library.notifications
   where document_id = v_internal
     and kind = 'document_shared';
  perform test.eq_num(v_suite, 'copying a link does not send a bell notice', v_notices, 1);

  select count(*) into v_self
    from library.list_share_colleagues(v_entity, v_internal, '')
   where id = v_viewer;
  perform test.eq_num(v_suite, 'the colleague picker does not include the actor', v_self, 0);

  select count(*) into v_count
    from library.list_share_colleagues(v_entity, v_internal, 'Shares Bystander')
   where id = v_bystander;
  perform test.eq_num(v_suite, 'the colleague picker finds a Library user by name', v_count, 1);

  select to_jsonb(t) ? 'phone'
    into v_phone_leak
    from library.list_share_colleagues(v_entity, v_internal, 'Shares Bystander') t
   where t.id = v_bystander;
  perform test.ok(v_suite, 'the colleague picker never includes phone', v_phone_leak is not true);

  perform test.throws(
    v_suite,
    'a colleague who is not on this file still has no workplace card',
    format(
      $q$select * from library.get_document_person(%L::uuid, %L::uuid, %L::uuid)$q$,
      v_entity, v_internal, v_stranger
    ),
    'not found'
  );

  perform test.ok(
    v_suite,
    'the person who received a share has a workplace card',
    exists (
      select 1
        from library.get_document_person(v_entity, v_internal, v_bystander)
    )
  );

  perform set_config('app.current_user_id', v_uploader::text, true);

  select share_id, granted, already_open
    into v_share, v_granted, v_open
    from library.share_document(v_entity, v_secret, 'internal', v_viewer, null);

  perform test.ok(v_suite, 'a manager can share a confidential file', v_share is not null);
  perform test.eq(v_suite, 'a manager share grants that one locked file', v_granted, true);
  perform test.eq(v_suite, 'the recipient can open after a manager share', v_open, true);

  perform set_config('app.current_user_id', v_viewer::text, true);

  perform test.ok(
    v_suite,
    'the viewer can open the confidential file after a manager share',
    library.assert_readable(v_entity, v_secret) = 'confidential'
  );

  select count(*) into v_notices
    from library.notifications
   where user_id = v_viewer
     and kind = 'document_shared'
     and document_id = v_secret;
  perform test.eq_num(v_suite, 'the viewer is notified of the confidential share', v_notices, 1);

  select share_id, granted, already_open
    into v_share, v_granted, v_open
    from library.share_document(v_entity, v_secret, 'internal', v_bystander, null);

  perform test.ok(v_suite, 'a viewer can ping a colleague about a file they can open', v_share is not null);
  perform test.eq(v_suite, 'a viewer share does not grant a locked file', v_granted, false);
  perform test.eq(v_suite, 'the pinged colleague still cannot open the confidential file', v_open, false);

  perform set_config('app.current_user_id', v_bystander::text, true);
  perform test.throws(
    v_suite,
    'a ping without a grant still hides the confidential file',
    format(
      $q$select library.assert_readable(%L::uuid, %L::uuid)$q$,
      v_entity, v_secret
    ),
    'not found'
  );

  select count(*) into v_notices
    from library.notifications
   where user_id = v_bystander
     and kind = 'document_shared'
     and document_id = v_secret;
  perform test.eq_num(v_suite, 'the pinged colleague still gets a bell notice', v_notices, 1);

  perform set_config('app.current_user_id', v_uploader::text, true);

  select share_id into v_share
    from library.share_document(v_entity, v_internal, 'email', v_stranger, 'See the notes.');
  perform test.ok(v_suite, 'an email share is recorded even though mail is sent by the app', v_share is not null);

  select channel, recipient_email
    into v_channel, v_email
    from library.list_document_shares(v_entity, v_internal)
   where id = v_share;
  perform test.eq(v_suite, 'the trail records the email channel', v_channel, 'email');
  perform test.eq(
    v_suite,
    'the trail stores the colleague email from the directory, not the client',
    v_email,
    'library.shares.stranger@skyjet.test'
  );

  select count(*) into v_count
    from library.list_document_shares(v_entity, v_internal);
  perform test.ok(v_suite, 'the share trail lists every recorded share', v_count >= 3);

  perform set_config('app.current_user_id', v_viewer::text, true);
  execute 'set local role skyjet_app';
  select count(*) into v_count
    from library.document_shares
   where document_id = v_secret;
  execute 'set local role none';
  perform test.eq_num(
    v_suite,
    'a person who can open the file can read its share trail through RLS',
    v_count,
    2
  );

  perform set_config('app.current_user_id', v_bystander::text, true);
  execute 'set local role skyjet_app';
  select count(*) into v_count
    from library.document_shares
   where document_id = v_secret;
  execute 'set local role none';
  perform test.eq_num(
    v_suite,
    'RLS hides share rows on a file the colleague cannot open',
    v_count,
    0
  );
end;
$$;
