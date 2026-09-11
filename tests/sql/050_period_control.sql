-- ===========================================================================
-- Invariant 7: a closed period does not accept postings.
--
-- Closing a period is the moment a set of numbers is published. If a posting
-- can land behind that line afterwards, the published figures were a guess.
-- ===========================================================================

do $$
declare
  v_suite    text := 'period control';
  v_entity   uuid := test.entity();
  v_period   gl.fiscal_periods%rowtype;
  v_earlier  gl.fiscal_periods%rowtype;
  v_future   date;
begin
  select * into v_period
    from gl.fiscal_periods
   where entity_id = v_entity and status = 'OPEN'
   order by start_date desc limit 1;

  -- Something to close.
  perform test.post_simple_entry('1015', '4010', 8000, 'Pre-close activity', v_period.start_date);

  -- An earlier open period blocks the close.
  select * into v_earlier
    from gl.fiscal_periods
   where entity_id = v_entity and status = 'OPEN' and end_date < v_period.start_date
   order by start_date limit 1;

  if v_earlier.id is not null then
    perform test.throws(v_suite,
      'a period cannot be closed while an earlier one is open',
      format('select gl.close_period(%L)', v_period.id),
      'still open');

    -- Close everything before it, in order.
    for v_earlier in
      select * from gl.fiscal_periods
       where entity_id = v_entity and status = 'OPEN' and end_date < v_period.start_date
       order by start_date
    loop
      perform gl.close_period(v_earlier.id);
    end loop;
  end if;

  perform gl.close_period(v_period.id);

  perform test.eq(v_suite, 'the period is now closed',
    (select status from gl.fiscal_periods where id = v_period.id), 'CLOSED'::gl.period_status);

  perform test.throws(v_suite,
    'a posting into a closed period is refused',
    format($sql$
      select gl.post_entry(%L, jsonb_build_object(
        'entry_date', %L::date, 'source_type', 'MANUAL', 'description', 'Too late',
        'lines', jsonb_build_array(
          jsonb_build_object('account_code', '1015', 'debit', 100, 'credit', 0),
          jsonb_build_object('account_code', '4010', 'debit', 0, 'credit', 100)
        )
      ))
    $sql$, v_entity, v_period.start_date),
    'not permitted');

  perform test.ok(v_suite, 'closing captured a balance snapshot',
    (select count(*) from gl.period_close_snapshot where period_id = v_period.id) > 0);

  perform test.throws(v_suite,
    'a closed period cannot be closed again',
    format('select gl.close_period(%L)', v_period.id),
    'not OPEN');

  perform test.throws(v_suite,
    'reopening requires a reason',
    format('select gl.reopen_period(%L, ''  '')', v_period.id),
    'documented reason');

  perform gl.reopen_period(v_period.id, 'Supplier bill received after cut-off');

  perform test.eq(v_suite, 'a reopened period is open again',
    (select status from gl.fiscal_periods where id = v_period.id), 'OPEN'::gl.period_status);

  perform test.eq_num(v_suite, 'the reopen counter advanced',
    (select reopened_count from gl.fiscal_periods where id = v_period.id), 1);

  perform test.eq_num(v_suite, 'the reopening was logged permanently',
    (select count(*) from gl.period_reopen_log where period_id = v_period.id), 1);

  perform test.ok(v_suite, 'the log records who and why',
    exists (
      select 1 from gl.period_reopen_log
       where period_id = v_period.id
         and reason like 'Supplier bill%'
         and reopened_by is not null
    ));

  -- Posting works again now the period is open.
  perform test.post_simple_entry('1015', '4010', 250, 'Late bill', v_period.start_date);
  perform test.ok(v_suite, 'posting resumes once the period is reopened', true);

  -- A date outside the calendar entirely is a configuration error, and says so.
  v_future := (current_date + interval '5 years')::date;
  perform test.throws(v_suite,
    'a date beyond the calendar is refused with a clear message',
    format($sql$
      select gl.post_entry(%L, jsonb_build_object(
        'entry_date', %L::date, 'source_type', 'MANUAL', 'description', 'Far future',
        'lines', jsonb_build_array(
          jsonb_build_object('account_code', '1015', 'debit', 100, 'credit', 0),
          jsonb_build_object('account_code', '4010', 'debit', 0, 'credit', 100)
        )
      ))
    $sql$, v_entity, v_future),
    'Extend the fiscal calendar');

  perform test.ok(v_suite, 'periods within a year cannot overlap',
    (select count(*) = 0 from gl.fiscal_periods a
       join gl.fiscal_periods b
         on a.entity_id = b.entity_id and a.id <> b.id
        and daterange(a.start_date, a.end_date, '[]') && daterange(b.start_date, b.end_date, '[]')
      where a.entity_id = v_entity));
end;
$$;
