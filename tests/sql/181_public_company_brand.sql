-- ===========================================================================
-- Public company brand for the sign-in screen
-- ===========================================================================

do $$
declare
  v_suite  text := 'public company brand';
  v_entity uuid := test.entity();
  v_png    bytea := decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
    'base64'
  );
  v_name   text;
  v_logo   boolean;
begin
  perform set_config('app.current_user_id', app.system_user_id()::text, true);

  select display_name, has_logo into v_name, v_logo from app.public_company_brand();

  perform test.eq(v_suite, 'seeded trading name is the public display name',
    v_name, 'SkyJet Aircraft Spares');
  perform test.ok(v_suite, 'seeded entity has no uploaded logo',
    v_logo is false);

  perform test.ok(v_suite, 'public logo is empty until one is stored',
    not exists (select 1 from app.public_company_logo()));

  perform app.save_entity_logo(v_entity, 'image/png', v_png);

  perform test.ok(v_suite, 'an uploaded logo is advertised on the public brand',
    (select has_logo from app.public_company_brand()));
  perform test.eq(v_suite, 'public logo mime matches the upload',
    (select mime from app.public_company_logo()),
    'image/png');

  update app.entities
     set trading_name = null,
         legal_name = '   '
   where id = v_entity;

  perform test.ok(v_suite, 'blank legal and trading names yield no display name',
    (select display_name from app.public_company_brand()) is null);

  perform app.save_entity_logo(v_entity, null, null);
end;
$$;
