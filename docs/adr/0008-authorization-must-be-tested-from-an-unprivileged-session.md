# ADR 0008 — Authorization must be tested from an unprivileged session

Status: accepted
Date: 2026-09-04

## Context

The first deployment to a hosted Supabase project found two access controls
that were not working. Both had been written carefully, both were covered by
tests, and both tests passed. They passed because the test session was exempt
from the control it was testing.

**RBAC in the write path.** Every function in the posting engine is
`SECURITY DEFINER`, which is what lets an application role with no DML
privilege on the ledger nonetheless post to it. Inside such a function
`current_user` is the function's owner, not the caller. `app.is_privileged_session()`
asked whether `current_user` was a superuser, so inside `gl.post_entry` it was
really asking whether the _owner_ was a superuser. Wherever the owner was —
local `supabase db reset`, the PGlite harness, CI, and most self-hosted
Postgres — the answer was yes for every caller, `app.require_permission()`
returned immediately, and every permission check in the write path was dead
code. Hosted Supabase escaped it only because its `postgres` role happens not
to be a superuser.

**Row level security.** Migration 0008 enabled RLS on all 56 business tables
and wrote every policy `to authenticated`, the browser's role, relying on
grants to give `skyjet_app` its reads. Those do not compose: a table with RLS
enabled denies every row to a role matching no policy, whatever it has been
granted. The application would have read zero rows from every table. No test
saw it because the harness connects as the table owner and no table is
`FORCE`d, so the owner bypasses policies entirely — the suite never evaluated
a single one.

The common cause is not two coding mistakes. It is that the only session ever
used to test authorization was one that authorization did not apply to.

## Decision

**Privilege is a property of the session, not of the current user.**
`app.is_privileged_session()` now tests `session_user`, which is the role the
client authenticated as and is unchanged by both `SET ROLE` and
`SECURITY DEFINER`. It treats a session as privileged when that role is a
superuser **or owns the current database** — ownership because hosted
Supabase's `postgres` is not a superuser, and because an owner can redefine
these functions anyway, so exempting it concedes nothing it does not have.

Ownership is deliberately narrower than "can bypass RLS". `service_role` also
has `rolbypassrls` but is an API credential handed to clients, and must remain
subject to application permissions.

**The exemption can be switched off.** `app.force_unprivileged = 'on'` forces
the answer to false. It can only remove privilege, never grant it, so it is
safe in production. It exists so the suite — which necessarily connects as an
owner — can exercise the enforced path.

**RLS policies name the application role.** Rather than granting `skyjet_app`
`BYPASSRLS`, the policies were extended to include it. The expressions are
built on `app.user_has_entity_access()` and `app.current_user_id()`, and
`withTransaction` already sets that context on every transaction, so the same
expression that scopes the browser scopes the server. Entity isolation becomes
something the database enforces on both paths rather than something the
application is trusted to remember.

**Function search_path is pinned.** A caller-controlled `search_path` on a
`SECURITY DEFINER` function is the standard route to running your own code as
the owner. All 48 routines now fix it at definition time.

## Consequences

Tests that assert an authorization rule must first leave the exemption, using
`app.force_unprivileged` for permission checks and `SET LOCAL ROLE skyjet_app`
for RLS. `tests/sql/110_privilege_enforcement.sql` does both and asserts the
enforced behaviour directly. It does not degrade to a skip when it cannot drop
privilege; it fails, because a security test that quietly stops running is the
failure being guarded against.

Assertions made from a session that is exempt from the control are worth
nothing, however many of them there are. Where the harness cannot leave the
exemption, the check belongs in `scripts/verify-app-role.mjs`, which connects
over the real pooler as the real application role and asserts what it cannot
do. That script is the reason both of these were found at all.

A standing structural check is cheaper than remembering. `app.v_rls_coverage`
now counts policies that apply to the application role, not just policies;
`app.v_function_search_path` reports routines that leave `search_path` open.
The suite asserts both are clean, so the next table or function that misses
either fails immediately rather than in production.

## Alternatives rejected

_Grant `skyjet_app` `BYPASSRLS`._ One word, and it switches the second lock off
for the path carrying all the traffic.

_Keep the superuser test and make the hosted owner a superuser._ Requires
privileges Supabase does not give a project, and would make the bypass wider
everywhere else to fix one environment.

_Drop the privileged bypass entirely._ Migrations, the seed and the harness
genuinely have no application user to act as. The bypass is legitimate; keying
it on the wrong identity was the bug.
