-- ===========================================================================
-- Invariant 6: document numbers are gapless.
--
-- A tax authority does not accept "we skipped 000042 because the transaction
-- rolled back". Numbers are allocated inside the transaction that persists the
-- document, so a rollback returns the number to the pool rather than burning
-- it. That is what these tests prove.
-- ===========================================================================

do $$
declare
  v_suite   text := 'document numbering';
  v_entity  uuid := test.entity();
  v_date    date := test.open_date();
  v_year    smallint := extract(year from test.open_date())::smallint;
  v_numbers text[];
  v_first   text;
  v_next    bigint;
begin
  -- Twenty entries in a row must produce twenty consecutive numbers.
  for i in 1..20 loop
    perform test.post_simple_entry('1015', '4010', 100 + i, format('Numbering fixture %s', i));
  end loop;

  select array_agg(entry_no order by entry_no)
    into v_numbers
    from gl.journal_entry
   where entity_id = v_entity and source_type = 'MANUAL';

  perform test.eq_num(v_suite, 'twenty entries produced twenty numbers',
    array_length(v_numbers, 1), 20);

  perform test.eq_num(v_suite, 'the sequence has no gaps',
    (
      select count(*)
        from gl.journal_entry
       where entity_id = v_entity and source_type = 'MANUAL'
    ),
    (
      -- Highest suffix minus lowest suffix, plus one, must equal the count.
      select max(right(entry_no, 6)::bigint) - min(right(entry_no, 6)::bigint) + 1
        from gl.journal_entry
       where entity_id = v_entity and source_type = 'MANUAL'
    ));

  select entry_no into v_first
    from gl.journal_entry
   where entity_id = v_entity and source_type = 'MANUAL'
   order by entry_no limit 1;

  perform test.ok(v_suite, 'the number carries its document type and year',
    v_first like 'JE-' || v_year || '-%', v_first);

  perform test.ok(v_suite, 'the sequence is zero padded to a fixed width',
    length(split_part(v_first, '-', 3)) = 6, v_first);

  -- Different document types keep separate series, so a journal entry cannot
  -- consume an invoice number.
  perform gl.post_entry(v_entity, jsonb_build_object(
    'entry_date', v_date,
    'source_type', 'FX_REVALUATION',
    'description', 'Series separation fixture',
    'lines', jsonb_build_array(
      jsonb_build_object('account_code', '1015', 'debit', 10, 'credit', 0),
      jsonb_build_object('account_code', '4010', 'debit', 0, 'credit', 10)
    )
  ));

  perform test.eq_num(v_suite, 'a different document type starts its own series',
    (select next_value from app.numbering_sequences
      where entity_id = v_entity and document_type = 'FXR' and fiscal_year = v_year),
    2);

  perform test.eq_num(v_suite, 'the journal series is unaffected by it',
    (select next_value from app.numbering_sequences
      where entity_id = v_entity and document_type = 'JE' and fiscal_year = v_year),
    21);

  -- A rolled-back allocation must not burn a number. The savepoint here
  -- reproduces exactly what happens when a posting fails part-way.
  select next_value into v_next
    from app.numbering_sequences
   where entity_id = v_entity and document_type = 'JE' and fiscal_year = v_year;

  begin
    perform app.next_document_number(v_entity, 'JE', v_date);
    raise exception 'deliberate rollback';
  exception when others then
    null;
  end;

  perform test.eq_num(v_suite, 'a rolled-back allocation releases the number',
    (select next_value from app.numbering_sequences
      where entity_id = v_entity and document_type = 'JE' and fiscal_year = v_year),
    v_next);
end;
$$;
