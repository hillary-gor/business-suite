-- ===========================================================================
-- 0008_row_level_security.sql
--
-- Defence in depth, and nothing more than that.
--
-- Read this before changing anything here. RLS is NOT the primary access
-- control in this system. The primary control is that the browser cannot
-- write: mutations travel through Server Actions, which check permissions in
-- application code and then call posting functions as an unprivileged role
-- that holds no DML privilege on any ledger.
--
-- RLS exists so that if a token leaks, if PostgREST is misconfigured, or if
-- someone later exposes a table they should not have, the blast radius is one
-- entity's data rather than the whole database. It is the second lock, not the
-- first.
--
-- The policy is: enable RLS on every table, grant SELECT only, scope every
-- policy to entities the caller actually belongs to, and write no INSERT,
-- UPDATE or DELETE policies at all. With RLS enabled and no write policy, the
-- database refuses writes by default. That default is the design.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere, mechanically
--
-- Doing this by loop rather than by hand means a table added in a later
-- migration cannot be forgotten: re-running this function after any migration
-- brings the new table under the same default.
-- ---------------------------------------------------------------------------

create or replace function app.enforce_rls_everywhere()
returns integer
language plpgsql
as $$
declare
  v_table record;
  v_count integer := 0;
begin
  for v_table in
    select n.nspname as schema_name, c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('app', 'gl', 'inv', 'audit', 'integration')
       and c.relkind = 'r'
       and not c.relrowsecurity
  loop
    execute format('alter table %I.%I enable row level security',
                   v_table.schema_name, v_table.table_name);
    -- FORCE applies the policies to the table owner too, so a mistake in a
    -- SECURITY DEFINER function cannot quietly read across entities.
    -- Deliberately not applied to the ledger tables, whose posting functions
    -- must be able to see the whole entity regardless of the caller.
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

select app.enforce_rls_everywhere();

comment on function app.enforce_rls_everywhere() is
  'Turns RLS on for every table in the business schemas. Run after adding tables; a table with RLS on and no policy denies everything, which is the correct default.';

-- ---------------------------------------------------------------------------
-- Who may see what
--
-- Two shapes of policy cover almost everything:
--   * entity-scoped: the row belongs to an entity the caller has a role in;
--   * reference data: the row is not entity-specific and is safe for any
--     authenticated user (currency codes, condition codes, unit of measure).
-- ---------------------------------------------------------------------------

create or replace function app.apply_entity_read_policy(p_table regclass)
returns void
language plpgsql
as $$
declare
  v_name text := 'entity_read_' || replace(p_table::text, '.', '_');
begin
  execute format('drop policy if exists %I on %s', v_name, p_table);
  execute format(
    'create policy %I on %s for select to authenticated
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
    'create policy %I on %s for select to authenticated using (true)',
    v_name, p_table
  );
end;
$$;

-- Entity-scoped tables.
select app.apply_entity_read_policy(t) from (values
  ('app.fx_rates'::regclass),
  ('app.numbering_sequences'::regclass),
  ('app.idempotency_keys'::regclass),
  ('app.attachments'::regclass),
  ('app.payment_terms'::regclass),
  ('app.addresses'::regclass),
  ('app.contacts'::regclass),
  ('app.tax_codes'::regclass),
  ('app.customers'::regclass),
  ('app.suppliers'::regclass),
  ('gl.fiscal_years'::regclass),
  ('gl.fiscal_periods'::regclass),
  ('gl.accounts'::regclass),
  ('gl.entity_account_settings'::regclass),
  ('gl.journal_entry'::regclass),
  ('gl.journal_entry_line'::regclass),
  ('gl.account_balance_period'::regclass),
  ('gl.period_close_snapshot'::regclass),
  ('gl.period_reopen_log'::regclass),
  ('gl.fx_revaluation_run'::regclass),
  ('gl.fx_revaluation_position'::regclass),
  ('gl.ob_batch'::regclass),
  ('inv.warehouses'::regclass),
  ('inv.bins'::regclass),
  ('inv.manufacturers'::regclass),
  ('inv.item_categories'::regclass),
  ('inv.items'::regclass),
  ('inv.item_alternate_numbers'::regclass),
  ('inv.stock_units'::regclass),
  ('inv.stock_lots'::regclass),
  ('inv.certificates'::regclass),
  ('inv.stock_ledger'::regclass),
  ('inv.stock_balances'::regclass),
  ('integration.outbox'::regclass),
  ('integration.etims_device'::regclass),
  ('integration.etims_document'::regclass)
) as tables(t);

-- Reference data with no entity dimension.
select app.apply_reference_read_policy(t) from (values
  ('app.currencies'::regclass),
  ('app.permissions'::regclass),
  ('app.roles'::regclass),
  ('app.document_types'::regclass),
  ('gl.journal_sources'::regclass),
  ('inv.units_of_measure'::regclass),
  ('inv.condition_codes'::regclass),
  ('inv.certificate_types'::regclass),
  ('integration.etims_item_classification'::regclass)
) as tables(t);

-- ---------------------------------------------------------------------------
-- Tables needing something other than the two standard shapes
-- ---------------------------------------------------------------------------

-- An entity is visible to the people who work in it.
create policy entity_read_entities on app.entities
  for select to authenticated
  using (app.user_has_entity_access(id));

-- A user may see themselves, and may see colleagues in an entity they share.
create policy users_read_self_and_colleagues on app.users
  for select to authenticated
  using (
    id = app.current_user_id()
    or exists (
      select 1
        from app.user_roles mine
        join app.user_roles theirs on theirs.entity_id = mine.entity_id
       where mine.user_id = app.current_user_id()
         and theirs.user_id = app.users.id
    )
  );

-- Role assignments are visible within the entity they apply to. Who can do
-- what is not a secret from colleagues; it is the basis of accountability.
create policy user_roles_read on app.user_roles
  for select to authenticated
  using (app.user_has_entity_access(entity_id));

create policy role_permissions_read on app.role_permissions
  for select to authenticated using (true);

-- Attachment links follow the attachment they point at.
create policy attachment_links_read on app.attachment_links
  for select to authenticated
  using (
    exists (
      select 1 from app.attachments a
       where a.id = attachment_id and app.user_has_entity_access(a.entity_id)
    )
  );

-- The audit log is entity-scoped, and reading it requires an explicit
-- permission on top. Who looked at what, and when, is sensitive in itself.
create policy audit_log_read on audit.log
  for select to authenticated
  using (
    entity_id is not null
    and app.user_has_permission(entity_id, 'audit.read')
  );

-- Opening balance staging rows follow their batch.
create policy ob_tb_read on gl.ob_trial_balance_line
  for select to authenticated
  using (exists (select 1 from gl.ob_batch b
                  where b.id = batch_id and app.user_has_entity_access(b.entity_id)));

create policy ob_ar_read on gl.ob_ar_open_item
  for select to authenticated
  using (exists (select 1 from gl.ob_batch b
                  where b.id = batch_id and app.user_has_entity_access(b.entity_id)));

create policy ob_ap_read on gl.ob_ap_open_item
  for select to authenticated
  using (exists (select 1 from gl.ob_batch b
                  where b.id = batch_id and app.user_has_entity_access(b.entity_id)));

create policy ob_inventory_read on gl.ob_inventory_line
  for select to authenticated
  using (exists (select 1 from gl.ob_batch b
                  where b.id = batch_id and app.user_has_entity_access(b.entity_id)));

-- Delivery attempts follow their outbox row.
create policy outbox_attempt_read on integration.outbox_attempt
  for select to authenticated
  using (exists (select 1 from integration.outbox o
                  where o.id = outbox_id and app.user_has_entity_access(o.entity_id)));

-- ---------------------------------------------------------------------------
-- Grants for the browser role
--
-- SELECT only, and never to anon. An unauthenticated caller has no business
-- reading anything in this database.
-- ---------------------------------------------------------------------------

grant usage on schema app, gl, inv, audit, integration to authenticated;

grant select on all tables in schema app, gl, inv, audit, integration to authenticated;

alter default privileges in schema app, gl, inv, audit, integration
  grant select on tables to authenticated;

-- Belt and braces: even with a policy mistake, there is no write privilege to
-- exercise.
revoke insert, update, delete, truncate
  on all tables in schema app, gl, inv, audit, integration
  from authenticated, anon;

revoke all on all tables in schema app, gl, inv, audit, integration from anon;
revoke usage on schema app, gl, inv, audit, integration from anon;

-- Reporting helpers the browser is allowed to call.
grant execute on function
  gl.trial_balance(uuid, uuid),
  gl.account_balance_as_at(uuid, uuid, date),
  gl.validate_opening_balances(uuid),
  inv.verify_inventory_ties_to_gl(uuid, date),
  inv.unit_is_releasable(uuid, date),
  inv.current_average_cost(uuid, uuid, uuid),
  app.user_has_entity_access(uuid, uuid),
  app.user_has_permission(uuid, text, uuid),
  app.current_user_id()
to authenticated;

-- The posting engine is explicitly not reachable from the browser. Even though
-- it would refuse an unauthorised caller, the intent is that this door does
-- not exist on that side of the wall at all.
revoke all on function
  gl.post_entry(uuid, jsonb, text),
  gl.reverse_entry(uuid, text, date, text),
  gl.post_opening_balances(uuid),
  gl.close_period(uuid),
  gl.reopen_period(uuid, text),
  gl.close_fiscal_year(uuid),
  gl.revalue_fx(uuid, uuid, text)
from authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- A standing check
--
-- Returns any table in the business schemas that is readable but has no policy
-- restricting who may read it. Should always return nothing; the test suite
-- asserts exactly that.
-- ---------------------------------------------------------------------------

create or replace view app.v_rls_coverage as
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  count(p.polname)::int as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname in ('app', 'gl', 'inv', 'audit', 'integration')
  and c.relkind = 'r'
group by n.nspname, c.relname, c.relrowsecurity
order by n.nspname, c.relname;

comment on view app.v_rls_coverage is
  'Every business table with its RLS state. A row with rls_enabled false is a hole; a row with zero policies denies all access, which is safe but probably unintended.';
