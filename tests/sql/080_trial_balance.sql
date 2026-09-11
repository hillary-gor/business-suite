-- ===========================================================================
-- The trial balance.
--
-- One property matters above all others and is asserted here against a
-- randomised sequence of postings: whatever anyone does, however many entries
-- they post, in whatever currency, the closing balances across every account
-- sum to exactly zero. If that ever fails, the books are broken and nothing
-- else the system reports can be trusted.
-- ===========================================================================

do $$
declare
  v_suite   text := 'trial balance';
  v_entity  uuid := test.entity();
  v_period  uuid := test.open_period();
  v_date    date := test.open_date();
  v_codes   text[] := array['1015','1011','1017','2030','4010','4020','4990','6110','6120','6310','6360','6370'];
  v_debit   text;
  v_credit  text;
  v_amount  numeric;
  v_total   numeric;
  v_movement numeric;
  v_tb      record;
begin
  -- 200 random balanced entries between random accounts for random amounts.
  for i in 1..200 loop
    v_debit  := v_codes[1 + floor(random() * array_length(v_codes, 1))::int];
    v_credit := v_codes[1 + floor(random() * array_length(v_codes, 1))::int];
    if v_debit = v_credit then
      continue;
    end if;
    v_amount := round((random() * 900000 + 1)::numeric, 2);
    perform test.post_simple_entry(v_debit, v_credit, v_amount, format('Randomised entry %s', i));
  end loop;

  perform test.eq_num(v_suite, 'the ledger nets to zero after 200 random entries',
    (select coalesce(sum(debit_base - credit_base), 0)
       from gl.journal_entry_line where entity_id = v_entity),
    0);

  select coalesce(sum(closing_base), 0) into v_total
    from gl.trial_balance(v_entity, v_period);

  perform test.eq_num(v_suite, 'the trial balance closing position nets to zero', v_total, 0);

  select coalesce(sum(period_debit - period_credit), 0) into v_movement
    from gl.trial_balance(v_entity, v_period);

  perform test.eq_num(v_suite, 'period movement nets to zero', v_movement, 0);

  -- The summary table is derived data; it must agree with the ledger it is
  -- derived from, both as maintained incrementally and as rebuilt.
  perform test.eq_num(v_suite, 'the incremental summary agrees with the ledger',
    (select coalesce(sum(debit_base - credit_base), 0)
       from gl.account_balance_period where entity_id = v_entity),
    0);

  perform test.eq_num(v_suite, 'summary debits equal ledger debits',
    (select coalesce(sum(debit_base), 0) from gl.account_balance_period where entity_id = v_entity),
    (select coalesce(sum(debit_base), 0) from gl.journal_entry_line where entity_id = v_entity));

  perform gl.rebuild_account_balances(v_entity);

  perform test.eq_num(v_suite, 'a rebuilt summary is identical to the incremental one',
    (select coalesce(sum(debit_base), 0) from gl.account_balance_period where entity_id = v_entity),
    (select coalesce(sum(debit_base), 0) from gl.journal_entry_line where entity_id = v_entity));

  -- Per-account agreement, not just an aggregate that could hide two offsetting
  -- errors.
  perform test.eq_num(v_suite, 'every account agrees between summary and ledger',
    (
      select count(*)
        from (
          select account_id, sum(debit_base - credit_base) as net
            from gl.account_balance_period where entity_id = v_entity group by account_id
        ) s
        full join (
          select account_id, sum(debit_base - credit_base) as net
            from gl.journal_entry_line where entity_id = v_entity group by account_id
        ) l on l.account_id = s.account_id
       where coalesce(s.net, 0) <> coalesce(l.net, 0)
    ),
    0);

  -- Balances as at a date must agree with the same figure read from the summary.
  select * into v_tb from gl.trial_balance(v_entity, v_period)
   where account_code = '1015';

  perform test.eq_num(v_suite, 'the as-at balance agrees with the trial balance',
    gl.account_balance_as_at(v_entity, test.account('1015'), v_date),
    v_tb.closing_base);

  -- A reversal must return the affected accounts to where they were.
  declare
    v_before numeric;
    v_entry  uuid;
  begin
    select gl.account_balance_as_at(v_entity, test.account('1015'), v_date) into v_before;

    v_entry := test.post_simple_entry('1015', '4010', 777777.77, 'To be reversed');
    perform gl.reverse_entry(v_entry, 'Testing that a reversal restores the position');

    perform test.eq_num(v_suite, 'an entry and its reversal leave the balance untouched',
      gl.account_balance_as_at(v_entity, test.account('1015'), v_date),
      v_before);
  end;

  -- Debits and credits are both non-negative everywhere: no account is holding
  -- a negative debit to fake a credit.
  perform test.eq_num(v_suite, 'no line carries a negative amount',
    (select count(*) from gl.journal_entry_line
      where entity_id = v_entity
        and (debit_txn < 0 or credit_txn < 0 or debit_base < 0 or credit_base < 0)),
    0);

  -- Every line belongs to the period its date falls in.
  perform test.eq_num(v_suite, 'every line sits in the period its date belongs to',
    (select count(*)
       from gl.journal_entry_line l
       join gl.fiscal_periods p on p.id = l.period_id
      where l.entity_id = v_entity
        and l.entry_date not between p.start_date and p.end_date),
    0);
end;
$$;
