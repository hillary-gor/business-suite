-- ---------------------------------------------------------------------------
-- Correct the privileged-session test
--
-- app.is_privileged_session() decides whether app.require_permission() is
-- bypassed. The original definition asked whether `current_user` is a
-- superuser. Both halves of that are wrong.
--
-- WRONG HALF ONE - current_user.
--
-- Every function in the posting engine is SECURITY DEFINER and owned by the
-- role that ran the migrations. Inside such a function `current_user` is the
-- function's owner, not the caller. Verified on this database: a session that
-- had dropped to an unprivileged role saw current_user = '_probe_unpriv'
-- outside the function and 'postgres' inside it.
--
-- So inside gl.post_entry, gl.reverse_entry, inv.post_movement,
-- gl.close_period and gl.post_opening_balances, the old test never saw the
-- caller at all. Wherever the owner happens to be a superuser - local
-- `supabase db reset`, the PGlite harness, CI, and most self-hosted Postgres -
-- require_permission() returned early every single time, and every RBAC check
-- in the write path was dead code. The permission tests passed because nothing
-- was being tested.
--
-- Hosted Supabase escaped this only by accident: its `postgres` role is not a
-- superuser. Relying on that is not a security control.
--
-- session_user is the right question. It is the role the client actually
-- authenticated as, and unlike current_user it is unchanged by SECURITY
-- DEFINER and by SET ROLE.
--
-- WRONG HALF TWO - superuser.
--
-- Hosted Supabase's `postgres` owns the database but has rolsuper = false, so
-- a superuser-only test locks the owner out of its own seed and maintenance
-- work. Database ownership is the honest test alongside superuser: an owner
-- can already redefine these functions or drop the constraints outright, so
-- letting it skip an application-level permission check concedes nothing it
-- does not already have.
--
-- Ownership is deliberately narrower than "can bypass RLS". On this project
-- service_role also has rolbypassrls, but it is an API credential handed to
-- clients and must stay subject to application permissions. Measured on this
-- database: postgres rolsuper=false owns_db=true; service_role rolsuper=false
-- owns_db=false; skyjet_app both false.
--
-- THE ESCAPE HATCH.
--
-- app.force_unprivileged = 'on' forces the answer to false. It can only ever
-- remove privilege, never grant it, so it is safe to leave in production. It
-- exists so the invariant suite - which necessarily connects as an owner or
-- superuser - can exercise the enforced path instead of asserting against a
-- permanently open door.
-- ---------------------------------------------------------------------------

create or replace function app.is_privileged_session()
returns boolean
language sql
stable
as $$
  select
    coalesce(current_setting('app.force_unprivileged', true), '') is distinct from 'on'
    and exists (
      select 1
        from pg_roles r
       where r.rolname = session_user
         and (
           r.rolsuper
           or r.oid = (select d.datdba from pg_database d where d.datname = current_database())
         )
    );
$$;

comment on function app.is_privileged_session() is
  'True when the authenticated session role (session_user, not current_user - SECURITY DEFINER changes the latter) is a superuser or owns this database. Set app.force_unprivileged = ''on'' to force false for testing; it can only reduce privilege.';
