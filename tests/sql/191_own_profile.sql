-- ===========================================================================
-- Own profile (name, job title, phone)
-- ===========================================================================

do $$
declare
  v_suite  text := 'own profile';
  v_entity uuid := test.entity();
  v_actor  uuid := app.system_user_id();
  v_user   uuid := gen_random_uuid();
  v_name   text;
  v_title  text;
  v_phone  text;
begin
  insert into auth.users (id, email) values (v_user, 'own.profile@skyjet.test');

  perform set_config('app.current_user_id', v_actor::text, true);
  perform app.provision_entity_user(
    v_entity, v_user, 'own.profile@skyjet.test', 'Before Name', 'viewer'
  );

  perform set_config('app.current_user_id', v_user::text, true);
  perform app.update_own_profile('Ada Librarian', 'Records clerk', '+254700000001');

  select full_name, job_title, phone
    into v_name, v_title, v_phone
    from app.users
   where id = v_user;

  perform test.eq(v_suite, 'the acting user can change their display name', v_name, 'Ada Librarian');
  perform test.eq(v_suite, 'the acting user can set a job title', v_title, 'Records clerk');
  perform test.eq(v_suite, 'the acting user can set a phone number', v_phone, '+254700000001');

  perform app.update_own_profile('Ada Librarian', '  ', '  ');
  select job_title, phone into v_title, v_phone from app.users where id = v_user;
  perform test.ok(v_suite, 'blank job title and phone clear those fields', v_title is null and v_phone is null);

  perform test.throws(
    v_suite,
    'an empty name is refused',
    format('select app.update_own_profile(%L, %L, %L)', ' ', 'Clerk', '+2547'),
    'full_name'
  );

  perform set_config('app.current_user_id', v_actor::text, true);
  perform test.throws(
    v_suite,
    'the system actor cannot have a login profile',
    format('select app.update_own_profile(%L, %L, %L)', 'System', null, null),
    'system actor'
  );

  perform test.ok(
    v_suite,
    'the application role can call update_own_profile',
    has_function_privilege('skyjet_app', 'app.update_own_profile(text, text, text)', 'EXECUTE')
  );

  perform test.ok(
    v_suite,
    'the browser role cannot call update_own_profile',
    not has_function_privilege('authenticated', 'app.update_own_profile(text, text, text)', 'EXECUTE')
  );

  if not (select r.rolsuper from pg_roles r where r.rolname = current_user) then
    execute format('grant skyjet_app to %I with set true, inherit false', current_user);
  end if;
  perform set_config('app.current_user_id', v_user::text, true);
  perform set_config('app.force_unprivileged', 'on', true);
  execute 'set local role skyjet_app';
  update app.users set full_name = 'Hacked' where id = v_user;
  execute 'set local role none';
  perform set_config('app.force_unprivileged', 'off', true);

  select full_name into v_name from app.users where id = v_user;
  perform test.eq(
    v_suite,
    'a direct update of app.users is a no-op under RLS',
    v_name,
    'Ada Librarian'
  );
end;
$$;
