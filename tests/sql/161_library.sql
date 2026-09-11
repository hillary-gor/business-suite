-- ===========================================================================
-- Library domain: catalogue writes, path isolation, RLS.
-- ===========================================================================

do $$
declare
  v_suite     text := 'library';
  v_entity    uuid := test.entity();
  v_other     uuid;
  v_id        uuid := gen_random_uuid();
  v_name      text := 'AMM.pdf';
  v_path      text;
  v_sha       text := repeat('ab', 32);
  v_doc       uuid;
  v_count     integer;
  v_foreign   integer;
  v_user      uuid := app.system_user_id();
  v_admin     uuid := (select id from app.roles where code = 'owner');
  v_visible   integer;
  v_hidden    integer;
  v_forged    uuid := gen_random_uuid();
  v_other_doc uuid := gen_random_uuid();
begin
  v_path := v_entity::text || '/manuals/' || v_id::text || '/' || v_name;

  v_doc := library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_id,
      'title', '737 AMM',
      'description', 'Aircraft maintenance manual',
      'document_type', 'manuals',
      'aircraft_type', 'B737',
      'part_number', 'AMM-737',
      'manufacturer', 'Boeing',
      'file_name', v_name,
      'file_size', 2048,
      'mime_type', 'application/pdf',
      'sha256', v_sha,
      'storage_path', v_path,
      'storage_bucket', 'library-documents',
      'tags', jsonb_build_array('amm', 'boeing')
    )
  );

  perform test.eq(v_suite, 'save_document returns the predetermined id', v_doc, v_id);

  perform test.ok(v_suite, 'the catalogue row is scoped to the organisation',
    exists (
      select 1 from library.documents
       where id = v_doc and entity_id = v_entity and title = '737 AMM'
    ));

  perform test.ok(v_suite, 'tags were attached',
    (select count(*) from library.document_tags dt where dt.document_id = v_doc) = 2);

  perform test.throws(
    v_suite,
    'a storage path for another organisation is refused',
    format(
      $q$select library.save_document(%L::uuid, jsonb_build_object(
            'title', 'Forged',
            'document_type', 'manuals',
            'file_name', 'x.pdf',
            'file_size', 10,
            'mime_type', 'application/pdf',
            'sha256', %L,
            'storage_path', '00000000-0000-0000-0000-000000000099/manuals/%s/x.pdf',
            'storage_bucket', 'library-documents'
          ))$q$,
      v_entity, v_sha, gen_random_uuid()
    ),
    'does not match'
  );

  perform test.throws(
    v_suite,
    'library files cannot be pointed at a business-suite bucket',
    format(
      $q$select library.save_document(%L::uuid, jsonb_build_object(
            'new_document_id', %L::uuid,
            'title', 'Forged',
            'document_type', 'manuals',
            'file_name', 'x.pdf',
            'file_size', 10,
            'mime_type', 'application/pdf',
            'sha256', %L,
            'storage_path', %L,
            'storage_bucket', 'skyjet-documents'
          ))$q$,
      v_entity, v_forged, v_sha,
      v_entity::text || '/manuals/' || v_forged::text || '/x.pdf'
    ),
    'library-documents'
  );

  select count(*) into v_foreign
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_class ft on ft.oid = c.confrelid
    join pg_namespace fn on fn.oid = ft.relnamespace
   where n.nspname = 'library'
     and c.contype = 'f'
     and fn.nspname in ('gl', 'sales', 'purch', 'inv');

  perform test.eq_num(v_suite, 'library tables do not reference accounting or inventory tables',
    v_foreign, 0);

  insert into app.entities (code, legal_name, base_currency_code)
  values ('OTHERCO', 'Other Co Ltd', 'KES')
  returning id into v_other;

  perform library.save_document(
    v_other,
    jsonb_build_object(
      'new_document_id', v_other_doc,
      'title', 'Other org manual',
      'document_type', 'other',
      'file_name', 'secret.pdf',
      'file_size', 512,
      'mime_type', 'application/pdf',
      'sha256', v_sha,
      'storage_path', v_other::text || '/other/' || v_other_doc::text || '/secret.pdf',
      'storage_bucket', 'library-documents'
    )
  );

  if not (select r.rolsuper from pg_roles r where r.rolname = current_user) then
    execute format('grant skyjet_app to %I with set true, inherit false', current_user);
  end if;

  insert into app.user_roles (user_id, entity_id, role_id)
  values (v_user, v_entity, v_admin)
  on conflict do nothing;

  perform set_config('app.current_user_id', v_user::text, true);
  perform set_config('app.current_entity_id', v_entity::text, true);

  execute 'set local role skyjet_app';
  select count(*) into v_visible from library.documents where entity_id = v_entity;
  select count(*) into v_hidden from library.documents where entity_id = v_other;
  execute 'set local role none';

  perform test.ok(v_suite, 'the application role can read its own library rows', v_visible > 0);
  perform test.eq_num(v_suite, 'another organisation''s library rows are invisible', v_hidden, 0);

  perform set_config('app.force_unprivileged', 'on', true);
  perform test.throws(
    v_suite,
    'an actor without library.document.upload cannot create a document',
    format(
      $q$select library.save_document(%L::uuid, jsonb_build_object(
            'title', 'Nope',
            'document_type', 'other',
            'file_name', 'x.pdf',
            'file_size', 10,
            'mime_type', 'application/pdf',
            'sha256', %L,
            'storage_path', %L,
            'storage_bucket', 'library-documents'
          ))$q$,
      v_other, v_sha, v_other::text || '/other/' || gen_random_uuid()::text || '/x.pdf'
    ),
    'permission denied'
  );
  perform set_config('app.force_unprivileged', '', true);
  perform set_config('app.current_user_id', '', true);

  perform test.ok(v_suite, 'skyjet_app has no direct insert on library.documents',
    not has_table_privilege('skyjet_app', 'library.documents', 'INSERT'));

  select count(*) into v_count from library.documents where id = v_doc;
  perform test.eq_num(v_suite, 'the original document is still there', v_count, 1);
end;
$$;
