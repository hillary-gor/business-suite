-- ===========================================================================
-- Multi-currency: dual amounts, translation rounding, and revaluation.
--
-- The scenario throughout is the real one: SkyJet buys in dollars and reports
-- in shillings, so every foreign balance has two truths - what is owed, and
-- what that is worth today - and the ledger has to hold both without letting
-- them drift apart.
-- ===========================================================================

do $$
declare
  v_suite  text := 'multi-currency and revaluation';
  v_entity uuid := test.entity();
  v_date   date := test.open_date();
  v_period uuid := test.open_period();
  v_entry  uuid;
  v_run    uuid;
  v_usd_bank uuid := test.account('1016');
  v_balance_txn  numeric;
  v_balance_base numeric;
begin
  -- A rate is required. Guessing one would be worse than failing.
  perform test.throws(v_suite,
    'a foreign posting with no published rate is refused',
    format($sql$
      select gl.post_entry(%L, jsonb_build_object(
        'entry_date', %L::date, 'source_type', 'MANUAL', 'description', 'No rate',
        'lines', jsonb_build_array(
          jsonb_build_object('account_code', '1016', 'currency_code', 'USD', 'debit', 100, 'credit', 0),
          jsonb_build_object('account_code', '4010', 'debit', 0, 'credit', 13000)
        )
      ))
    $sql$, v_entity, v_date),
    'No SPOT exchange rate');

  insert into app.fx_rates (entity_id, from_currency, to_currency, rate_date, rate_type, rate, source)
  values (v_entity, 'USD', 'KES', v_date - 10, 'SPOT', 128.00000000, 'TEST');

  perform test.eq_num(v_suite, 'the published rate is found for a later date',
    app.fx_rate_on(v_entity, 'USD', 'KES', v_date, 'SPOT'), 128.00000000);

  perform test.eq_num(v_suite, 'a same-currency conversion is one',
    app.fx_rate_on(v_entity, 'KES', 'KES', v_date, 'SPOT'), 1);

  perform test.eq_num(v_suite, 'the reciprocal rate is derived when only one direction is published',
    app.fx_rate_on(v_entity, 'KES', 'USD', v_date, 'SPOT'), round(1 / 128.0, 8));

  -- A USD receipt of 10,000 at 128 is 1,280,000 shillings.
  v_entry := gl.post_entry(v_entity, jsonb_build_object(
    'entry_date',  v_date,
    'source_type', 'MANUAL',
    'description', 'USD parts sale',
    'lines', jsonb_build_array(
      jsonb_build_object('account_code', '1016', 'currency_code', 'USD', 'debit', 10000, 'credit', 0),
      jsonb_build_object('account_code', '4010', 'currency_code', 'KES', 'debit', 0, 'credit', 1280000)
    )
  ));

  select sum(debit_txn - credit_txn), sum(debit_base - credit_base)
    into v_balance_txn, v_balance_base
    from gl.journal_entry_line
   where entry_id = v_entry and account_id = v_usd_bank;

  perform test.eq_num(v_suite, 'the transaction amount is held in dollars', v_balance_txn, 10000);
  perform test.eq_num(v_suite, 'the base amount is held in shillings', v_balance_base, 1280000);

  perform test.eq_num(v_suite, 'the entry balances in base currency',
    (select sum(debit_base - credit_base) from gl.journal_entry_line where entry_id = v_entry), 0);

  perform test.eq_num(v_suite, 'the rate applied is recorded on the line',
    (select fx_rate from gl.journal_entry_line
      where entry_id = v_entry and account_id = v_usd_bank), 128.00000000);

  -- Translation rounding: three foreign lines that balance in dollars need not
  -- balance to the cent in shillings once each is rounded separately. The
  -- residue goes to the rounding account rather than being refused.
  insert into app.fx_rates (entity_id, from_currency, to_currency, rate_date, rate_type, rate, source)
  values (v_entity, 'EUR', 'KES', v_date, 'SPOT', 141.33333333, 'TEST');

  v_entry := gl.post_entry(v_entity, jsonb_build_object(
    'entry_date',  v_date,
    'source_type', 'MANUAL',
    'description', 'Rounding residue',
    'lines', jsonb_build_array(
      jsonb_build_object('account_code', '6110', 'currency_code', 'EUR', 'debit', 33.33, 'credit', 0),
      jsonb_build_object('account_code', '6120', 'currency_code', 'EUR', 'debit', 33.33, 'credit', 0),
      jsonb_build_object('account_code', '6130', 'currency_code', 'EUR', 'debit', 33.34, 'credit', 0),
      jsonb_build_object('account_code', '2030', 'currency_code', 'EUR', 'debit', 0, 'credit', 100.00)
    )
  ));

  perform test.eq_num(v_suite, 'a translated entry still balances exactly in base currency',
    (select sum(debit_base - credit_base) from gl.journal_entry_line where entry_id = v_entry), 0);

  perform test.eq_num(v_suite, 'it still balances in the transaction currency too',
    (select sum(debit_txn - credit_txn) from gl.journal_entry_line
      where entry_id = v_entry and currency_code = 'EUR'), 0);

  -- An imbalance too large to be rounding is a mistake, and is refused.
  perform test.throws(v_suite,
    'an imbalance beyond the rounding tolerance is refused',
    format($sql$
      select gl.post_entry(%L, jsonb_build_object(
        'entry_date', %L::date, 'source_type', 'MANUAL', 'description', 'Real imbalance',
        'lines', jsonb_build_array(
          jsonb_build_object('account_code', '1015', 'debit', 1000, 'credit', 0),
          jsonb_build_object('account_code', '4010', 'debit', 0, 'credit', 999)
        )
      ))
    $sql$, v_entity, v_date),
    'Tolerance for rounding');

  -- -------------------------------------------------------------------------
  -- Revaluation
  --
  -- The dollar account holds 10,000 recorded at 128. At a closing rate of 131
  -- it is worth 1,310,000, so an unrealised gain of 30,000 must appear.
  -- -------------------------------------------------------------------------

  insert into app.fx_rates (entity_id, from_currency, to_currency, rate_date, rate_type, rate, source)
  values (v_entity, 'USD', 'KES',
          (select end_date from gl.fiscal_periods where id = v_period),
          'CLOSING', 131.00000000, 'TEST');

  v_run := gl.revalue_fx(v_entity, v_period, 'CLOSING');

  perform test.eq_num(v_suite, 'the revaluation posted the expected unrealised gain',
    (select net_gain_base from gl.fx_revaluation_run where id = v_run), 30000);

  perform test.eq_num(v_suite, 'the dollar account is now carried at the closing rate',
    (select sum(debit_base - credit_base) from gl.journal_entry_line
      where entity_id = v_entity and account_id = v_usd_bank),
    1310000);

  perform test.eq_num(v_suite, 'the dollar balance itself is unchanged',
    (select sum(debit_txn - credit_txn) from gl.journal_entry_line
      where entity_id = v_entity and account_id = v_usd_bank and currency_code = 'USD'),
    10000);

  perform test.eq_num(v_suite, 'the gain landed in unrealised exchange gain',
    (select sum(credit_base - debit_base) from gl.journal_entry_line
      where entity_id = v_entity and account_id = test.account('4920')),
    30000);

  perform test.eq_num(v_suite, 'the ledger still nets to zero after revaluation',
    (select sum(debit_base - credit_base) from gl.journal_entry_line where entity_id = v_entity), 0);

  -- Running it again at the same rate must do nothing. Revaluations that
  -- compound are how a balance sheet quietly inflates.
  v_run := gl.revalue_fx(v_entity, v_period, 'CLOSING');

  perform test.eq_num(v_suite, 'a second run at the same rate posts nothing',
    (select net_gain_base from gl.fx_revaluation_run where id = v_run), 0);

  perform test.eq_num(v_suite, 'the carrying value did not move again',
    (select sum(debit_base - credit_base) from gl.journal_entry_line
      where entity_id = v_entity and account_id = v_usd_bank),
    1310000);

  -- A fall in the rate reverses the position rather than adding to it.
  update app.fx_rates set rate = 126.00000000
   where entity_id = v_entity and from_currency = 'USD' and rate_type = 'CLOSING';

  v_run := gl.revalue_fx(v_entity, v_period, 'CLOSING');

  perform test.eq_num(v_suite, 'a falling rate posts the movement, not the whole position',
    (select net_gain_base from gl.fx_revaluation_run where id = v_run), -50000);

  perform test.eq_num(v_suite, 'the account is now carried at the lower rate',
    (select sum(debit_base - credit_base) from gl.journal_entry_line
      where entity_id = v_entity and account_id = v_usd_bank),
    1260000);

  perform test.eq_num(v_suite, 'the ledger still nets to zero',
    (select sum(debit_base - credit_base) from gl.journal_entry_line where entity_id = v_entity), 0);
end;
$$;
