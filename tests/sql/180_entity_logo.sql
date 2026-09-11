-- ===========================================================================
-- Company logo stored on the entity
-- ===========================================================================

do $$
declare
  v_suite  text := 'entity logo';
  v_entity uuid := test.entity();
  v_actor  uuid := app.system_user_id();
  v_png    bytea := decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
    'base64'
  );
begin
  perform set_config('app.current_user_id', v_actor::text, true);

  perform app.save_entity_logo(v_entity, 'image/png', v_png);

  perform test.eq(v_suite, 'logo mime is stored',
    (select logo_mime from app.entities where id = v_entity),
    'image/png');
  perform test.ok(v_suite, 'logo bytes are stored',
    (select logo_bytes is not null from app.entities where id = v_entity));

  perform app.save_entity_logo(v_entity, null, null);

  perform test.ok(v_suite, 'clearing the logo removes the bytes',
    (select logo_bytes is null from app.entities where id = v_entity));

  perform test.throws(
    v_suite,
    'an unsupported mime type is refused',
    format(
      'select app.save_entity_logo(%L, %L, decode(%L, %L))',
      v_entity,
      'application/pdf',
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      'base64'
    ),
    'PNG'
  );
end;
$$;
