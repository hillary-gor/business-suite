-- ===========================================================================
-- Module entitlements.
--
-- Authentication and entitlement are different questions. An organisation can
-- be signed in and still be refused Business Suite or Library.
-- ===========================================================================

do $$
declare
  v_suite  text := 'module entitlements';
  v_entity uuid := test.entity();
  v_other  uuid;
begin
  perform test.ok(v_suite, 'business_suite is a registered module',
    exists (select 1 from app.modules where code = 'business_suite'));

  perform test.ok(v_suite, 'library is a registered module',
    exists (select 1 from app.modules where code = 'library'));

  perform test.ok(v_suite, 'the seeded organisation is entitled to business suite',
    app.entity_has_module(v_entity, 'business_suite'));

  perform test.ok(v_suite, 'the seeded organisation is entitled to library',
    app.entity_has_module(v_entity, 'library'));

  insert into app.entities (code, legal_name, base_currency_code)
  values ('LIBONLY', 'Library Only Test Ltd', 'KES')
  returning id into v_other;

  perform test.ok(v_suite, 'a new organisation is entitled to both modules by default',
    app.entity_has_module(v_other, 'business_suite')
    and app.entity_has_module(v_other, 'library'));

  update app.entity_modules
     set enabled = false
   where entity_id = v_other and module_code = 'business_suite';

  perform test.ok(v_suite, 'disabling business_suite does not log the organisation out of library',
    app.entity_has_module(v_other, 'library')
    and not app.entity_has_module(v_other, 'business_suite'));

  perform set_config('app.force_unprivileged', 'on', true);
  perform set_config('app.current_user_id', app.system_user_id()::text, true);

  perform test.throws(
    v_suite,
    'require_module refuses a disabled module',
    format($q$select app.require_module(%L::uuid, 'business_suite')$q$, v_other),
    'not entitled'
  );

  perform test.throws(
    v_suite,
    'set_entity_module requires admin.manage_entity',
    format($q$select app.set_entity_module(%L::uuid, 'library', false)$q$, v_other),
    'permission denied'
  );

  perform set_config('app.force_unprivileged', '', true);
  perform set_config('app.current_user_id', '', true);
end;
$$;
