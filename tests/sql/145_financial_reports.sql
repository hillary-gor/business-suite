-- ===========================================================================
-- Financial reports — P&L, balance sheet, aged receivables
-- ===========================================================================

do $$
declare
  v_suite       text := 'financial reports';
  v_entity      uuid := test.entity();
  v_actor       uuid := app.system_user_id();
  v_as_at       date := test.open_date();
  v_period_start date;
  v_invoice_date date;
  v_customer    uuid;
  v_invoice     uuid;
  v_entry       uuid;
  v_rev         numeric;
  v_ar          numeric;
  v_vat         numeric;
  v_bucket      text;
  v_outstanding numeric;
  v_days_past   integer;
begin
  perform set_config('app.current_user_id', v_actor::text, true);

  select p.start_date into v_period_start
    from gl.fiscal_periods p
   where p.id = test.open_period();

  -- Invoice dated early enough that it is past due as at open_date, while
  -- still satisfying due_date >= invoice_date and remaining in an open period.
  v_invoice_date := greatest(v_period_start, v_as_at - 45);

  v_customer := app.save_customer(v_entity, jsonb_build_object(
    'code', 'RPT-CUST',
    'legal_name', 'Reports Test Airlines',
    'currency_code', 'KES'
  ));

  v_invoice := sales.save_invoice(v_entity, jsonb_build_object(
    'customer_id', v_customer,
    'invoice_date', v_invoice_date,
    'due_date', v_invoice_date,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'description', 'Bench labour for aged AR',
        'quantity', 1,
        'unit_price', 10000,
        'tax_code_id', (select id from app.tax_codes where entity_id = v_entity and code = 'VAT16')
      )
    )
  ));

  v_entry := sales.issue_invoice(v_invoice);
  perform test.ok(v_suite, 'invoice was issued for report fixtures', v_entry is not null);

  -- -------------------------------------------------------------------------
  -- Profit and loss
  -- -------------------------------------------------------------------------

  select coalesce(sum(amount), 0) into v_rev
    from gl.profit_and_loss(v_entity, v_period_start, v_as_at)
   where account_type = 'REVENUE'
     and code = '4010';

  perform test.eq_num(v_suite, 'P&L shows parts sales revenue as credit-positive',
    v_rev, 10000);

  perform test.ok(v_suite, 'P&L returns revenue rows for the period',
    exists (
      select 1 from gl.profit_and_loss(v_entity, v_period_start, v_as_at)
       where account_type = 'REVENUE'
    ));

  -- -------------------------------------------------------------------------
  -- Balance sheet
  -- -------------------------------------------------------------------------

  select coalesce(sum(amount), 0) into v_ar
    from gl.balance_sheet(v_entity, v_as_at)
   where code = '1110';

  perform test.eq_num(v_suite, 'balance sheet shows AR debit-positive for the invoice',
    v_ar, 11600);

  select coalesce(sum(amount), 0) into v_vat
    from gl.balance_sheet(v_entity, v_as_at)
   where code = '2110';

  perform test.eq_num(v_suite, 'balance sheet shows VAT output credit-positive',
    v_vat, 1600);

  perform test.ok(v_suite, 'balance sheet returns asset and liability rows',
    exists (
      select 1 from gl.balance_sheet(v_entity, v_as_at) where account_type = 'ASSET'
    )
    and exists (
      select 1 from gl.balance_sheet(v_entity, v_as_at) where account_type = 'LIABILITY'
    ));

  -- -------------------------------------------------------------------------
  -- Aged receivables
  -- -------------------------------------------------------------------------

  select outstanding, bucket into v_outstanding, v_bucket
    from sales.aged_receivables(v_entity, v_as_at)
   where invoice_id = v_invoice;

  perform test.eq_num(v_suite, 'aged AR shows the full invoice outstanding',
    v_outstanding, 11600);

  v_days_past := v_as_at - v_invoice_date;

  if v_days_past <= 0 then
    perform test.eq(v_suite, 'not-yet-due invoice is current', v_bucket, 'current');
  elsif v_days_past between 1 and 30 then
    perform test.eq(v_suite, '1-30 day past-due invoice bucket', v_bucket, '1-30');
  elsif v_days_past between 31 and 60 then
    perform test.eq(v_suite, '31-60 day past-due invoice bucket', v_bucket, '31-60');
  elsif v_days_past between 61 and 90 then
    perform test.eq(v_suite, '61-90 day past-due invoice bucket', v_bucket, '61-90');
  else
    perform test.eq(v_suite, '90+ day past-due invoice bucket', v_bucket, '90+');
  end if;

  perform test.eq(v_suite, 'aged AR carries the customer code',
    (select customer_code from sales.aged_receivables(v_entity, v_as_at)
      where invoice_id = v_invoice), 'RPT-CUST');
end;
$$;
