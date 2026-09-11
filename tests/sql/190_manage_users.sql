-- ===========================================================================
-- Invite and role assignment (Manage users)
-- ===========================================================================

do $$
declare
  v_suite   text := 'manage users';
  v_entity  uuid := test.entity();
  v_actor   uuid := app.system_user_id();
  v_owner   uuid := gen_random_uuid();
  v_sales   uuid := gen_random_uuid();
  v_role    text;
  v_active  boolean;
begin
  insert into auth.users (id, email) values
    (v_owner, 'owner.invite@skyjet.test'),
    (v_sales, 'sales.invite@skyjet.test');

  perform set_config('app.current_user_id', v_actor::text, true);

  -- The harness is privileged, so these writes succeed without a role grant.
  perform app.provision_entity_user(
    v_entity, v_owner, 'owner.invite@skyjet.test', 'Test Owner', 'owner'
  );
  perform app.provision_entity_user(
    v_entity, v_sales, 'sales.invite@skyjet.test', 'Test Sales', 'sales'
  );

  select r.code into v_role
    from app.user_roles ur
    join app.roles r on r.id = ur.role_id
   where ur.user_id = v_sales and ur.entity_id = v_entity;
  perform test.eq(v_suite, 'a new person receives the requested role', v_role, 'sales');

  perform app.provision_entity_user(
    v_entity, v_sales, 'sales.invite@skyjet.test', 'Test Sales', 'accountant'
  );
  select r.code into v_role
    from app.user_roles ur
    join app.roles r on r.id = ur.role_id
   where ur.user_id = v_sales and ur.entity_id = v_entity;
  perform test.eq(v_suite, 're-provisioning replaces the previous role', v_role, 'accountant');

  perform test.eq_num(
    v_suite,
    'a person holds one role in the entity after a replace',
    (select count(*) from app.user_roles where user_id = v_sales and entity_id = v_entity),
    1
  );

  perform test.throws(
    v_suite,
    'an unknown role is refused',
    format(
      'select app.provision_entity_user(%L::uuid, %L::uuid, %L, %L, %L)',
      v_entity, v_sales, 'sales.invite@skyjet.test', 'Test Sales', 'not_a_role'
    ),
    'unknown role'
  );

  perform test.throws(
    v_suite,
    'an empty name is refused',
    format(
      'select app.provision_entity_user(%L::uuid, %L::uuid, %L, %L, %L)',
      v_entity, v_sales, 'sales.invite@skyjet.test', ' ', 'sales'
    ),
    'full_name'
  );

  perform test.throws(
    v_suite,
    'the system actor cannot be granted a login role',
    format(
      'select app.provision_entity_user(%L::uuid, %L::uuid, %L, %L, %L)',
      v_entity, v_actor, 'system@skyjet.internal', 'System', 'owner'
    ),
    'system actor'
  );

  -- Two owners: demoting one is allowed. The remaining owner cannot be.
  perform app.provision_entity_user(
    v_entity, v_sales, 'sales.invite@skyjet.test', 'Test Sales', 'owner'
  );
  perform app.provision_entity_user(
    v_entity, v_sales, 'sales.invite@skyjet.test', 'Test Sales', 'sales'
  );
  select r.code into v_role
    from app.user_roles ur
    join app.roles r on r.id = ur.role_id
   where ur.user_id = v_sales and ur.entity_id = v_entity;
  perform test.eq(v_suite, 'a non-last owner can be demoted', v_role, 'sales');

  perform test.throws(
    v_suite,
    'the last owner cannot be demoted',
    format(
      'select app.provision_entity_user(%L::uuid, %L::uuid, %L, %L, %L)',
      v_entity, v_owner, 'owner.invite@skyjet.test', 'Test Owner', 'viewer'
    ),
    'last owner'
  );

  perform test.throws(
    v_suite,
    'the last owner cannot be deactivated',
    format(
      'select app.set_entity_user_active(%L::uuid, %L::uuid, false)',
      v_entity, v_owner
    ),
    'last owner'
  );

  perform app.set_entity_user_active(v_entity, v_sales, false);
  select is_active into v_active from app.users where id = v_sales;
  perform test.ok(v_suite, 'a non-owner can be deactivated', not v_active);

  perform app.set_entity_user_active(v_entity, v_sales, true);
  select is_active into v_active from app.users where id = v_sales;
  perform test.ok(v_suite, 'a deactivated person can be reactivated', v_active);

  -- Permission is actually checked when the session is not exempt.
  perform set_config('app.force_unprivileged', 'on', true);
  perform test.throws(
    v_suite,
    'provisioning without users.manage is refused',
    format(
      'select app.provision_entity_user(%L::uuid, %L::uuid, %L, %L, %L)',
      v_entity, v_sales, 'sales.invite@skyjet.test', 'Test Sales', 'sales'
    ),
    'permission denied'
  );
  perform set_config('app.force_unprivileged', '', true);
end;
$$;
