-- ===========================================================================
-- Entity company settings (Account and settings)
-- ===========================================================================

do $$
declare
  v_suite  text := 'entity settings';
  v_entity uuid := test.entity();
  v_actor  uuid := app.system_user_id();
  v_code   text;
begin
  perform set_config('app.current_user_id', v_actor::text, true);

  select code into v_code from app.entities where id = v_entity;

  perform app.save_entity(v_entity, jsonb_build_object(
    'legal_name', 'SkyJet Aircraft Spares Ltd',
    'trading_name', 'SkyJet Spares',
    'tax_pin', 'P051234567X',
    'registration_number', 'PVT-TEST-001',
    'country_code', 'KE',
    'fiscal_year_start_month', 4,
    'timezone', 'Africa/Nairobi',
    'address_line1', 'Wilson Airport',
    'city', 'Nairobi',
    'email', 'accounts@skyjet.test'
  ));

  perform test.eq(v_suite, 'legal name is saved',
    (select legal_name from app.entities where id = v_entity),
    'SkyJet Aircraft Spares Ltd');
  perform test.eq(v_suite, 'trading name is saved',
    (select trading_name from app.entities where id = v_entity),
    'SkyJet Spares');
  perform test.eq(v_suite, 'tax PIN is saved',
    (select tax_pin from app.entities where id = v_entity),
    'P051234567X');
  perform test.eq_num(v_suite, 'fiscal year start month is saved',
    (select fiscal_year_start_month from app.entities where id = v_entity), 4);
  perform test.eq(v_suite, 'entity code is unchanged',
    (select code from app.entities where id = v_entity), v_code);

  perform test.throws(v_suite, 'an empty legal name is refused',
    format('select app.save_entity(%L, %L::jsonb)', v_entity, '{"legal_name":""}'),
    'legal_name');
end;
$$;
