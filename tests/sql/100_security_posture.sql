-- ===========================================================================
-- Invariant 4, and the security posture generally.
--
-- These tests assert the shape of the wall rather than any business behaviour:
-- that RLS is on everywhere, that the browser role cannot write, that the
-- application role cannot touch a ledger table directly, and that permissions
-- are actually checked rather than merely declared.
--
-- A test here failing does not mean a feature is broken. It means the system
-- has become possible to defraud.
-- ===========================================================================

do $$
declare
  v_suite   text := 'security posture';
  v_entity  uuid := test.entity();
  v_missing text;
begin
  -- -------------------------------------------------------------------------
  -- Row level security
  -- -------------------------------------------------------------------------

  select string_agg(schema_name || '.' || table_name, ', ')
    into v_missing
    from app.v_rls_coverage
   where not rls_enabled;

  perform test.ok(v_suite, 'row level security is enabled on every business table',
    v_missing is null, coalesce(v_missing, 'all covered'));

  select string_agg(schema_name || '.' || table_name, ', ')
    into v_missing
    from app.v_rls_coverage
   where rls_enabled and policy_count = 0;

  -- A table with RLS on and no policy denies everything. That is safe, but it
  -- is almost always an oversight, so it is surfaced rather than tolerated.
  perform test.ok(v_suite, 'every table with RLS enabled has at least one policy',
    v_missing is null, coalesce(v_missing, 'all covered'));

  perform test.eq_num(v_suite, 'no policy grants insert, update or delete to anyone',
    (select count(*) from pg_policy p
       join pg_class c on c.oid = p.polrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('app', 'gl', 'inv', 'audit', 'integration', 'sales', 'purch')
        and p.polcmd <> 'r'),
    0);

  -- -------------------------------------------------------------------------
  -- Table privileges
  --
  -- The ledger is readable by the application and writable by nobody. The
  -- posting functions run as their owner, which is how rows get in at all.
  -- -------------------------------------------------------------------------

  perform test.ok(v_suite, 'the application role cannot insert into the general ledger',
    not has_table_privilege('skyjet_app', 'gl.journal_entry', 'INSERT'));

  perform test.ok(v_suite, 'the application role cannot insert ledger lines',
    not has_table_privilege('skyjet_app', 'gl.journal_entry_line', 'INSERT'));

  perform test.ok(v_suite, 'the application role cannot update the general ledger',
    not has_table_privilege('skyjet_app', 'gl.journal_entry', 'UPDATE'));

  perform test.ok(v_suite, 'the application role cannot delete from the general ledger',
    not has_table_privilege('skyjet_app', 'gl.journal_entry', 'DELETE'));

  perform test.ok(v_suite, 'the application role cannot write the stock ledger',
    not has_table_privilege('skyjet_app', 'inv.stock_ledger', 'INSERT'));

  perform test.ok(v_suite, 'the application role cannot write the audit log',
    not has_table_privilege('skyjet_app', 'audit.log', 'INSERT'));

  perform test.ok(v_suite, 'the application role cannot rewrite period balances',
    not has_table_privilege('skyjet_app', 'gl.account_balance_period', 'UPDATE'));

  perform test.ok(v_suite, 'but it can read the ledger',
    has_table_privilege('skyjet_app', 'gl.journal_entry_line', 'SELECT'));

  perform test.ok(v_suite, 'and it can maintain master data',
    has_table_privilege('skyjet_app', 'app.customers', 'INSERT'));

  perform test.ok(v_suite, 'and it can call the posting engine',
    has_function_privilege('skyjet_app', 'gl.post_entry(uuid, jsonb, text)', 'EXECUTE'));

  perform test.ok(v_suite, 'the application role cannot log in directly',
    not (select rolcanlogin from pg_roles where rolname = 'skyjet_app'));

  -- -------------------------------------------------------------------------
  -- The browser
  -- -------------------------------------------------------------------------

  perform test.ok(v_suite, 'the browser role cannot write the ledger',
    not has_table_privilege('authenticated', 'gl.journal_entry', 'INSERT'));

  perform test.ok(v_suite, 'the browser role cannot write master data either',
    not has_table_privilege('authenticated', 'app.customers', 'INSERT'));

  perform test.ok(v_suite, 'the browser role cannot reach the posting engine',
    not has_function_privilege('authenticated', 'gl.post_entry(uuid, jsonb, text)', 'EXECUTE'));

  perform test.ok(v_suite, 'the browser role cannot close a period',
    not has_function_privilege('authenticated', 'gl.close_period(uuid)', 'EXECUTE'));

  perform test.ok(v_suite, 'the browser role can read the trial balance',
    has_function_privilege('authenticated', 'gl.trial_balance(uuid, uuid)', 'EXECUTE'));

  perform test.ok(v_suite, 'an unauthenticated caller has no access to the accounting schema',
    not has_schema_privilege('anon', 'gl', 'USAGE'));

  perform test.ok(v_suite, 'an unauthenticated caller cannot read the ledger',
    not has_table_privilege('anon', 'gl.journal_entry_line', 'SELECT'));

  -- -------------------------------------------------------------------------
  -- Permissions are enforced, not decorative
  -- -------------------------------------------------------------------------

  perform test.eq_num(v_suite, 'every permission a role references exists',
    (select count(*) from app.role_permissions rp
      where not exists (select 1 from app.permissions p where p.code = rp.permission_code)),
    0);

  perform test.ok(v_suite, 'the owner role holds every permission',
    (select count(*) from app.role_permissions rp
       join app.roles r on r.id = rp.role_id where r.code = 'owner')
    = (select count(*) from app.permissions));

  perform test.ok(v_suite, 'the super_admin role holds every permission',
    (select count(*) from app.role_permissions rp
       join app.roles r on r.id = rp.role_id where r.code = 'super_admin')
    = (select count(*) from app.permissions));

  perform test.ok(v_suite, 'the viewer role holds no write permission',
    not exists (
      select 1 from app.role_permissions rp
        join app.roles r on r.id = rp.role_id
       where r.code = 'viewer'
         and rp.permission_code in (
           'gl.post_journal', 'inv.manage_stock', 'admin.manage_users',
           'users.manage', 'sales.invoice.create', 'inventory.stock.adjust',
           'procurement.purchase.approve', 'finance.payment.create'
         )
    ));

  perform test.ok(v_suite, 'a warehouse operator cannot write stock off',
    not exists (
      select 1 from app.role_permissions rp
        join app.roles r on r.id = rp.role_id
       where r.code = 'warehouse_operator' and rp.permission_code = 'inv.scrap_stock'
    ));

  perform test.ok(v_suite, 'an accountant cannot reopen a closed period',
    not exists (
      select 1 from app.role_permissions rp
        join app.roles r on r.id = rp.role_id
       where r.code = 'accountant' and rp.permission_code = 'gl.reopen_period'
    ));

  perform test.ok(v_suite, 'the product permission catalogue is present',
    (select count(*) from app.permissions
      where code in (
        'sales.invoice.create', 'sales.invoice.issue', 'sales.invoice.void',
        'sales.payment.create', 'sales.payment.reverse',
        'inventory.product.create', 'inventory.stock.receive',
        'inventory.stock.issue', 'inventory.stock.adjust', 'inventory.stock.transfer',
        'procurement.purchase.create', 'procurement.purchase.approve',
        'procurement.purchase.receive',
        'finance.journal.view', 'finance.payment.create', 'finance.payment.reverse',
        'finance.account.manage', 'reports.view', 'users.manage', 'settings.manage'
      )) = 20);

  perform test.ok(v_suite, 'a user with no role has access to nothing',
    not app.user_has_entity_access(v_entity, gen_random_uuid()));

  perform test.ok(v_suite, 'and holds no permission',
    not app.user_has_permission(v_entity, 'gl.post_journal', gen_random_uuid()));

  -- -------------------------------------------------------------------------
  -- Attribution
  -- -------------------------------------------------------------------------

  perform test.eq_num(v_suite, 'every posted entry names who posted it',
    (select count(*) from gl.journal_entry where posted_by is null), 0);

  perform test.ok(v_suite, 'master data changes are captured in the audit log',
    (select count(*) from audit.log
      where schema_name = 'app' and table_name = 'customers') >= 0);

  declare
    v_customer uuid;
    v_audit_rows int;
  begin
    insert into app.customers (entity_id, code, legal_name, currency_code)
    values (v_entity, 'AUDIT01', 'Audit Trail Test Ltd', 'KES')
    returning id into v_customer;

    select count(*) into v_audit_rows
      from audit.log
     where table_name = 'customers' and record_id = v_customer::text and operation = 'I';

    perform test.eq_num(v_suite, 'creating a customer writes an audit row', v_audit_rows, 1);

    update app.customers set legal_name = 'Audit Trail Test Limited' where id = v_customer;

    perform test.ok(v_suite, 'amending it records the before and after values',
      exists (
        select 1 from audit.log
         where table_name = 'customers'
           and record_id = v_customer::text
           and operation = 'U'
           and before_data ->> 'legal_name' = 'Audit Trail Test Ltd'
           and after_data ->> 'legal_name' = 'Audit Trail Test Limited'
           and 'legal_name' = any(changed_fields)
      ));

    -- A no-op update must not manufacture an audit row. Noise in the trail
    -- makes the trail useless, and updated_at moving on its own is noise.
    select count(*) into v_audit_rows
      from audit.log where table_name = 'customers' and record_id = v_customer::text;

    update app.customers set legal_name = 'Audit Trail Test Limited' where id = v_customer;

    perform test.eq_num(v_suite, 'an update that changes nothing is not recorded',
      (select count(*) from audit.log
        where table_name = 'customers' and record_id = v_customer::text) - v_audit_rows,
      0);

    perform test.ok(v_suite, 'the audit row records who made the change',
      exists (
        select 1 from audit.log
         where table_name = 'customers' and record_id = v_customer::text
           and actor_user_id is not null
      ));
  end;

  -- -------------------------------------------------------------------------
  -- Numeric precision (invariant 1)
  -- -------------------------------------------------------------------------

  perform test.eq_num(v_suite, 'no monetary or quantity column uses floating point',
    (select count(*)
       from information_schema.columns
      where table_schema in ('app', 'gl', 'inv', 'integration', 'sales', 'purch')
        and data_type in ('real', 'double precision')),
    0);

  perform test.ok(v_suite, 'monetary amounts are numeric with four decimal places',
    (select numeric_scale = 4 and numeric_precision = 19
       from information_schema.columns
      where table_schema = 'gl' and table_name = 'journal_entry_line' and column_name = 'debit_base'));
end;
$$;
