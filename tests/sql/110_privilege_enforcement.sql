-- ===========================================================================
-- 110_privilege_enforcement.sql
--
-- Guards the two controls that were found switched off in the first hosted
-- deployment. Both had passed every existing test, because both were being
-- tested from a session that was exempt from them.
--
-- 1. RBAC in the write path. Every posting function is SECURITY DEFINER, so
--    inside them `current_user` is the function's owner rather than the
--    caller. app.is_privileged_session() used to ask about current_user, so
--    wherever the owner was a superuser it answered "privileged" for every
--    caller, and app.require_permission() returned without checking anything.
--
-- 2. Row level security. 0008 wrote every policy `to authenticated` while the
--    application connects as skyjet_app. A role matching no policy is denied
--    every row, so the application could read nothing at all.
--
-- Neither was visible from the test harness, which connects as the database
-- owner: the owner bypasses RLS (no table is FORCEd) and satisfied the old
-- superuser check. So this suite deliberately steps out of that exemption -
-- app.force_unprivileged for the permission checks, SET LOCAL ROLE for RLS -
-- and asserts against the enforced path rather than the open one.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The exemption itself
-- ---------------------------------------------------------------------------
do $$
declare
  v_suite text := 'privilege enforcement';
begin
  perform test.ok(
    v_suite,
    'the harness session is privileged by default',
    app.is_privileged_session(),
    'if this fails the suite is running as an unexpected role and the rest is meaningless'
  );

  perform set_config('app.force_unprivileged', 'on', true);
  perform test.ok(
    v_suite,
    'app.force_unprivileged drops the exemption',
    not app.is_privileged_session()
  );

  perform set_config('app.force_unprivileged', '', true);
  perform test.ok(
    v_suite,
    'clearing app.force_unprivileged restores it',
    app.is_privileged_session()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER must not launder an unprivileged caller into a privileged
-- one. This is the exact shape of the original bug.
-- ---------------------------------------------------------------------------
create function pg_temp.secdef_probe()
returns boolean
language sql
security definer
as $$ select app.is_privileged_session() $$;

do $$
declare
  v_suite text := 'privilege enforcement';
begin
  perform set_config('app.force_unprivileged', 'on', true);

  perform test.ok(
    v_suite,
    'a SECURITY DEFINER function does not regain privilege from its owner',
    not pg_temp.secdef_probe(),
    'current_user is the owner inside the function; the check must look at session state instead'
  );

  perform set_config('app.force_unprivileged', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- The posting engine actually checks permissions
-- ---------------------------------------------------------------------------
do $$
declare
  v_suite  text := 'privilege enforcement';
  v_entity uuid := test.entity();
begin
  -- An actor who exists but holds no role in this entity.
  perform set_config('app.current_user_id', app.system_user_id()::text, true);
  perform set_config('app.force_unprivileged', 'on', true);

  perform test.ok(
    v_suite,
    'the actor genuinely has no posting permission',
    not app.user_has_permission(v_entity, 'gl.post_journal', app.system_user_id())
  );

  perform test.throws(
    v_suite,
    'gl.post_entry refuses a manual posting without gl.post_journal',
    format(
      $q$select gl.post_entry(%L::uuid,
            '{"entry_date":"2001-01-01","source_type":"MANUAL","description":"unauthorised","lines":[]}'::jsonb,
            null)$q$,
      v_entity
    ),
    'permission denied'
  );

  perform test.throws(
    v_suite,
    'app.require_permission raises rather than returning false',
    format($q$select app.require_permission(%L::uuid, 'gl.post_journal')$q$, v_entity),
    'permission denied'
  );

  perform set_config('app.force_unprivileged', '', true);
  perform set_config('app.current_user_id', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security, evaluated as the application role
--
-- Counts are taken while the session is skyjet_app and only asserted after
-- returning to the owner, because skyjet_app has no privilege on the test
-- schema and could not record a result.
-- ---------------------------------------------------------------------------
do $$
declare
  v_suite       text := 'privilege enforcement';
  v_entity      uuid := test.entity();
  v_user        uuid := app.system_user_id();
  v_admin       uuid := (select id from app.roles where code = 'owner');
  v_ref_visible integer;
  v_blind       integer;
  v_users_blind integer;
  v_forged      integer;
  v_granted     integer;
  v_users_self  integer;
begin
  -- SET ROLE needs the SET option on the membership, which PostgreSQL 16
  -- separated from ADMIN and from INHERIT. A superuser may always SET ROLE,
  -- which covers PGlite and a local `supabase start`. On hosted Supabase the
  -- owner is not a superuser: creating skyjet_app gave it ADMIN OPTION but
  -- neither SET nor INHERIT, so pg_has_role reports membership while SET ROLE
  -- is still refused. Granting SET explicitly is what makes the two agree.
  --
  -- INHERIT stays false so the owner does not silently acquire the role's
  -- privileges for the rest of the transaction; this is about being able to
  -- step into the role deliberately, not about borrowing it.
  --
  -- Deliberately not wrapped in an exception handler that downgrades this to a
  -- skip. A security test that quietly stops running is how the hole this
  -- suite exists to catch survived in the first place.
  if not (select r.rolsuper from pg_roles r where r.rolname = current_user) then
    execute format('grant skyjet_app to %I with set true, inherit false', current_user);
  end if;

  -- Reference data carries `using (true)`. It is the control: if this is zero,
  -- the role cannot read at all and the other counts prove nothing.
  execute 'set local role skyjet_app';
  select count(*) into v_ref_visible from app.currencies;

  -- No caller in context.
  select count(*) into v_blind from gl.accounts;
  select count(*) into v_users_blind from app.users;

  -- A caller with no role in the entity.
  perform set_config('app.current_user_id', '00000000-0000-0000-0000-0000000000ff', true);
  select count(*) into v_forged from gl.accounts;
  execute 'set local role none';

  perform test.ok(v_suite, 'the application role can read reference data', v_ref_visible > 0);
  perform test.eq_num(v_suite, 'entity data is invisible with no caller in context', v_blind, 0);
  perform test.eq_num(
    v_suite,
    'app.users is invisible without a caller, so a session query must set one',
    v_users_blind, 0
  );
  perform test.eq_num(v_suite, 'entity data is invisible to an unassigned user', v_forged, 0);

  -- Grant the actor a role in the entity, then look again. Done as the owner,
  -- and rolled back with the rest of the suite.
  perform set_config('app.current_user_id', v_user::text, true);
  insert into app.user_roles (user_id, entity_id, role_id) values (v_user, v_entity, v_admin);

  execute 'set local role skyjet_app';
  select count(*) into v_granted from gl.accounts;
  select count(*) into v_users_self from app.users where id = v_user;
  execute 'set local role none';

  perform test.ok(
    v_suite,
    'entity data becomes visible once the caller has a role in the entity',
    v_granted > 0,
    format('saw %s accounts after the grant, %s before', v_granted, v_blind)
  );
  perform test.eq_num(
    v_suite,
    'a caller can read their own app.users row once current_user_id is set',
    v_users_self, 1
  );

  perform set_config('app.current_user_id', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- The standing coverage check
-- ---------------------------------------------------------------------------
do $$
declare
  v_suite text := 'privilege enforcement';
  v_no_rls  integer;
  v_no_pol  integer;
  v_no_app  integer;
begin
  select
    count(*) filter (where not rls_enabled),
    count(*) filter (where policy_count = 0),
    count(*) filter (where app_role_policy_count = 0)
    into v_no_rls, v_no_pol, v_no_app
  from app.v_rls_coverage;

  perform test.eq_num(v_suite, 'every business table has RLS enabled', v_no_rls, 0);
  perform test.eq_num(v_suite, 'every business table has at least one policy', v_no_pol, 0);
  perform test.eq_num(v_suite, 'every business table is readable by the application role', v_no_app, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- A caller must not be able to influence name resolution inside a function
-- that runs with the owner's rights.
-- ---------------------------------------------------------------------------
do $$
declare
  v_suite  text := 'privilege enforcement';
  v_loose  integer;
  v_secdef integer;
begin
  select
    count(*) filter (where not search_path_pinned),
    count(*) filter (where security_definer and not search_path_pinned)
    into v_loose, v_secdef
  from app.v_function_search_path;

  perform test.eq_num(
    v_suite,
    'no SECURITY DEFINER routine has a caller-mutable search_path',
    v_secdef, 0
  );
  perform test.eq_num(
    v_suite,
    'every routine in the business schemas pins its search_path',
    v_loose, 0
  );
end;
$$;
