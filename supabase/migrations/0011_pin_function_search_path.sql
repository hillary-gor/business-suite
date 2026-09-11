-- ---------------------------------------------------------------------------
-- Pin search_path on every function in the business schemas
--
-- Supabase's database linter flags all 48 of them as
-- `function_search_path_mutable`, and on this schema that is not cosmetic.
--
-- Each migration begins with `set search_path = ...`, which applies to the
-- session running the migration. It is not carried into the functions it
-- creates. A function without its own SET clause resolves unqualified names
-- using whatever search_path the *caller* has at the time.
--
-- Nine of these functions are SECURITY DEFINER and run as the schema owner,
-- and gl.post_entry, gl.reverse_entry and inv.post_movement are executable by
-- skyjet_app by design. A caller who can influence name resolution inside a
-- function that runs as the owner is the classic route to executing their own
-- code with the owner's rights. Relation names are the live risk in
-- particular, since pg_temp is searched ahead of the rest of the path for
-- relations and any caller can create objects there.
--
-- The bodies already qualify their references, so today the exposure is
-- latent rather than exploited. That is exactly when it is cheap to close:
-- the next function that gets written with a bare table name inherits the
-- protection instead of quietly reintroducing the hole.
--
-- Attaching the path to each function is done as a catalogue sweep rather
-- than by editing 48 definitions, so this cannot disagree with what is
-- actually deployed. The value matches the search_path the functions were
-- created under, so resolution is unchanged - the difference is that it is now
-- fixed at definition time instead of supplied by the caller.
-- ---------------------------------------------------------------------------

set search_path = pg_catalog, public, extensions;

do $$
declare
  v_fn    record;
  v_count integer := 0;
begin
  for v_fn in
    select n.nspname                                as schema_name,
           p.proname                                as name,
           pg_get_function_identity_arguments(p.oid) as args,
           p.prokind                                as kind
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('app', 'gl', 'inv', 'integration')
       and p.prokind in ('f', 'p')
       -- Skip anything that already carries an explicit setting.
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as c(setting)
          where c.setting like 'search\_path=%'
       )
  loop
    execute format(
      'alter %s %I.%I(%s) set search_path = pg_catalog, public, extensions',
      case v_fn.kind when 'p' then 'procedure' else 'function' end,
      v_fn.schema_name, v_fn.name, v_fn.args
    );
    v_count := v_count + 1;
  end loop;

  raise notice 'pinned search_path on % routines', v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- A view so the standing test can assert this stays true
-- ---------------------------------------------------------------------------

create or replace view app.v_function_search_path as
select
  n.nspname as schema_name,
  p.proname as function_name,
  p.prosecdef as security_definer,
  exists (
    select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as c(setting)
     where c.setting like 'search\_path=%'
  ) as search_path_pinned
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('app', 'gl', 'inv', 'integration')
  and p.prokind in ('f', 'p');

comment on view app.v_function_search_path is
  'Every routine in the business schemas and whether its search_path is fixed at definition time. A false here on a SECURITY DEFINER routine is a privilege escalation waiting to happen.';
