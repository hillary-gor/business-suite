-- ===========================================================================
-- seed.sql
--
-- Baseline configuration for SkyJet Aircraft Spares.
--
-- This is not sample data. Everything here is real configuration the business
-- needs before it can post a single transaction: the chart of accounts, the
-- Kenyan tax codes, the permission catalogue and the roles people are assigned
-- to. It is written to be idempotent so that re-running it is safe.
--
-- Seeds run on `supabase db reset` and in CI. They never run in production;
-- production configuration is applied deliberately and reviewed.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

-- ---------------------------------------------------------------------------
-- Currencies
-- ---------------------------------------------------------------------------

insert into app.currencies (code, name, symbol, minor_units) values
  ('KES', 'Kenyan Shilling',    'KSh', 2),
  ('USD', 'US Dollar',          '$',   2),
  ('EUR', 'Euro',               'EUR', 2),
  ('GBP', 'Pound Sterling',     'GBP', 2),
  ('AED', 'UAE Dirham',         'AED', 2),
  ('ZAR', 'South African Rand', 'R',   2)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Permission catalogue
--
-- These codes are referenced by name in application code and in the posting
-- engine. Renaming one is a breaking change.
-- ---------------------------------------------------------------------------

insert into app.permissions (code, domain, description, is_sensitive) values
  ('gl.read',                   'accounting', 'View the general ledger, trial balance and financial reports', false),
  ('gl.view_reports',           'accounting', 'View financial reports, the trial balance and the ledger', false),
  ('gl.view_accounts',          'accounting', 'View the chart of accounts', false),
  ('gl.post_journal',           'accounting', 'Post a manual journal entry', false),
  ('gl.reverse_journal',        'accounting', 'Reverse a posted journal entry', false),
  ('gl.post_to_control_account','accounting', 'Journal directly against a sub-ledger control account', true),
  ('gl.manage_accounts',        'accounting', 'Create and amend chart of accounts entries', false),
  ('gl.manage_calendar',        'accounting', 'Create fiscal years and open periods', false),
  ('gl.close_period',           'accounting', 'Close an accounting period', false),
  ('gl.reopen_period',          'accounting', 'Reopen a closed accounting period', true),
  ('gl.close_year',             'accounting', 'Close a fiscal year and post the result to retained earnings', true),
  ('gl.revalue_fx',             'accounting', 'Run period-end foreign currency revaluation', false),
  ('gl.import_opening_balances','accounting', 'Stage QuickBooks cutover opening balances', true),
  ('gl.post_opening_balances',  'accounting', 'Post the cutover opening balances', true),

  ('audit.read',                'audit',      'Read the audit trail', true),

  ('masters.read',              'masters',    'View customers, suppliers, parts and tax codes', false),
  ('masters.manage_customers',  'masters',    'Create and amend customers', false),
  ('masters.manage_suppliers',  'masters',    'Create and amend suppliers', false),
  ('masters.approve_supplier',  'masters',    'Approve a supplier for purchasing', true),
  ('masters.manage_items',      'masters',    'Create and amend parts', false),
  ('masters.manage_tax_codes',  'masters',    'Create and amend tax codes', true),
  ('masters.release_credit_hold','masters',   'Release a customer from credit hold', true),

  ('inv.read',                  'inventory',  'View stock, certificates and movements', false),
  ('inv.manage_stock',          'inventory',  'Receive, move, pick and issue stock', false),
  ('inv.adjust_stock',          'inventory',  'Post a stock adjustment outside a business document', true),
  ('inv.scrap_stock',           'inventory',  'Condemn stock and write it off', true),
  ('inv.override_cost',         'inventory',  'Override the system-calculated cost of a movement', true),
  ('inv.verify_certificate',    'inventory',  'Confirm a physical airworthiness certificate against its record', false),

  ('integration.read',          'integration','View eTIMS transmission status', false),
  ('integration.manage_etims',  'integration','Configure the eTIMS device and retry transmissions', true),

  ('admin.manage_users',        'admin',      'Create users and assign roles', true),
  ('admin.manage_roles',        'admin',      'Change what a role may do', true),
  ('admin.manage_entity',       'admin',      'Amend entity configuration and account settings', true),

  ('sales.invoice.create',      'sales',      'Create a sales invoice', false),
  ('sales.invoice.issue',       'sales',      'Issue a sales invoice', false),
  ('sales.invoice.void',        'sales',      'Void a sales invoice', true),
  ('sales.payment.create',      'sales',      'Record a customer receipt', false),
  ('sales.payment.reverse',     'sales',      'Reverse a customer receipt', true),

  ('inventory.product.create',  'inventory',  'Create a stock item', false),
  ('inventory.stock.receive',   'inventory',  'Receive stock into a warehouse', false),
  ('inventory.stock.issue',     'inventory',  'Issue stock from a warehouse', false),
  ('inventory.stock.adjust',    'inventory',  'Adjust stock outside a business document', true),
  ('inventory.stock.transfer',  'inventory',  'Transfer stock between warehouses or bins', false),

  ('procurement.purchase.create','procurement','Create a purchase order', false),
  ('procurement.purchase.approve','procurement','Approve a purchase order', true),
  ('procurement.purchase.receive','procurement','Receive against a purchase order', false),

  ('finance.journal.view',      'finance',    'View journal entries', false),
  ('finance.payment.create',    'finance',    'Record a finance payment', false),
  ('finance.payment.reverse',   'finance',    'Reverse a finance payment', true),
  ('finance.account.manage',    'finance',    'Create and amend chart of accounts entries', false),

  ('reports.view',              'reports',    'View operational and financial reports', false),
  ('users.manage',              'admin',      'Create users and assign roles', true),
  ('settings.manage',           'admin',      'Amend entity configuration and system settings', true),

  ('library.document.read',               'library', 'View internal library documents and download files', false),
  ('library.document.read_confidential',  'library', 'Read confidential library documents', true),
  ('library.document.read_restricted',    'library', 'Read restricted library documents', true),
  ('library.document.upload',             'library', 'Upload library documents', false),
  ('library.document.manage',             'library', 'Edit, archive or delete library documents', true),
  ('library.access.read',                 'library', 'Read who opened or downloaded library documents, and when', true)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Roles
--
-- Product roles: owner, super_admin, manager, accountant, sales, inventory,
-- procurement, viewer. warehouse_operator is kept as a tighter split of
-- inventory (receive and issue, not adjust or scrap).
--
-- Owner and super_admin hold every permission by construction. Neither uses
-- app.users.is_superuser — that flag bypasses the catalogue and is not how
-- these roles work.
-- ---------------------------------------------------------------------------

insert into app.roles (code, name, description, is_system) values
  ('owner',               'Owner',
   'Entity owner. Holds every permission through the catalogue, not a bypass flag.', true),
  ('super_admin',         'Super Admin',
   'Delegated full access. Holds every permission through the catalogue, not app.users.is_superuser.', true),
  ('manager',             'Manager',
   'Runs the books and operations: period close, year end, revaluation, and approvals. Cannot manage users.', true),
  ('accountant',          'Accountant',
   'Day-to-day accounting. Posts journals and closes periods but cannot reopen them or manage users.', true),
  ('inventory',           'Inventory',
   'Full stock control including adjustments, transfers and scrapping.', true),
  ('warehouse_operator',  'Warehouse Operator',
   'Receives, moves and picks stock. Cannot adjust quantities or write stock off.', true),
  ('sales',               'Sales',
   'Customer-facing. Creates invoices and receipts, maintains customers, sees stock.', true),
  ('procurement',         'Procurement',
   'Supplier-facing. Creates and receives purchases; maintains suppliers.', true),
  ('viewer',              'Viewer',
   'Reads reports, journals and the audit trail. Changes nothing.', true)
on conflict (code) do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, p.code
  from app.roles r cross join app.permissions p
 where r.code in ('owner', 'super_admin')
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values
    ('gl.read'), ('gl.view_reports'), ('gl.view_accounts'),
    ('gl.post_journal'), ('gl.reverse_journal'), ('gl.post_to_control_account'),
    ('gl.manage_accounts'), ('gl.manage_calendar'), ('gl.close_period'), ('gl.reopen_period'),
    ('gl.close_year'), ('gl.revalue_fx'), ('gl.import_opening_balances'), ('gl.post_opening_balances'),
    ('audit.read'), ('masters.read'), ('masters.manage_tax_codes'),
    ('masters.release_credit_hold'), ('masters.approve_supplier'),
    ('inv.read'), ('inv.override_cost'), ('integration.read'), ('integration.manage_etims'),
    ('reports.view'), ('finance.journal.view'), ('finance.payment.create'),
    ('finance.payment.reverse'), ('finance.account.manage'),
    ('sales.invoice.create'), ('sales.invoice.issue'), ('sales.invoice.void'),
    ('sales.payment.create'), ('sales.payment.reverse'),
    ('procurement.purchase.approve')
  ) as x(code) on true
 where r.code = 'manager'
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values
    ('gl.read'), ('gl.view_reports'), ('gl.view_accounts'),
    ('gl.post_journal'), ('gl.reverse_journal'), ('gl.manage_accounts'),
    ('gl.close_period'), ('gl.revalue_fx'), ('masters.read'), ('inv.read'), ('integration.read'),
    ('reports.view'), ('finance.journal.view'), ('finance.payment.create'),
    ('finance.payment.reverse'), ('finance.account.manage')
  ) as x(code) on true
 where r.code = 'accountant'
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values
    ('inv.read'), ('inv.manage_stock'), ('inv.adjust_stock'), ('inv.scrap_stock'),
    ('inv.verify_certificate'), ('masters.read'), ('masters.manage_items'),
    ('inventory.product.create'), ('inventory.stock.receive'),
    ('inventory.stock.issue'), ('inventory.stock.adjust'), ('inventory.stock.transfer')
  ) as x(code) on true
 where r.code = 'inventory'
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values
    ('inv.read'), ('inv.manage_stock'), ('inv.verify_certificate'), ('masters.read'),
    ('inventory.stock.receive'), ('inventory.stock.issue'), ('inventory.stock.transfer')
  ) as x(code) on true
 where r.code = 'warehouse_operator'
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values
    ('masters.read'), ('masters.manage_customers'), ('inv.read'),
    ('sales.invoice.create'), ('sales.invoice.issue'), ('sales.invoice.void'),
    ('sales.payment.create'), ('sales.payment.reverse')
  ) as x(code) on true
 where r.code = 'sales'
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values
    ('masters.read'), ('masters.manage_suppliers'), ('inv.read'),
    ('procurement.purchase.create'), ('procurement.purchase.approve'),
    ('procurement.purchase.receive')
  ) as x(code) on true
 where r.code = 'procurement'
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values
    ('gl.read'), ('gl.view_reports'), ('gl.view_accounts'),
    ('audit.read'), ('masters.read'), ('inv.read'), ('integration.read'),
    ('reports.view'), ('finance.journal.view')
  ) as x(code) on true
 where r.code = 'viewer'
on conflict do nothing;

-- Skyjet Library uses the same roles. Clearance is the permission, not a
-- second directory. Migrations that grant these codes run before seed creates
-- the product roles, so the grants have to live here as well.
insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values
    ('library.document.read'),
    ('library.document.upload'),
    ('library.document.manage'),
    ('library.document.read_confidential'),
    ('library.document.read_restricted'),
    ('library.access.read')
  ) as x(code) on true
 where r.code = 'manager'
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values
    ('library.document.read'),
    ('library.document.upload'),
    ('library.document.manage'),
    ('library.document.read_confidential')
  ) as x(code) on true
 where r.code = 'inventory'
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, x.code
  from app.roles r
  join (values
    ('library.document.read'),
    ('library.document.read_confidential')
  ) as x(code) on true
 where r.code in ('accountant', 'procurement')
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, 'library.document.read'
  from app.roles r
 where r.code in ('viewer', 'sales', 'warehouse_operator')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- The entity
-- ---------------------------------------------------------------------------

insert into app.entities (
  id, code, legal_name, trading_name, country_code, base_currency_code,
  fiscal_year_start_month, timezone, city
)
values (
  '10000000-0000-0000-0000-000000000001',
  'SKYJET',
  'SkyJet Aircraft Spares Limited',
  'SkyJet Aircraft Spares',
  'KE', 'KES', 1, 'Africa/Nairobi', 'Nairobi'
)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Chart of accounts
--
-- Structured for an aircraft parts distributor. The distinctions that earn
-- their place here are the ones this business actually reports on: freight and
-- duty are separated from the cost of the part because landed cost is a
-- managed number; certification and approval costs are their own line because
-- they are a condition of trading; and exchange differences are split between
-- realised and unrealised because only one of them is cash.
-- ---------------------------------------------------------------------------

with entity as (
  select id from app.entities where code = 'SKYJET'
),
definitions(code, name, account_type, normal_balance, parent_code, is_postable,
            control_type, currency_code, is_monetary, is_contra, is_reconcilable,
            requires_customer, requires_supplier) as (values
  -- Assets --------------------------------------------------------------
  ('1000', 'Current Assets',                    'ASSET', 'DEBIT', null,   false, null, null, false, false, false, false, false),
  ('1010', 'Cash and Bank',                     'ASSET', 'DEBIT', '1000', false, null, null, false, false, false, false, false),
  ('1011', 'Petty Cash',                        'ASSET', 'DEBIT', '1010', true,  'CASH', 'KES', true,  false, true,  false, false),
  ('1015', 'Bank - KES Current Account',        'ASSET', 'DEBIT', '1010', true,  'BANK', 'KES', true,  false, true,  false, false),
  ('1016', 'Bank - USD Account',                'ASSET', 'DEBIT', '1010', true,  'BANK', 'USD', true,  false, true,  false, false),
  ('1017', 'Mobile Money',                      'ASSET', 'DEBIT', '1010', true,  'CASH', 'KES', true,  false, true,  false, false),

  ('1100', 'Receivables',                       'ASSET', 'DEBIT', '1000', false, null, null, false, false, false, false, false),
  ('1110', 'Trade Receivables',                 'ASSET', 'DEBIT', '1100', true,  'ACCOUNTS_RECEIVABLE', null, true, false, false, true, false),
  ('1120', 'Other Receivables',                 'ASSET', 'DEBIT', '1100', true,  null, null, true,  false, false, false, false),
  ('1190', 'Allowance for Doubtful Debts',      'ASSET', 'CREDIT','1100', true,  null, null, false, true,  false, false, false),

  ('1200', 'Inventory',                         'ASSET', 'DEBIT', '1000', false, null, null, false, false, false, false, false),
  ('1210', 'Inventory - Aircraft Parts',        'ASSET', 'DEBIT', '1200', true,  'INVENTORY', null, false, false, false, false, false),
  ('1230', 'Inventory in Transit',              'ASSET', 'DEBIT', '1200', true,  null, null, false, false, false, false, false),
  ('1240', 'Parts Out for Repair or Overhaul',  'ASSET', 'DEBIT', '1200', true,  null, null, false, false, false, false, false),

  ('1300', 'Prepayments and Deposits',          'ASSET', 'DEBIT', '1000', false, null, null, false, false, false, false, false),
  ('1310', 'Prepaid Expenses',                  'ASSET', 'DEBIT', '1300', true,  null, null, false, false, false, false, false),
  ('1320', 'Advances to Suppliers',             'ASSET', 'DEBIT', '1300', true,  null, null, true,  false, false, false, true),
  ('1330', 'Imports in Progress',               'ASSET', 'DEBIT', '1300', true,  null, null, false, false, false, false, false),

  ('1400', 'Tax Assets',                        'ASSET', 'DEBIT', '1000', false, null, null, false, false, false, false, false),
  ('1410', 'VAT Input',                         'ASSET', 'DEBIT', '1400', true,  'TAX_INPUT', null, false, false, false, false, false),
  ('1420', 'Withholding Tax Recoverable',       'ASSET', 'DEBIT', '1400', true,  null, null, false, false, false, false, false),

  ('1500', 'Non-current Assets',                'ASSET', 'DEBIT', null,   false, null, null, false, false, false, false, false),
  ('1510', 'Motor Vehicles',                    'ASSET', 'DEBIT', '1500', true,  null, null, false, false, false, false, false),
  ('1520', 'Warehouse and Office Equipment',    'ASSET', 'DEBIT', '1500', true,  null, null, false, false, false, false, false),
  ('1530', 'Computer Equipment',                'ASSET', 'DEBIT', '1500', true,  null, null, false, false, false, false, false),
  ('1590', 'Accumulated Depreciation',          'ASSET', 'CREDIT','1500', true,  null, null, false, true,  false, false, false),

  -- Liabilities ---------------------------------------------------------
  ('2000', 'Current Liabilities',               'LIABILITY', 'CREDIT', null,   false, null, null, false, false, false, false, false),
  ('2010', 'Trade Payables',                    'LIABILITY', 'CREDIT', '2000', true,  'ACCOUNTS_PAYABLE', null, true, false, false, false, true),
  ('2020', 'Goods Received Not Invoiced',       'LIABILITY', 'CREDIT', '2000', true,  'GOODS_RECEIVED_NOT_INVOICED', null, false, false, false, false, false),
  ('2030', 'Accrued Expenses',                  'LIABILITY', 'CREDIT', '2000', true,  null, null, false, false, false, false, false),
  ('2040', 'Customer Deposits and Advances',    'LIABILITY', 'CREDIT', '2000', true,  null, null, true,  false, false, true,  false),

  ('2100', 'Tax Liabilities',                   'LIABILITY', 'CREDIT', null,   false, null, null, false, false, false, false, false),
  ('2110', 'VAT Output',                        'LIABILITY', 'CREDIT', '2100', true,  'TAX_OUTPUT', null, false, false, false, false, false),
  ('2120', 'VAT Payable',                       'LIABILITY', 'CREDIT', '2100', true,  null, null, false, false, true,  false, false),
  ('2130', 'PAYE Payable',                      'LIABILITY', 'CREDIT', '2100', true,  null, null, false, false, false, false, false),
  ('2140', 'Statutory Deductions Payable',      'LIABILITY', 'CREDIT', '2100', true,  null, null, false, false, false, false, false),
  ('2150', 'Withholding Tax Payable',           'LIABILITY', 'CREDIT', '2100', true,  null, null, false, false, false, false, false),
  ('2160', 'Corporation Tax Payable',           'LIABILITY', 'CREDIT', '2100', true,  null, null, false, false, false, false, false),

  ('2200', 'Borrowings',                        'LIABILITY', 'CREDIT', null,   false, null, null, false, false, false, false, false),
  ('2210', 'Bank Overdraft',                    'LIABILITY', 'CREDIT', '2200', true,  null, 'KES', true,  false, true,  false, false),
  ('2220', 'Loans Payable',                     'LIABILITY', 'CREDIT', '2200', true,  null, null, true,  false, false, false, false),

  -- Equity --------------------------------------------------------------
  ('3000', 'Equity',                            'EQUITY', 'CREDIT', null,   false, null, null, false, false, false, false, false),
  ('3010', 'Share Capital',                     'EQUITY', 'CREDIT', '3000', true,  null, null, false, false, false, false, false),
  ('3020', 'Retained Earnings',                 'EQUITY', 'CREDIT', '3000', true,  'RETAINED_EARNINGS', null, false, false, false, false, false),
  ('3040', 'Shareholder Current Account',       'EQUITY', 'CREDIT', '3000', true,  null, null, false, false, false, false, false),
  ('3090', 'Opening Balance Suspense',          'EQUITY', 'CREDIT', '3000', true,  'SUSPENSE', null, false, false, false, false, false),

  -- Revenue -------------------------------------------------------------
  ('4000', 'Revenue',                           'REVENUE', 'CREDIT', null,   false, null, null, false, false, false, false, false),
  ('4010', 'Parts Sales - New',                 'REVENUE', 'CREDIT', '4000', true,  null, null, false, false, false, false, false),
  ('4020', 'Parts Sales - Serviceable',         'REVENUE', 'CREDIT', '4000', true,  null, null, false, false, false, false, false),
  ('4030', 'Exchange and Repair Income',        'REVENUE', 'CREDIT', '4000', true,  null, null, false, false, false, false, false),
  ('4040', 'Freight Recharged to Customers',    'REVENUE', 'CREDIT', '4000', true,  null, null, false, false, false, false, false),
  ('4050', 'Sales Returns and Allowances',      'REVENUE', 'DEBIT',  '4000', true,  null, null, false, true,  false, false, false),
  ('4060', 'Sales Discounts',                   'REVENUE', 'DEBIT',  '4000', true,  null, null, false, true,  false, false, false),

  ('4900', 'Other Income',                      'REVENUE', 'CREDIT', null,   false, null, null, false, false, false, false, false),
  ('4910', 'Realised Exchange Gain',            'REVENUE', 'CREDIT', '4900', true,  null, null, false, false, false, false, false),
  ('4920', 'Unrealised Exchange Gain',          'REVENUE', 'CREDIT', '4900', true,  null, null, false, false, false, false, false),
  ('4930', 'Rounding Differences',              'REVENUE', 'CREDIT', '4900', true,  'ROUNDING', null, false, false, false, false, false),
  ('4990', 'Sundry Income',                     'REVENUE', 'CREDIT', '4900', true,  null, null, false, false, false, false, false),

  -- Cost of sales -------------------------------------------------------
  ('5000', 'Cost of Sales',                     'EXPENSE', 'DEBIT', null,   false, null, null, false, false, false, false, false),
  ('5010', 'Cost of Parts Sold',                'EXPENSE', 'DEBIT', '5000', true,  null, null, false, false, false, false, false),
  ('5020', 'Freight Inwards',                   'EXPENSE', 'DEBIT', '5000', true,  null, null, false, false, false, false, false),
  ('5030', 'Import Duty and Clearing',          'EXPENSE', 'DEBIT', '5000', true,  null, null, false, false, false, false, false),
  ('5040', 'Cost of Repair and Overhaul',       'EXPENSE', 'DEBIT', '5000', true,  null, null, false, false, false, false, false),
  ('5050', 'Inventory Adjustments',             'EXPENSE', 'DEBIT', '5000', true,  null, null, false, false, false, false, false),
  ('5060', 'Inventory Write-off and Obsolescence','EXPENSE','DEBIT','5000', true,  null, null, false, false, false, false, false),

  -- Operating expenses --------------------------------------------------
  ('6000', 'Operating Expenses',                'EXPENSE', 'DEBIT', null,   false, null, null, false, false, false, false, false),
  ('6010', 'Salaries and Wages',                'EXPENSE', 'DEBIT', '6000', true,  null, null, false, false, false, false, false),
  ('6020', 'Staff Costs and Benefits',          'EXPENSE', 'DEBIT', '6000', true,  null, null, false, false, false, false, false),
  ('6030', 'Staff Training and Certification',  'EXPENSE', 'DEBIT', '6000', true,  null, null, false, false, false, false, false),

  ('6100', 'Premises',                          'EXPENSE', 'DEBIT', '6000', false, null, null, false, false, false, false, false),
  ('6110', 'Rent',                              'EXPENSE', 'DEBIT', '6100', true,  null, null, false, false, false, false, false),
  ('6120', 'Utilities',                         'EXPENSE', 'DEBIT', '6100', true,  null, null, false, false, false, false, false),
  ('6130', 'Warehouse Supplies and Packaging',  'EXPENSE', 'DEBIT', '6100', true,  null, null, false, false, false, false, false),
  ('6140', 'Security',                          'EXPENSE', 'DEBIT', '6100', true,  null, null, false, false, false, false, false),

  ('6200', 'Selling and Distribution',          'EXPENSE', 'DEBIT', '6000', false, null, null, false, false, false, false, false),
  ('6210', 'Freight Outwards',                  'EXPENSE', 'DEBIT', '6200', true,  null, null, false, false, false, false, false),
  ('6220', 'Marketing and Advertising',         'EXPENSE', 'DEBIT', '6200', true,  null, null, false, false, false, false, false),
  ('6230', 'Travel and Accommodation',          'EXPENSE', 'DEBIT', '6200', true,  null, null, false, false, false, false, false),

  ('6300', 'Administration',                    'EXPENSE', 'DEBIT', '6000', false, null, null, false, false, false, false, false),
  ('6310', 'Professional and Audit Fees',       'EXPENSE', 'DEBIT', '6300', true,  null, null, false, false, false, false, false),
  ('6320', 'Insurance',                         'EXPENSE', 'DEBIT', '6300', true,  null, null, false, false, false, false, false),
  ('6330', 'Licences, Approvals and Compliance','EXPENSE', 'DEBIT', '6300', true,  null, null, false, false, false, false, false),
  ('6340', 'IT and Software Subscriptions',     'EXPENSE', 'DEBIT', '6300', true,  null, null, false, false, false, false, false),
  ('6350', 'Telephone and Internet',            'EXPENSE', 'DEBIT', '6300', true,  null, null, false, false, false, false, false),
  ('6360', 'Bank Charges',                      'EXPENSE', 'DEBIT', '6300', true,  null, null, false, false, false, false, false),
  ('6370', 'Office Supplies',                   'EXPENSE', 'DEBIT', '6300', true,  null, null, false, false, false, false, false),
  ('6380', 'Bad Debts Written Off',             'EXPENSE', 'DEBIT', '6300', true,  null, null, false, false, false, false, false),

  ('6400', 'Depreciation',                      'EXPENSE', 'DEBIT', '6000', true,  null, null, false, false, false, false, false),

  ('6500', 'Finance Costs',                     'EXPENSE', 'DEBIT', null,   false, null, null, false, false, false, false, false),
  ('6510', 'Interest Expense',                  'EXPENSE', 'DEBIT', '6500', true,  null, null, false, false, false, false, false),
  ('6520', 'Realised Exchange Loss',            'EXPENSE', 'DEBIT', '6500', true,  null, null, false, false, false, false, false),
  ('6530', 'Unrealised Exchange Loss',          'EXPENSE', 'DEBIT', '6500', true,  null, null, false, false, false, false, false)
)
insert into gl.accounts (
  entity_id, code, name, account_type, normal_balance, is_postable, is_system,
  control_type, currency_code, is_monetary, is_contra, is_reconcilable,
  requires_customer, requires_supplier, sort_key
)
select
  e.id, d.code, d.name, d.account_type::gl.account_type, d.normal_balance::gl.balance_side,
  d.is_postable, true,
  d.control_type::gl.control_type, d.currency_code::char(3),
  d.is_monetary, d.is_contra, d.is_reconcilable,
  d.requires_customer, d.requires_supplier, d.code
from definitions d cross join entity e
on conflict (entity_id, code) do nothing;

-- Wire up the hierarchy in a second pass, now that every account exists.
update gl.accounts child
   set parent_id = parent.id
  from gl.accounts parent, app.entities e
 where e.code = 'SKYJET'
   and child.entity_id = e.id
   and parent.entity_id = e.id
   and child.parent_id is null
   and parent.code = case
     when child.code in ('1011','1015','1016','1017')                     then '1010'
     when child.code in ('1110','1120','1190')                            then '1100'
     when child.code in ('1210','1230','1240')                            then '1200'
     when child.code in ('1310','1320','1330')                            then '1300'
     when child.code in ('1410','1420')                                   then '1400'
     when child.code in ('1010','1100','1200','1300','1400')              then '1000'
     when child.code in ('1510','1520','1530','1590')                     then '1500'
     when child.code in ('2010','2020','2030','2040')                     then '2000'
     when child.code in ('2110','2120','2130','2140','2150','2160')       then '2100'
     when child.code in ('2210','2220')                                   then '2200'
     when child.code in ('3010','3020','3040','3090')                     then '3000'
     when child.code in ('4010','4020','4030','4040','4050','4060')       then '4000'
     when child.code in ('4910','4920','4930','4990')                     then '4900'
     when child.code in ('5010','5020','5030','5040','5050','5060')       then '5000'
     when child.code in ('6110','6120','6130','6140')                     then '6100'
     when child.code in ('6210','6220','6230')                            then '6200'
     when child.code in ('6310','6320','6330','6340','6350','6360','6370','6380') then '6300'
     when child.code in ('6010','6020','6030','6100','6200','6300','6400') then '6000'
     when child.code in ('6510','6520','6530')                            then '6500'
   end;

-- ---------------------------------------------------------------------------
-- Named account slots
--
-- The posting engine resolves accounts through these names, never through
-- hard-coded codes, so the chart of accounts can be reorganised without
-- touching a single function.
-- ---------------------------------------------------------------------------

insert into gl.entity_account_settings (entity_id, setting_code, account_id)
select e.id, s.setting_code, a.id
  from app.entities e
  join (values
    ('ROUNDING',                    '4930'),
    ('RETAINED_EARNINGS',           '3020'),
    ('FX_REALISED_GAIN',            '4910'),
    ('FX_REALISED_LOSS',            '6520'),
    ('FX_UNREALISED_GAIN',          '4920'),
    ('FX_UNREALISED_LOSS',          '6530'),
    ('OPENING_BALANCE_SUSPENSE',    '3090'),
    ('GOODS_RECEIVED_NOT_INVOICED', '2020'),
    ('INVENTORY_IN_TRANSIT',        '1230'),
    ('INVENTORY_ADJUSTMENT',        '5050'),
    ('INVENTORY_WRITE_OFF',         '5060'),
    ('DEFAULT_INVENTORY',           '1210'),
    ('DEFAULT_COGS',                '5010'),
    ('DEFAULT_REVENUE',             '4010'),
    ('VAT_OUTPUT',                  '2110'),
    ('VAT_INPUT',                   '1410'),
    ('BAD_DEBT_EXPENSE',            '6380'),
    ('FREIGHT_INWARDS',             '5020'),
    ('IMPORT_DUTY',                 '5030')
  ) as s(setting_code, account_code) on true
  join gl.accounts a on a.entity_id = e.id and a.code = s.account_code
 where e.code = 'SKYJET'
on conflict (entity_id, setting_code) do update set account_id = excluded.account_id;

-- ---------------------------------------------------------------------------
-- Kenyan tax codes
--
-- The eTIMS letter matters more than the rate. A zero-rated export and an
-- exempt supply are both 0 percent and are not interchangeable: input tax is
-- recoverable on the first and not on the second.
-- ---------------------------------------------------------------------------

insert into app.tax_codes (
  entity_id, code, name, kind, rate, is_recoverable, etims_tax_code,
  output_tax_account_id, input_tax_account_id, is_default_sales, is_default_purchase
)
select
  e.id, t.code, t.name, t.kind::app.tax_kind, t.rate, t.is_recoverable, t.etims,
  out_acct.id, in_acct.id, t.default_sales, t.default_purchase
from app.entities e
join (values
  ('VAT16',  'VAT Standard Rate 16%',      'STANDARD',       0.16, true,  'B', true,  true),
  ('VAT8',   'VAT Reduced Rate 8%',        'STANDARD',       0.08, true,  'E', false, false),
  ('VAT0',   'VAT Zero Rated (Export)',    'ZERO_RATED',     0.00, true,  'C', false, false),
  ('EXEMPT', 'VAT Exempt',                 'EXEMPT',         0.00, false, 'A', false, false),
  ('NONVAT', 'Not Subject to VAT',         'NON_VAT',        0.00, false, 'D', false, false),
  ('RC16',   'Reverse Charge VAT 16%',     'REVERSE_CHARGE', 0.16, true,  'B', false, false),
  ('WHT5',   'Withholding Tax 5%',         'WITHHOLDING',    0.05, false, null, false, false)
) as t(code, name, kind, rate, is_recoverable, etims, default_sales, default_purchase) on true
left join gl.accounts out_acct on out_acct.entity_id = e.id and out_acct.code = '2110'
left join gl.accounts in_acct  on in_acct.entity_id  = e.id and in_acct.code  = '1410'
where e.code = 'SKYJET'
on conflict (entity_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- Payment terms
-- ---------------------------------------------------------------------------

insert into app.payment_terms (entity_id, code, name, days_net, is_end_of_month)
select e.id, t.code, t.name, t.days, t.eom
from app.entities e
join (values
  ('COD',    'Cash on Delivery',          0,  false),
  ('PREPAY', 'Payment in Advance',        0,  false),
  ('NET7',   'Net 7 Days',                7,  false),
  ('NET14',  'Net 14 Days',               14, false),
  ('NET30',  'Net 30 Days',               30, false),
  ('NET45',  'Net 45 Days',               45, false),
  ('NET60',  'Net 60 Days',               60, false),
  ('EOM30',  'Net 30 Days End of Month',  30, true)
) as t(code, name, days, eom) on true
where e.code = 'SKYJET'
on conflict (entity_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- Warehouses and bins
-- ---------------------------------------------------------------------------

insert into inv.warehouses (entity_id, code, name, inventory_account_id)
select e.id, w.code, w.name, a.id
from app.entities e
join (values
  ('MAIN', 'Main Store - Nairobi'),
  ('AOG',  'AOG Fast-Moving Store'),
  ('QUAR', 'Quarantine Store')
) as w(code, name) on true
join gl.accounts a on a.entity_id = e.id and a.code = '1210'
where e.code = 'SKYJET'
on conflict (entity_id, code) do nothing;

insert into inv.bins (entity_id, warehouse_id, code, name, bin_type)
select w.entity_id, w.id, b.code, b.name, b.bin_type::inv.bin_type
from inv.warehouses w
join (values
  ('MAIN', 'Main Bin',          'STOCK'),
  ('GOODSIN', 'Goods Inwards',  'GOODS_IN'),
  ('QC',   'Awaiting Inspection','QUARANTINE'),
  ('PICK', 'Pick Face',         'PICK_FACE'),
  ('PACK', 'Packing Bench',     'PACKING'),
  ('DESP', 'Despatch',          'DESPATCH'),
  ('SCRAP','Scrap Cage',        'SCRAP')
) as b(code, name, bin_type) on true
where w.entity_id = (select id from app.entities where code = 'SKYJET')
on conflict (warehouse_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- Item categories, by ATA chapter
--
-- ATA 100 is the grouping the industry already uses. Adopting it means
-- reports, enquiries and supplier catalogues line up without translation.
-- ---------------------------------------------------------------------------

insert into inv.item_categories (
  entity_id, code, name, ata_chapter, inventory_account_id, cogs_account_id, revenue_account_id
)
select e.id, c.code, c.name, c.ata, inv_a.id, cogs_a.id, rev_a.id
from app.entities e
join (values
  ('ATA21', 'Air Conditioning and Pressurisation', '21'),
  ('ATA23', 'Communications',                      '23'),
  ('ATA24', 'Electrical Power',                    '24'),
  ('ATA25', 'Equipment and Furnishings',           '25'),
  ('ATA26', 'Fire Protection',                     '26'),
  ('ATA27', 'Flight Controls',                     '27'),
  ('ATA28', 'Fuel',                                '28'),
  ('ATA29', 'Hydraulic Power',                     '29'),
  ('ATA30', 'Ice and Rain Protection',             '30'),
  ('ATA32', 'Landing Gear',                        '32'),
  ('ATA34', 'Navigation',                          '34'),
  ('ATA35', 'Oxygen',                              '35'),
  ('ATA49', 'Auxiliary Power Unit',                '49'),
  ('ATA52', 'Doors',                               '52'),
  ('ATA57', 'Wings',                               '57'),
  ('ATA71', 'Power Plant',                         '71'),
  ('ATA72', 'Engine',                              '72'),
  ('ATA79', 'Engine Oil',                          '79'),
  ('CONSUM','Consumables and Hardware',            null),
  ('TOOLS', 'Tooling and Ground Equipment',        null)
) as c(code, name, ata) on true
join gl.accounts inv_a  on inv_a.entity_id  = e.id and inv_a.code  = '1210'
join gl.accounts cogs_a on cogs_a.entity_id = e.id and cogs_a.code = '5010'
join gl.accounts rev_a  on rev_a.entity_id  = e.id and rev_a.code  = '4010'
where e.code = 'SKYJET'
on conflict (entity_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- eTIMS classification samples
--
-- The real list is several thousand rows and is pulled from KRA's code lookup
-- endpoint. These few exist so the fiscalisation checks have something to
-- resolve against before that integration is built.
-- ---------------------------------------------------------------------------

insert into integration.etims_item_classification (code, name, tax_type, major_group) values
  ('25171500', 'Aircraft parts and accessories',       'B', 'Aerospace'),
  ('25171501', 'Aircraft landing gear and components', 'B', 'Aerospace'),
  ('25171502', 'Aircraft hydraulic components',        'B', 'Aerospace'),
  ('25171503', 'Aircraft electrical components',       'B', 'Aerospace'),
  ('25171504', 'Aircraft avionics and instruments',    'B', 'Aerospace'),
  ('25172500', 'Aircraft engines and engine parts',    'B', 'Aerospace'),
  ('31161500', 'Fasteners and hardware',               'B', 'Hardware'),
  ('73152100', 'Repair and overhaul services',         'B', 'Services')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Fiscal calendar
--
-- The current year, with every elapsed period opened so that historical
-- entries can be made during implementation, plus next year created ahead so
-- the calendar never runs out mid-transaction.
-- ---------------------------------------------------------------------------

do $$
declare
  v_entity uuid;
  v_start  date := date_trunc('year', current_date)::date;
begin
  select id into v_entity from app.entities where code = 'SKYJET';

  if not exists (select 1 from gl.fiscal_years where entity_id = v_entity) then
    perform gl.create_fiscal_year(v_entity, v_start);
    perform gl.create_fiscal_year(v_entity, (v_start + interval '1 year')::date);

    update gl.fiscal_periods
       set status = 'OPEN'
     where entity_id = v_entity
       and status = 'FUTURE'
       and start_date <= current_date;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Local development login
--
-- The application connects as an unprivileged role that holds no DML privilege
-- on any ledger. In production that login is created out of band and its
-- password lives in a secret store. This block exists only so that a developer
-- running `supabase db reset` gets a working DATABASE_URL.
--
-- The sentinels below are not decoration. Everything between them is stripped
-- by `scripts/apply-sql.mjs --exclude-local`, which is how this file is
-- applied to a hosted database. Without that, seeding a hosted project would
-- create a login whose password is published in version control. Keep any
-- future local-only fixture inside a marked region.
-- ---------------------------------------------------------------------------

-- @local-only:begin
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'skyjet_app_local') then
    create role skyjet_app_local login password 'skyjet_app_local_password';
  end if;
  grant skyjet_app to skyjet_app_local;
exception
  when insufficient_privilege or feature_not_supported then
    raise notice 'Could not create the local application login; continuing without it.';
end;
$$;
-- @local-only:end
