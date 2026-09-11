-- ---------------------------------------------------------------------------
-- Let the application role past its own front door
--
-- 0008 enabled RLS on all 56 business tables and wrote every policy `to
-- authenticated`, the browser's role. It then relied on 0005's SELECT grants
-- to give `skyjet_app` its reads.
--
-- Those two things do not compose. A table with RLS enabled denies every row
-- to any role that matches no policy, whatever it has been granted. The
-- application connects as skyjet_app, matches nothing, and reads nothing -
-- every list, every report, every lookup returns zero rows.
--
-- Why no test caught it: the invariant suite connects as the database owner,
-- and RLS is not FORCEd on any table (verified: 0 of 56), so the owner
-- bypasses policies entirely. The suite therefore never executed a single
-- policy. This was found by connecting over the real pooler as the real
-- application role - see scripts/verify-app-role.mjs, which now runs that
-- check permanently.
--
-- The fix is to add skyjet_app to the policies rather than to exempt it. The
-- expressions are all built on app.user_has_entity_access() and
-- app.current_user_id(), and src/server/db/transaction.ts already sets
-- app.current_user_id and app.current_entity_id with is_local => true at the
-- start of every transaction. So the same expression that scopes the browser
-- to its entities scopes the server to them too, and entity isolation becomes
-- something the database enforces on both paths instead of something the
-- application is trusted to remember.
--
-- The alternative - granting skyjet_app BYPASSRLS - would have been one word,
-- and would have switched the second lock off for the path that carries all
-- the traffic.
--
-- No recursion risk: app.user_has_entity_access and app.user_has_permission
-- are SECURITY DEFINER owned by the table owner, so their internal reads of
-- app.user_roles are not themselves subject to these policies.
-- ---------------------------------------------------------------------------

set search_path = pg_catalog, public, extensions;

-- Future tables get both roles from the start.
create or replace function app.apply_entity_read_policy(p_table regclass)
returns void
language plpgsql
as $$
declare
  v_name text := 'entity_read_' || replace(p_table::text, '.', '_');
begin
  execute format('drop policy if exists %I on %s', v_name, p_table);
  execute format(
    'create policy %I on %s for select to authenticated, skyjet_app
       using (app.user_has_entity_access(entity_id))',
    v_name, p_table
  );
end;
$$;

create or replace function app.apply_reference_read_policy(p_table regclass)
returns void
language plpgsql
as $$
declare
  v_name text := 'reference_read_' || replace(p_table::text, '.', '_');
begin
  execute format('drop policy if exists %I on %s', v_name, p_table);
  execute format(
    'create policy %I on %s for select to authenticated, skyjet_app using (true)',
    v_name, p_table
  );
end;
$$;

-- Extend the policies already in place. ALTER POLICY ... TO changes only the
-- role list, so each USING expression is carried over exactly as written -
-- including the bespoke ones for app.users, audit.log and the opening-balance
-- staging tables, which must not be re-derived by hand.
do $$
declare
  v_policy record;
  v_count  integer := 0;
begin
  if not exists (select 1 from pg_roles where rolname = 'skyjet_app') then
    raise exception 'skyjet_app does not exist; 0005_posting_engine.sql must run first';
  end if;

  for v_policy in
    select n.nspname as schema_name, c.relname as table_name, pol.polname
      from pg_policy pol
      join pg_class c     on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('app', 'gl', 'inv', 'audit', 'integration')
       and not exists (
         select 1 from unnest(pol.polroles) as r(oid)
          where r.oid = 'skyjet_app'::regrole
       )
  loop
    execute format(
      'alter policy %I on %I.%I to authenticated, skyjet_app',
      v_policy.polname, v_policy.schema_name, v_policy.table_name
    );
    v_count := v_count + 1;
  end loop;

  raise notice 'extended % policies to skyjet_app', v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Make the standing check able to see this failure
--
-- The old view counted policies per table. A table with policies that all
-- point at some other role looks healthy by that measure, which is exactly how
-- this got through. Counting the policies that actually apply to the
-- application role is the measure that would have caught it.
-- ---------------------------------------------------------------------------

create or replace view app.v_rls_coverage as
select
  n.nspname                                   as schema_name,
  c.relname                                   as table_name,
  c.relrowsecurity                            as rls_enabled,
  count(p.polname)::int                       as policy_count,
  -- The role OIDs are looked up in a scalar subquery rather than written as
  -- regrole constants: a view definition cannot hold a regrole literal,
  -- because role OIDs are not a dependency the catalogue can track.
  count(p.polname) filter (
    where (select r.oid from pg_roles r where r.rolname = 'skyjet_app') = any (p.polroles)
  )::int                                      as app_role_policy_count,
  count(p.polname) filter (
    where (select r.oid from pg_roles r where r.rolname = 'authenticated') = any (p.polroles)
  )::int                                      as browser_policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname in ('app', 'gl', 'inv', 'audit', 'integration')
  and c.relkind = 'r'
group by n.nspname, c.relname, c.relrowsecurity
order by n.nspname, c.relname;

comment on view app.v_rls_coverage is
  'Every business table with its RLS state. rls_enabled false is a hole. policy_count zero denies everyone. app_role_policy_count zero means the application reads nothing from that table, which is almost always a mistake rather than a decision.';
