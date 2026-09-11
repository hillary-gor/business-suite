-- ===========================================================================
-- OCR jobs write extracted_text. They are not a second search engine.
-- ===========================================================================

do $$
declare
  v_suite  text := 'library ocr';
  v_entity uuid := test.entity();
  v_sha    text := repeat('55', 32);
  v_doc    uuid := gen_random_uuid();
  v_zip    uuid := gen_random_uuid();
  v_job    uuid;
  v_again  uuid;
  v_viewer uuid := gen_random_uuid();
begin
  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_doc,
      'title', 'Scanned SB',
      'document_type', 'technical',
      'classification', 'internal',
      'file_name', 'sb.pdf',
      'file_size', 1024,
      'mime_type', 'application/pdf',
      'sha256', v_sha,
      'storage_path', v_entity::text || '/technical/' || v_doc::text || '/sb.pdf',
      'storage_bucket', 'library-documents'
    )
  );

  v_job := library.enqueue_ocr(v_entity, v_doc, false);
  perform test.ok(v_suite, 'enqueue_ocr queues a scan with no text layer', v_job is not null);

  v_again := library.enqueue_ocr(v_entity, v_doc, false);
  perform test.ok(v_suite, 'a second enqueue supersedes the queued job', v_again is not null and v_again <> v_job);
  perform test.eq(
    v_suite,
    'the first job is skipped',
    (select status from library.ocr_jobs where id = v_job),
    'skipped'
  );

  perform library.apply_ocr_text(v_entity, v_again, 'high-pressure turbine vane cooling hole');

  perform test.ok(
    v_suite,
    'OCR text is indexed on the catalogue row',
    exists (
      select 1 from library.documents
       where id = v_doc
         and search_vector @@ websearch_to_tsquery('simple', 'turbine vane')
    )
  );

  perform test.eq(
    v_suite,
    'the job is marked done',
    (select status from library.ocr_jobs where id = v_again),
    'done'
  );

  v_job := library.enqueue_ocr(v_entity, v_doc, false);
  perform test.ok(v_suite, 'enqueue is a no-op once text exists', v_job is null);

  v_job := library.enqueue_ocr(v_entity, v_doc, true);
  perform test.ok(v_suite, 'force enqueue is allowed after text exists', v_job is not null);

  perform library.claim_ocr_job(v_job);
  v_again := library.enqueue_ocr(v_entity, v_doc, true);
  perform test.ok(
    v_suite,
    'enqueue during a running job returns that job',
    v_again is not distinct from v_job
  );

  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_zip,
      'title', 'Zip pack',
      'document_type', 'other',
      'classification', 'internal',
      'file_name', 'pack.zip',
      'file_size', 1024,
      'mime_type', 'application/zip',
      'sha256', repeat('66', 32),
      'storage_path', v_entity::text || '/other/' || v_zip::text || '/pack.zip',
      'storage_bucket', 'library-documents'
    )
  );

  perform test.throws(
    v_suite,
    'OCR refuses a zip',
    format($q$select library.enqueue_ocr(%L::uuid, %L::uuid, true)$q$, v_entity, v_zip),
    'OCR is only for PDFs and images'
  );

  insert into auth.users (id, email) values (v_viewer, 'library.ocr.viewer@skyjet.test');
  perform app.provision_entity_user(
    v_entity, v_viewer, 'library.ocr.viewer@skyjet.test', 'Library OCR Viewer', 'viewer'
  );
  perform set_config('app.current_user_id', v_viewer::text, true);
  perform set_config('app.current_entity_id', v_entity::text, true);
  perform set_config('app.force_unprivileged', 'on', true);

  perform test.throws(
    v_suite,
    'a viewer cannot enqueue OCR',
    format($q$select library.enqueue_ocr(%L::uuid, %L::uuid, true)$q$, v_entity, v_doc),
    'permission denied'
  );

  perform set_config('app.force_unprivileged', '', true);
  perform set_config('app.current_user_id', '', true);

  perform test.ok(
    v_suite,
    'skyjet_app has no insert on library.ocr_jobs',
    not has_table_privilege('skyjet_app', 'library.ocr_jobs', 'INSERT')
  );
end;
$$;
