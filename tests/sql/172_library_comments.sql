-- ===========================================================================
-- Document comments, reactions, workplace cards, and comment notices.
-- Viewers who can open a file may comment. Locked files stay silent.
-- Notices go to the uploader and prior commenters, not the access log.
-- ===========================================================================

do $$
declare
  v_suite      text := 'library comments';
  v_entity     uuid := test.entity();
  v_sha        text := repeat('c0', 32);
  v_internal   uuid := gen_random_uuid();
  v_secret     uuid := gen_random_uuid();
  v_uploader   uuid := gen_random_uuid();
  v_viewer     uuid := gen_random_uuid();
  v_stock      uuid := gen_random_uuid();
  v_bystander  uuid := gen_random_uuid();
  v_stranger   uuid := gen_random_uuid();
  v_comment    uuid;
  v_second     uuid;
  v_on         boolean;
  v_count      integer;
  v_notices    integer;
  v_email      text;
  v_title      text;
  v_phone_leak boolean;
begin
  insert into auth.users (id, email) values
    (v_uploader, 'library.comments.uploader@skyjet.test'),
    (v_viewer, 'library.comments.viewer@skyjet.test'),
    (v_stock, 'library.comments.stock@skyjet.test'),
    (v_bystander, 'library.comments.bystander@skyjet.test'),
    (v_stranger, 'library.comments.stranger@skyjet.test');

  perform app.provision_entity_user(
    v_entity, v_uploader, 'library.comments.uploader@skyjet.test', 'Comments Uploader', 'manager'
  );
  perform app.provision_entity_user(
    v_entity, v_viewer, 'library.comments.viewer@skyjet.test', 'Comments Viewer', 'viewer'
  );
  perform app.provision_entity_user(
    v_entity, v_stock, 'library.comments.stock@skyjet.test', 'Comments Stock', 'inventory'
  );
  perform app.provision_entity_user(
    v_entity, v_bystander, 'library.comments.bystander@skyjet.test', 'Comments Bystander', 'viewer'
  );
  perform app.provision_entity_user(
    v_entity, v_stranger, 'library.comments.stranger@skyjet.test', 'Comments Stranger', 'viewer'
  );

  update app.users
     set job_title = 'Technical librarian',
         phone = '+254700099999'
   where id = v_uploader;

  perform set_config('app.current_user_id', v_uploader::text, true);
  perform set_config('app.current_entity_id', v_entity::text, true);

  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_internal,
      'title', 'Internal shop notes',
      'document_type', 'manuals',
      'classification', 'internal',
      'file_name', 'notes.pdf',
      'file_size', 1024,
      'mime_type', 'application/pdf',
      'sha256', v_sha,
      'storage_path', v_entity::text || '/manuals/' || v_internal::text || '/notes.pdf',
      'storage_bucket', 'library-documents'
    )
  );

  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_secret,
      'title', 'Confidential pack',
      'document_type', 'certificates',
      'classification', 'confidential',
      'file_name', 'secret.pdf',
      'file_size', 2048,
      'mime_type', 'application/pdf',
      'sha256', v_sha,
      'storage_path', v_entity::text || '/certificates/' || v_secret::text || '/secret.pdf',
      'storage_bucket', 'library-documents'
    )
  );

  v_comment := library.add_document_comment(v_entity, v_secret, 'Managers may discuss a locked file.');
  perform test.ok(v_suite, 'the uploader can comment on a confidential file they can open', v_comment is not null);

  if not (select r.rolsuper from pg_roles r where r.rolname = current_user) then
    execute format('grant skyjet_app to %I with set true, inherit false', current_user);
  end if;

  perform set_config('app.current_user_id', v_viewer::text, true);
  perform set_config('app.force_unprivileged', 'on', true);

  select email, job_title
    into v_email, v_title
    from library.get_document_uploader(v_entity, v_internal);

  select to_jsonb(t) ? 'phone'
    into v_phone_leak
    from library.get_document_uploader(v_entity, v_internal) t;

  perform test.eq(
    v_suite,
    'anyone who can open the file can see the uploader email',
    v_email,
    'library.comments.uploader@skyjet.test'
  );
  perform test.eq(
    v_suite,
    'the workplace card includes job title',
    v_title,
    'Technical librarian'
  );
  perform test.ok(
    v_suite,
    'the workplace card never includes phone',
    v_phone_leak is not true
  );

  perform test.throws(
    v_suite,
    'a viewer cannot open the uploader card on a locked file',
    format(
      $q$select * from library.get_document_uploader(%L::uuid, %L::uuid)$q$,
      v_entity, v_secret
    ),
    'not found'
  );

  perform test.throws(
    v_suite,
    'a viewer cannot list comments on a locked file',
    format(
      $q$select * from library.list_document_comments(%L::uuid, %L::uuid)$q$,
      v_entity, v_secret
    ),
    'not found'
  );

  perform test.throws(
    v_suite,
    'a viewer cannot comment on a locked file',
    format(
      $q$select library.add_document_comment(%L::uuid, %L::uuid, 'should not land')$q$,
      v_entity, v_secret
    ),
    'not found'
  );

  perform test.throws(
    v_suite,
    'a colleague who is not on this file has no workplace card',
    format(
      $q$select * from library.get_document_person(%L::uuid, %L::uuid, %L::uuid)$q$,
      v_entity, v_internal, v_stranger
    ),
    'not found'
  );

  perform test.throws(
    v_suite,
    'an empty comment is refused',
    format(
      $q$select library.add_document_comment(%L::uuid, %L::uuid, '   ')$q$,
      v_entity, v_internal
    ),
    'empty'
  );

  v_comment := library.add_document_comment(v_entity, v_internal, 'Torque values look current.');
  perform test.ok(v_suite, 'a viewer can comment on an internal file', v_comment is not null);

  v_on := library.toggle_comment_reaction(v_entity, v_internal, v_comment, 'thumbs');
  perform test.ok(v_suite, 'a viewer can react to a comment', v_on);

  v_on := library.toggle_comment_reaction(v_entity, v_internal, v_comment, 'thumbs');
  perform test.ok(v_suite, 'toggling the same reaction off clears it', v_on is false);

  perform set_config('app.current_user_id', v_stock::text, true);
  v_second := library.add_document_comment(v_entity, v_internal, 'Agree, keep this revision.');
  perform test.ok(v_suite, 'a second colleague can add to the thread', v_second is not null);

  perform set_config('app.current_user_id', v_uploader::text, true);
  select count(*) into v_count
    from library.list_document_comments(v_entity, v_internal);
  perform test.eq_num(v_suite, 'both comments are listed for the uploader', v_count, 2);

  select count(*) into v_notices
    from library.notifications
   where entity_id = v_entity
     and user_id = v_uploader
     and kind = 'comment_added'
     and document_id = v_internal;
  perform test.eq_num(
    v_suite,
    'the uploader is notified of comments they did not write',
    v_notices,
    2
  );

  select count(*) into v_notices
    from library.notifications
   where entity_id = v_entity
     and user_id = v_viewer
     and kind = 'comment_added'
     and document_id = v_internal;
  perform test.eq_num(
    v_suite,
    'a prior commenter is notified of a later comment',
    v_notices,
    1
  );

  select count(*) into v_notices
    from library.notifications
   where entity_id = v_entity
     and user_id = v_bystander
     and kind = 'comment_added';
  perform test.eq_num(
    v_suite,
    'someone who only has Library access is not notified of comments',
    v_notices,
    0
  );

  perform test.ok(
    v_suite,
    'comment notices do not repeat the thread text',
    not exists (
      select 1
        from library.notifications
       where document_id = v_internal
         and kind = 'comment_added'
         and body ilike '%Torque%'
    )
  );

  perform set_config('app.current_user_id', v_viewer::text, true);
  execute 'set local role skyjet_app';
  select count(*) into v_count
    from library.document_comments
   where document_id = v_secret;
  execute 'set local role none';

  perform test.eq_num(
    v_suite,
    'RLS hides comments on a file the viewer cannot open',
    v_count,
    0
  );

  perform test.ok(
    v_suite,
    'skyjet_app has no direct insert on comments',
    not has_table_privilege('skyjet_app', 'library.document_comments', 'INSERT')
  );
  perform test.ok(
    v_suite,
    'the application role can call comment functions',
    has_function_privilege(
      'skyjet_app',
      'library.add_document_comment(uuid, uuid, text)',
      'EXECUTE'
    )
  );
  perform test.ok(
    v_suite,
    'the browser role cannot call comment functions',
    not has_function_privilege(
      'authenticated',
      'library.add_document_comment(uuid, uuid, text)',
      'EXECUTE'
    )
  );

  perform set_config('app.current_user_id', '', true);
  perform set_config('app.force_unprivileged', 'off', true);
end;
$$;
