-- ===========================================================================
-- Align application RBAC with the product catalogue.
--
-- Identity stays on hosted Supabase Auth. Authorisation is still application
-- permissions, not role-name checks and not app.users.is_superuser.
--
-- This migration:
--   1. Allows domain.resource.action codes (sales.invoice.create) as well as
--      the original domain.action codes (gl.post_journal).
--   2. Adds the product permission catalogue and the Phase 1 aliases the UI
--      was already asking for (those codes were never seeded, so a real user
--      was denied the dashboard).
--   3. Renames roles in place so existing user_roles rows stay valid:
--        administrator        → owner
--        financial_controller → manager
--        warehouse_manager    → inventory
--        purchasing           → procurement
--        auditor              → viewer
--      and introduces super_admin as a role that holds every permission.
--   warehouse_operator is kept: it is a tighter split of inventory (receive
--   and issue, not adjust or scrap) and the SoD tests depend on it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Permission codes: two or three dotted segments
-- ---------------------------------------------------------------------------

alter table app.permissions
  drop constraint permissions_code_check;

alter table app.permissions
  add constraint permissions_code_check
  check (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,2}$');

comment on table app.permissions is
  'Static permission catalogue, seeded by the codebase. Format: domain.action (gl.post_journal) or domain.resource.action (sales.invoice.create).';

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

insert into app.permissions (code, domain, description, is_sensitive) values
  -- Phase 1 aliases the application already checks
  ('gl.view_reports',            'accounting',  'View financial reports, the trial balance and the ledger', false),
  ('gl.view_accounts',           'accounting',  'View the chart of accounts', false),
  ('gl.import_opening_balances', 'accounting',  'Stage QuickBooks cutover opening balances', true),

  -- Product catalogue
  ('sales.invoice.create',       'sales',       'Create a sales invoice', false),
  ('sales.invoice.issue',        'sales',       'Issue a sales invoice', false),
  ('sales.invoice.void',         'sales',       'Void a sales invoice', true),
  ('sales.payment.create',       'sales',       'Record a customer receipt', false),
  ('sales.payment.reverse',      'sales',       'Reverse a customer receipt', true),

  ('inventory.product.create',   'inventory',   'Create a stock item', false),
  ('inventory.stock.receive',    'inventory',   'Receive stock into a warehouse', false),
  ('inventory.stock.issue',      'inventory',   'Issue stock from a warehouse', false),
  ('inventory.stock.adjust',     'inventory',   'Adjust stock outside a business document', true),
  ('inventory.stock.transfer',   'inventory',   'Transfer stock between warehouses or bins', false),

  ('procurement.purchase.create','procurement', 'Create a purchase order', false),
  ('procurement.purchase.approve','procurement','Approve a purchase order', true),
  ('procurement.purchase.receive','procurement','Receive against a purchase order', false),

  ('finance.journal.view',       'finance',     'View journal entries', false),
  ('finance.payment.create',     'finance',     'Record a finance payment', false),
  ('finance.payment.reverse',    'finance',     'Reverse a finance payment', true),
  ('finance.account.manage',     'finance',     'Create and amend chart of accounts entries', false),

  ('reports.view',               'reports',     'View operational and financial reports', false),
  ('users.manage',               'admin',       'Create users and assign roles', true),
  ('settings.manage',            'admin',       'Amend entity configuration and system settings', true)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Roles: rename in place so user_roles foreign keys stay valid
-- ---------------------------------------------------------------------------

update app.roles
   set code = 'owner',
       name = 'Owner',
       description = 'Entity owner. Holds every permission through the catalogue, not a bypass flag.'
 where code = 'administrator';

update app.roles
   set code = 'manager',
       name = 'Manager',
       description = 'Runs the books and operations: period close, year end, revaluation, and approvals. Cannot manage users.'
 where code = 'financial_controller';

update app.roles
   set code = 'inventory',
       name = 'Inventory',
       description = 'Full stock control including adjustments, transfers and scrapping.'
 where code = 'warehouse_manager';

update app.roles
   set code = 'procurement',
       name = 'Procurement',
       description = 'Supplier-facing. Creates and receives purchases; maintains suppliers.'
 where code = 'purchasing';

update app.roles
   set code = 'viewer',
       name = 'Viewer',
       description = 'Reads reports, journals and the audit trail. Changes nothing.'
 where code = 'auditor';

update app.roles
   set description = 'Day-to-day accounting. Posts journals and closes periods but cannot reopen them or manage users.'
 where code = 'accountant';

update app.roles
   set description = 'Customer-facing. Creates invoices and receipts, maintains customers, sees stock.'
 where code = 'sales';

insert into app.roles (code, name, description, is_system) values
  ('super_admin', 'Super Admin',
   'Delegated full access. Holds every permission through the catalogue, not app.users.is_superuser.',
   true)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Owner and super_admin hold every permission, by construction
-- ---------------------------------------------------------------------------

insert into app.role_permissions (role_id, permission_code)
select r.id, p.code
  from app.roles r
  cross join app.permissions p
 where r.code in ('owner', 'super_admin')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Map existing grants onto the new names so roles do not lose access
-- ---------------------------------------------------------------------------

insert into app.role_permissions (role_id, permission_code)
select distinct rp.role_id, mapped.perm
  from app.role_permissions rp
  join (values
    ('gl.read',                    'reports.view'),
    ('gl.read',                    'finance.journal.view'),
    ('gl.read',                    'gl.view_reports'),
    ('gl.read',                    'gl.view_accounts'),
    ('gl.post_opening_balances',   'gl.import_opening_balances'),
    ('gl.manage_accounts',         'finance.account.manage'),
    ('admin.manage_users',         'users.manage'),
    ('admin.manage_entity',        'settings.manage'),
    ('masters.manage_items',       'inventory.product.create'),
    ('inv.manage_stock',           'inventory.stock.receive'),
    ('inv.manage_stock',           'inventory.stock.issue'),
    ('inv.manage_stock',           'inventory.stock.transfer'),
    ('inv.adjust_stock',           'inventory.stock.adjust')
  ) as mapped(existing, perm) on mapped.existing = rp.permission_code
  join app.permissions p on p.code = mapped.perm
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Module grants that have no older equivalent
-- ---------------------------------------------------------------------------

insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values
    ('finance.payment.create'),
    ('finance.payment.reverse'),
    ('procurement.purchase.approve')
  ) as x(code) on true
 where r.code = 'manager'
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values
    ('finance.payment.create'),
    ('finance.payment.reverse')
  ) as x(code) on true
 where r.code = 'accountant'
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values
    ('sales.invoice.create'),
    ('sales.invoice.issue'),
    ('sales.invoice.void'),
    ('sales.payment.create'),
    ('sales.payment.reverse')
  ) as x(code) on true
 where r.code in ('sales', 'manager')
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values
    ('procurement.purchase.create'),
    ('procurement.purchase.receive')
  ) as x(code) on true
 where r.code = 'procurement'
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values
    ('procurement.purchase.approve')
  ) as x(code) on true
 where r.code = 'procurement'
on conflict do nothing;
