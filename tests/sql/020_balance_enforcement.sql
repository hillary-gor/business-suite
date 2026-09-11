-- ===========================================================================
-- Invariant 3: entries balance, and the database says so, not the application.
--
-- The first group of tests attacks the ledger tables directly to prove the
-- deferred constraint trigger works even when the posting engine is bypassed.
-- The second group checks that the posting engine refuses bad input with an
-- error a person can act on.
-- ===========================================================================

do $$
declare
  v_suite  text := 'balance enforcement';
  v_entity uuid := test.entity();
  v_period uuid := test.open_period();
  v_date   date := test.open_date();
  v_bank   uuid := test.account('1015');
  v_sales  uuid := test.account('4010');
  v_entry  uuid;
begin
  -- -------------------------------------------------------------------------
  -- Direct attacks on the tables
  -- -------------------------------------------------------------------------

  v_entry := gen_random_uuid();

  perform test.throws_at_commit(v_suite,
    'an entry whose lines do not balance is refused at commit',
    format($sql$
      insert into gl.journal_entry (
        id, entity_id, entry_no, entry_date, period_id, source_type, description,
        base_currency_code, total_debit_base, total_credit_base, line_count, posted_by
      ) values (
        %L, %L, 'FORGED-1', %L, %L, 'MANUAL', 'Forged unbalanced entry',
        'KES', 1000, 1000, 2, app.system_user_id()
      );
      insert into gl.journal_entry_line
        (entry_id, entity_id, line_no, account_id, entry_date, period_id, currency_code,
         debit_txn, credit_txn, debit_base, credit_base)
      values
        (%L, %L, 1, %L, %L, %L, 'KES', 1000, 0, 1000, 0),
        (%L, %L, 2, %L, %L, %L, 'KES', 0, 400, 0, 400);
    $sql$, v_entry, v_entity, v_date, v_period,
           v_entry, v_entity, v_bank, v_date, v_period,
           v_entry, v_entity, v_sales, v_date, v_period),
    'does not balance');

  v_entry := gen_random_uuid();

  perform test.throws_at_commit(v_suite,
    'a single-line entry is refused: double entry needs two sides',
    format($sql$
      insert into gl.journal_entry (
        id, entity_id, entry_no, entry_date, period_id, source_type, description,
        base_currency_code, total_debit_base, total_credit_base, line_count, posted_by
      ) values (
        %L, %L, 'FORGED-2', %L, %L, 'MANUAL', 'Forged single line',
        'KES', 500, 500, 1, app.system_user_id()
      );
      insert into gl.journal_entry_line
        (entry_id, entity_id, line_no, account_id, entry_date, period_id, currency_code,
         debit_txn, credit_txn, debit_base, credit_base)
      values (%L, %L, 1, %L, %L, %L, 'KES', 500, 0, 500, 0);
    $sql$, v_entry, v_entity, v_date, v_period,
           v_entry, v_entity, v_bank, v_date, v_period),
    'single line');

  v_entry := gen_random_uuid();

  perform test.throws_at_commit(v_suite,
    'header totals cannot disagree with the lines beneath them',
    format($sql$
      insert into gl.journal_entry (
        id, entity_id, entry_no, entry_date, period_id, source_type, description,
        base_currency_code, total_debit_base, total_credit_base, line_count, posted_by
      ) values (
        %L, %L, 'FORGED-3', %L, %L, 'MANUAL', 'Forged totals',
        'KES', 99999, 99999, 2, app.system_user_id()
      );
      insert into gl.journal_entry_line
        (entry_id, entity_id, line_no, account_id, entry_date, period_id, currency_code,
         debit_txn, credit_txn, debit_base, credit_base)
      values
        (%L, %L, 1, %L, %L, %L, 'KES', 100, 0, 100, 0),
        (%L, %L, 2, %L, %L, %L, 'KES', 0, 100, 0, 100);
    $sql$, v_entry, v_entity, v_date, v_period,
           v_entry, v_entity, v_bank, v_date, v_period,
           v_entry, v_entity, v_sales, v_date, v_period),
    'header totals disagree');

  -- Attach a malformed line to an entry that genuinely exists, so the check
  -- constraint is what refuses it rather than the missing-header guard.
  v_entry := test.post_simple_entry('1015', '4010', 100, 'Line constraint fixture');

  -- Deliberately in a foreign currency at a rate other than one, so that the
  -- only constraint this row can offend is the single-sided rule. In base
  -- currency the sides-agree rule would catch it first and the test would
  -- prove the wrong thing.
  perform test.throws(v_suite,
    'a line cannot carry a debit and a credit at once',
    format($sql$
      insert into gl.journal_entry_line
        (entry_id, entity_id, line_no, account_id, entry_date, period_id, currency_code,
         fx_rate, debit_txn, credit_txn, debit_base, credit_base)
      values (%L, %L, 9, %L, %L, %L, 'USD', 2, 100, 100, 200, 0);
    $sql$, v_entry, v_entity, v_bank, v_date, v_period),
    'line_single_sided');

  perform test.throws(v_suite,
    'a line cannot be neither a debit nor a credit',
    format($sql$
      insert into gl.journal_entry_line
        (entry_id, entity_id, line_no, account_id, entry_date, period_id, currency_code,
         debit_txn, credit_txn, debit_base, credit_base)
      values (%L, %L, 10, %L, %L, %L, 'KES', 0, 0, 0, 0);
    $sql$, v_entry, v_entity, v_bank, v_date, v_period),
    'line_single_sided');

  -- -------------------------------------------------------------------------
  -- The posting engine
  -- -------------------------------------------------------------------------

  perform test.throws(v_suite,
    'the engine refuses an unbalanced payload',
    format($sql$
      select gl.post_entry(%L, jsonb_build_object(
        'entry_date', %L::date,
        'source_type', 'MANUAL',
        'description', 'Unbalanced',
        'lines', jsonb_build_array(
          jsonb_build_object('account_code', '1015', 'debit', 1000, 'credit', 0),
          jsonb_build_object('account_code', '4010', 'debit', 0, 'credit', 250)
        )
      ))
    $sql$, v_entity, v_date),
    'does not balance');

  perform test.throws(v_suite,
    'the engine refuses a negative amount',
    format($sql$
      select gl.post_entry(%L, jsonb_build_object(
        'entry_date', %L::date, 'source_type', 'MANUAL', 'description', 'Negative',
        'lines', jsonb_build_array(
          jsonb_build_object('account_code', '1015', 'debit', -100, 'credit', 0),
          jsonb_build_object('account_code', '4010', 'debit', 0, 'credit', -100)
        )
      ))
    $sql$, v_entity, v_date),
    'must be positive');

  perform test.throws(v_suite,
    'the engine refuses a posting to a summary account',
    format($sql$
      select gl.post_entry(%L, jsonb_build_object(
        'entry_date', %L::date, 'source_type', 'MANUAL', 'description', 'To a parent',
        'lines', jsonb_build_array(
          jsonb_build_object('account_code', '1000', 'debit', 100, 'credit', 0),
          jsonb_build_object('account_code', '4010', 'debit', 0, 'credit', 100)
        )
      ))
    $sql$, v_entity, v_date),
    'summary account');

  perform test.throws(v_suite,
    'the engine refuses an entry with no description',
    format($sql$
      select gl.post_entry(%L, jsonb_build_object(
        'entry_date', %L::date, 'source_type', 'MANUAL', 'description', '   ',
        'lines', jsonb_build_array(
          jsonb_build_object('account_code', '1015', 'debit', 100, 'credit', 0),
          jsonb_build_object('account_code', '4010', 'debit', 0, 'credit', 100)
        )
      ))
    $sql$, v_entity, v_date),
    'description is required');

  perform test.throws(v_suite,
    'the engine refuses a KES line in the USD bank account',
    format($sql$
      select gl.post_entry(%L, jsonb_build_object(
        'entry_date', %L::date, 'source_type', 'MANUAL', 'description', 'Wrong currency',
        'lines', jsonb_build_array(
          jsonb_build_object('account_code', '1016', 'debit', 100, 'credit', 0),
          jsonb_build_object('account_code', '4010', 'debit', 0, 'credit', 100)
        )
      ))
    $sql$, v_entity, v_date),
    'only holds');

  perform test.throws(v_suite,
    'the engine refuses a receivables posting with no customer',
    format($sql$
      select gl.post_entry(%L, jsonb_build_object(
        'entry_date', %L::date, 'source_type', 'MANUAL', 'description', 'No customer',
        'lines', jsonb_build_array(
          jsonb_build_object('account_code', '1110', 'debit', 100, 'credit', 0),
          jsonb_build_object('account_code', '4010', 'debit', 0, 'credit', 100)
        )
      ))
    $sql$, v_entity, v_date),
    'requires a customer');

  -- A well-formed entry does go in, and its totals are right.
  v_entry := test.post_simple_entry('1015', '4010', 12345.67, 'Good entry');

  perform test.eq_num(v_suite, 'a valid entry records its debit total',
    (select total_debit_base from gl.journal_entry where id = v_entry), 12345.67);

  perform test.eq_num(v_suite, 'a valid entry records two lines',
    (select line_count from gl.journal_entry where id = v_entry), 2);

  perform test.eq_num(v_suite, 'the whole ledger nets to zero',
    (select coalesce(sum(debit_base - credit_base), 0) from gl.journal_entry_line
      where entity_id = v_entity),
    0);
end;
$$;
