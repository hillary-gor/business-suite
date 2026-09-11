-- ===========================================================================
-- Print helpers: address formatting and supplier statements
-- ===========================================================================

do $$
declare
  v_suite    text := 'document print';
  v_entity   uuid := test.entity();
  v_actor    uuid := app.system_user_id();
  v_supplier uuid;
  v_address  uuid;
  v_bill     uuid;
  v_tax      uuid;
  v_stmt     jsonb;
  v_formatted text;
begin
  perform set_config('app.current_user_id', v_actor::text, true);

  select id into v_tax from app.tax_codes where entity_id = v_entity and code = 'VAT16';

  insert into app.addresses (
    entity_id, kind, line1, line2, city, region, postal_code, country_code
  ) values (
    v_entity, 'BILLING', '12 Hangar Road', 'Unit B', 'Nairobi', 'Nairobi', '00100', 'KE'
  ) returning id into v_address;

  v_formatted := app.format_address(v_address);
  perform test.ok(v_suite, 'format_address joins lines',
    v_formatted like '12 Hangar Road%' and v_formatted like '%Kenya%');
  perform test.ok(v_suite, 'format_address is null for a missing id',
    app.format_address('00000000-0000-0000-0000-000000000001') is null);

  v_supplier := app.save_supplier(v_entity, jsonb_build_object(
    'code', 'STMT-SUP',
    'legal_name', 'Statement Avionics Ltd',
    'currency_code', 'KES',
    'approval_status', 'APPROVED'
  ));

  update app.suppliers
     set remit_to_address_id = v_address
   where id = v_supplier;

  v_bill := purch.save_bill(v_entity, jsonb_build_object(
    'supplier_id', v_supplier,
    'bill_date', test.open_date(),
    'lines', jsonb_build_array(
      jsonb_build_object(
        'description', 'Open statement freight',
        'quantity', 1,
        'unit_price', 1000,
        'tax_code_id', v_tax,
        'expense_account_id', test.account('5020')
      )
    )
  ));

  perform purch.post_bill(v_bill);

  v_stmt := purch.supplier_statement(v_entity, v_supplier, test.open_date());

  perform test.ok(v_suite, 'supplier statement returns the open bill',
    jsonb_array_length(v_stmt -> 'open_bills') = 1);
  perform test.ok(v_suite, 'supplier statement lists bill activity',
    jsonb_array_length(v_stmt -> 'recent_activity') >= 1);
  perform test.eq(v_suite, 'supplier statement as-of matches the argument',
    v_stmt ->> 'as_of', test.open_date()::text);
end;
$$;
