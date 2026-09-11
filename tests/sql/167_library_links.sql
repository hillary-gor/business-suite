-- ===========================================================================
-- Document links to item / user / employee / supplier. Not invoices.
-- ===========================================================================

do $$
declare
  v_suite  text := 'library links';
  v_entity uuid := test.entity();
  v_sha    text := repeat('44', 32);
  v_doc    uuid := gen_random_uuid();
  v_user   uuid := app.system_user_id();
  v_admin  uuid := (select id from app.roles where code = 'owner');
  v_count  integer;
  v_hits   integer;
  v_viewer uuid := gen_random_uuid();
begin
  insert into app.user_roles (user_id, entity_id, role_id)
  values (v_user, v_entity, v_admin)
  on conflict do nothing;

  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_doc,
      'title', 'C of A',
      'document_type', 'certificates',
      'classification', 'internal',
      'file_name', 'coa.pdf',
      'file_size', 1024,
      'mime_type', 'application/pdf',
      'sha256', v_sha,
      'storage_path', v_entity::text || '/certificates/' || v_doc::text || '/coa.pdf',
      'storage_bucket', 'library-documents'
    )
  );

  perform library.link_document(v_entity, v_doc, 'user', v_user);

  select count(*) into v_count
    from library.document_links
   where document_id = v_doc
     and record_table = 'users'
     and record_id = v_user;
  perform test.eq_num(v_suite, 'the document is linked to the user', v_count, 1);

  perform library.link_document(v_entity, v_doc, 'user', v_user);
  perform test.eq_num(
    v_suite,
    'linking the same person twice is a no-op',
    (select count(*) from library.document_links where document_id = v_doc),
    1
  );

  select count(*) into v_hits
    from library.list_document_links(v_entity, v_doc)
   where kind = 'user' and record_id = v_user;
  perform test.eq_num(v_suite, 'list_document_links returns the user label', v_hits, 1);

  select count(*) into v_hits
    from library.search_link_targets(v_entity, 'user', 'system', 20);
  perform test.ok(v_suite, 'search_link_targets finds organisation users', v_hits >= 1);

  perform test.throws(
    v_suite,
    'invoices are not a link type',
    format(
      $q$select library.link_document(%L::uuid, %L::uuid, 'invoice', %L::uuid)$q$,
      v_entity, v_doc, v_user
    ),
    'Unknown link type'
  );

  perform library.unlink_document(v_entity, v_doc, 'user', v_user);
  perform test.eq_num(
    v_suite,
    'unlink removes the row',
    (select count(*) from library.document_links where document_id = v_doc),
    0
  );

  insert into auth.users (id, email) values (v_viewer, 'library.link.viewer@skyjet.test');
  perform app.provision_entity_user(
    v_entity, v_viewer, 'library.link.viewer@skyjet.test', 'Library Link Viewer', 'viewer'
  );
  perform set_config('app.current_user_id', v_viewer::text, true);
  perform set_config('app.current_entity_id', v_entity::text, true);
  perform set_config('app.force_unprivileged', 'on', true);

  perform test.throws(
    v_suite,
    'a viewer cannot search link targets',
    format(
      $q$select * from library.search_link_targets(%L::uuid, 'user', 'x', 20)$q$,
      v_entity
    ),
    'permission denied'
  );

  perform set_config('app.force_unprivileged', '', true);
  perform set_config('app.current_user_id', '', true);
end;
$$;
