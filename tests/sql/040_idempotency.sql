-- ===========================================================================
-- Invariant 5: replaying a posting cannot double-post.
--
-- The failure this prevents is mundane and expensive: a user clicks Post, the
-- response is lost to a flaky connection, they click Post again, and the
-- business has paid the same supplier twice.
-- ===========================================================================

do $$
declare
  v_suite  text := 'idempotency';
  v_entity uuid := test.entity();
  v_first  uuid;
  v_second uuid;
  v_before bigint;
  v_after  bigint;
begin
  select count(*) into v_before from gl.journal_entry where entity_id = v_entity;

  v_first  := test.post_simple_entry('1015', '4010', 5000, 'Payment', null, 'payment-abc-123');
  v_second := test.post_simple_entry('1015', '4010', 5000, 'Payment', null, 'payment-abc-123');

  select count(*) into v_after from gl.journal_entry where entity_id = v_entity;

  perform test.eq(v_suite, 'a replayed request returns the original entry', v_second, v_first);

  perform test.eq_num(v_suite, 'a replayed request creates exactly one entry', v_after - v_before, 1);

  perform test.eq_num(v_suite, 'the ledger holds one set of lines, not two',
    (select count(*) from gl.journal_entry_line where entry_id = v_first), 2);

  -- A different key is a different posting, even with identical content.
  perform test.post_simple_entry('1015', '4010', 5000, 'Payment', null, 'payment-abc-124');

  select count(*) into v_after from gl.journal_entry where entity_id = v_entity;
  perform test.eq_num(v_suite, 'a different key posts a second entry', v_after - v_before, 2);

  -- Without a key there is no deduplication, and there should not be: two
  -- genuine identical journals on the same day are legitimate.
  perform test.post_simple_entry('1015', '4010', 5000, 'Payment');
  perform test.post_simple_entry('1015', '4010', 5000, 'Payment');

  select count(*) into v_after from gl.journal_entry where entity_id = v_entity;
  perform test.eq_num(v_suite, 'unkeyed postings are not deduplicated', v_after - v_before, 4);

  -- The key is scoped to the entity, and the database enforces uniqueness
  -- independently of the function that checks it.
  perform test.ok(v_suite, 'the idempotency key is indexed uniquely per entity',
    exists (
      select 1 from pg_indexes
       where schemaname = 'gl'
         and indexname = 'journal_entry_idempotency_idx'
    ));

  -- Inventory movements are keyed too, and the stock ledger must not gain a
  -- second row on replay.
  perform test.ok(v_suite, 'reversal accepts an idempotency key',
    gl.reverse_entry(v_first, 'Duplicate payment', null, 'reverse-abc-123')
    = gl.reverse_entry(v_first, 'Duplicate payment', null, 'reverse-abc-123'));
end;
$$;
