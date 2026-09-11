-- ===========================================================================
-- Extracted file text is indexed. Duplicate hashes are findable.
-- ===========================================================================

do $$
declare
  v_suite  text := 'library extracted text';
  v_entity uuid := test.entity();
  v_sha    text := repeat('aa', 32);
  v_id     uuid := gen_random_uuid();
  v_found  integer;
begin
  perform library.save_document(
    v_entity,
    jsonb_build_object(
      'new_document_id', v_id,
      'title', 'Silent title',
      'document_type', 'manuals',
      'classification', 'internal',
      'file_name', 'notes.txt',
      'file_size', 64,
      'mime_type', 'text/plain',
      'sha256', v_sha,
      'storage_path', v_entity::text || '/manuals/' || v_id::text || '/notes.txt',
      'storage_bucket', 'library-documents',
      'extracted_text', 'high-pressure turbine vane cooling hole inspection'
    )
  );

  perform test.ok(
    v_suite,
    'extracted body text is indexed',
    exists (
      select 1
        from library.documents
       where id = v_id
         and search_vector @@ websearch_to_tsquery('simple', 'turbine vane')
    )
  );

  perform test.ok(
    v_suite,
    'a title-only query still matches',
    exists (
      select 1
        from library.documents
       where id = v_id
         and search_vector @@ websearch_to_tsquery('simple', 'silent')
    )
  );

  select count(*) into v_found
    from library.documents
   where entity_id = v_entity
     and sha256 = v_sha
     and status = 'ACTIVE';
  perform test.eq_num(v_suite, 'the stored hash can be looked up', v_found, 1);
end;
$$;
