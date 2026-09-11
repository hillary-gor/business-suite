/**
 * Application permission catalogue.
 *
 * Pages and server actions import these constants. Do not write role-name
 * checks (`if (role === 'owner')`) and do not invent string literals at call
 * sites — a typo becomes a check against a code that was never seeded.
 *
 * Format: domain.action (gl.post_journal) or domain.resource.action
 * (sales.invoice.create). Identity is hosted Supabase Auth; these codes are
 * what authorise() and the posting engine actually test.
 */
export const Permission = {
  // Sales
  SalesInvoiceCreate: 'sales.invoice.create',
  SalesInvoiceIssue: 'sales.invoice.issue',
  SalesInvoiceVoid: 'sales.invoice.void',
  SalesPaymentCreate: 'sales.payment.create',
  SalesPaymentReverse: 'sales.payment.reverse',

  // Inventory
  InventoryProductCreate: 'inventory.product.create',
  InventoryStockReceive: 'inventory.stock.receive',
  InventoryStockIssue: 'inventory.stock.issue',
  InventoryStockAdjust: 'inventory.stock.adjust',
  InventoryStockTransfer: 'inventory.stock.transfer',

  // Procurement
  ProcurementPurchaseCreate: 'procurement.purchase.create',
  ProcurementPurchaseApprove: 'procurement.purchase.approve',
  ProcurementPurchaseReceive: 'procurement.purchase.receive',

  // Finance / reports / admin (product catalogue)
  FinanceJournalView: 'finance.journal.view',
  FinancePaymentCreate: 'finance.payment.create',
  FinancePaymentReverse: 'finance.payment.reverse',
  FinanceAccountManage: 'finance.account.manage',
  ReportsView: 'reports.view',
  UsersManage: 'users.manage',
  SettingsManage: 'settings.manage',

  // Team. Employee records hold personal data, so reading them is its own
  // permission rather than something masters.read carries.
  TeamEmployeeRead: 'team.employee.read',
  TeamEmployeeManage: 'team.employee.manage',

  // Phase 1 operational codes — more precise than the product names above.
  // The posting engine and existing pages keep these.
  GlRead: 'gl.read',
  GlViewReports: 'gl.view_reports',
  GlViewAccounts: 'gl.view_accounts',
  GlPostJournal: 'gl.post_journal',
  GlReverseJournal: 'gl.reverse_journal',
  GlPostToControlAccount: 'gl.post_to_control_account',
  GlManageAccounts: 'gl.manage_accounts',
  GlManageCalendar: 'gl.manage_calendar',
  GlClosePeriod: 'gl.close_period',
  GlReopenPeriod: 'gl.reopen_period',
  GlCloseYear: 'gl.close_year',
  GlRevalueFx: 'gl.revalue_fx',
  GlImportOpeningBalances: 'gl.import_opening_balances',
  GlPostOpeningBalances: 'gl.post_opening_balances',

  AuditRead: 'audit.read',

  MastersRead: 'masters.read',
  MastersManageCustomers: 'masters.manage_customers',
  MastersManageSuppliers: 'masters.manage_suppliers',
  MastersApproveSupplier: 'masters.approve_supplier',
  MastersManageItems: 'masters.manage_items',
  MastersManageTaxCodes: 'masters.manage_tax_codes',
  MastersReleaseCreditHold: 'masters.release_credit_hold',

  InvRead: 'inv.read',
  InvManageStock: 'inv.manage_stock',
  InvAdjustStock: 'inv.adjust_stock',
  InvScrapStock: 'inv.scrap_stock',
  InvOverrideCost: 'inv.override_cost',
  InvVerifyCertificate: 'inv.verify_certificate',

  IntegrationRead: 'integration.read',
  IntegrationManageEtims: 'integration.manage_etims',

  AdminManageUsers: 'admin.manage_users',
  AdminManageRoles: 'admin.manage_roles',
  AdminManageEntity: 'admin.manage_entity',
} as const;

export type PermissionCode = (typeof Permission)[keyof typeof Permission];
