import { Permission, type PermissionCode } from '@/server/auth/permissions';

export type AppNavLink = {
  href: string;
  label: string;
  disabled?: boolean;
};

export type AppNavSection = {
  label: string;
  children: readonly AppNavLink[];
};

export type AppNavItem = AppNavLink | AppNavSection;

export function isNavSection(item: AppNavItem): item is AppNavSection {
  return 'children' in item;
}

export type AppNavGroupId =
  | 'customers'
  | 'sales'
  | 'purchasing'
  | 'inventory'
  | 'accounting'
  | 'team'
  | 'reports'
  | 'compliance';

export type AppNavGroup = {
  id: AppNavGroupId;
  label: string;
  items: readonly AppNavItem[];
};

export type RailId = 'home' | 'apps' | 'reports' | AppNavGroupId;

export function buildNavGroups(allow: (permission: PermissionCode) => boolean): AppNavGroup[] {
  const groups: AppNavGroup[] = [
    {
      id: 'customers',
      label: 'Customer Hub',
      items: [
        { href: '/customers', label: 'Overview' },
        { href: '/sales/customers', label: 'Customers & leads' },
        { href: '/sales/estimates', label: 'Estimates' },
        { href: '/customers/reviews', label: 'Reviews' },
      ],
    },
    {
      id: 'sales',
      label: 'Sales',
      items: [
        { href: '/sales', label: 'Overview' },
        { href: '/sales/transactions', label: 'Sales transactions' },
        { href: '/sales/invoices', label: 'Invoices' },
        { href: '/sales/receipts', label: 'Sales receipts' },
        { href: '/sales/orders', label: 'Orders' },
        { href: '/sales/credit-notes', label: 'Credit notes' },
        { href: '/sales/debit-notes', label: 'Debit notes' },
        { href: '/sales/statements', label: 'Statements' },
        { href: '/sales/refunds', label: 'Refunds' },
      ],
    },
  ];

  const purchasing: AppNavItem[] = [];
  if (
    allow(Permission.FinancePaymentCreate) ||
    allow(Permission.ProcurementPurchaseCreate) ||
    allow(Permission.ProcurementPurchaseReceive)
  ) {
    purchasing.push({ href: '/purchasing/expenses', label: 'Expense transactions' });
  }
  if (allow(Permission.MastersManageSuppliers)) {
    purchasing.push({ href: '/purchasing/vendors', label: 'Suppliers' });
  }
  if (allow(Permission.FinancePaymentCreate)) {
    purchasing.push({ href: '/purchasing/bills', label: 'Bills' });
    purchasing.push({ href: '/purchasing/statements', label: 'Statements' });
  }
  if (purchasing.length > 0) {
    groups.push({ id: 'purchasing', label: 'Expenses & Bills', items: purchasing });
  }

  const inventory: AppNavItem[] = [{ href: '/inventory', label: 'Overview' }];
  if (allow(Permission.ProcurementPurchaseCreate)) {
    inventory.push({ href: '/purchasing/orders', label: 'Purchase orders' });
  }
  if (allow(Permission.ProcurementPurchaseReceive)) {
    inventory.push({ href: '/purchasing/receipts', label: 'Item receipts' });
  }
  if (allow(Permission.MastersManageItems) || allow(Permission.InvRead)) {
    inventory.push({ href: '/inventory/products', label: 'Inventory' });
  }
  if (allow(Permission.InvAdjustStock) || allow(Permission.InvRead)) {
    inventory.push({ href: '/inventory/adjustments', label: 'Adjustments' });
  }
  if (allow(Permission.MastersManageItems)) {
    inventory.push(
      { href: '/inventory/categories', label: 'Categories' },
      { href: '/inventory/warehouses', label: 'Warehouses' },
    );
  }
  if (allow(Permission.InvRead) || allow(Permission.MastersManageItems)) {
    inventory.push({ href: '/inventory/stock', label: 'Stock on hand' });
  }
  if (allow(Permission.InvRead)) {
    inventory.push(
      { href: '/inventory/ledger', label: 'Stock ledger' },
      { href: '/inventory/units', label: 'Serial units' },
    );
  }
  if (
    allow(Permission.MastersManageItems) ||
    allow(Permission.InvRead) ||
    allow(Permission.ProcurementPurchaseCreate) ||
    allow(Permission.ProcurementPurchaseReceive)
  ) {
    groups.push({ id: 'inventory', label: 'Inventory', items: inventory });
  }

  const accounting: AppNavItem[] = [
    { href: '/accounting/accounts', label: 'Chart of accounts' },
    { href: '/accounting/journals', label: 'Journals' },
    { href: '/accounting/trial-balance', label: 'Trial balance' },
    { href: '/accounting/periods', label: 'Periods' },
  ];
  if (allow(Permission.GlImportOpeningBalances)) {
    accounting.push({ href: '/accounting/opening-balances', label: 'Opening balances' });
  }
  groups.push({ id: 'accounting', label: 'Accounting', items: accounting });

  // Employees are people the business employs; users are people who sign in.
  // They sit together because that is where someone looks for either.
  const team: AppNavItem[] = [];
  if (allow(Permission.TeamEmployeeRead)) {
    team.push({ href: '/team/employees', label: 'Employees' });
  }
  if (allow(Permission.UsersManage)) {
    team.push({ href: '/settings/users', label: 'Manage users' });
  }
  if (team.length > 0) {
    groups.push({ id: 'team', label: 'Team', items: team });
  }

  if (allow(Permission.ReportsView) || allow(Permission.GlViewReports)) {
    groups.push({
      id: 'reports',
      label: 'Reports & Analytics',
      items: [
        { href: '/reports', label: 'Standard reports' },
        {
          label: 'Financial Planning',
          children: [{ href: '/reports/cash-flow', label: 'Cash flow overview' }],
        },
        { href: '/reports/performance', label: 'Performance centre' },
        { href: '/reports/custom', label: 'Custom reports' },
        { href: '/reports/management', label: 'Management reports' },
      ],
    });
  }

  groups.push({
    id: 'compliance',
    label: 'Compliance',
    items: [
      allow(Permission.AuditRead)
        ? { href: '/settings/audit', label: 'Audit trail' }
        : { href: '/audit', label: 'Audit trail', disabled: true },
      { href: '/etims', label: 'eTIMS', disabled: true },
    ],
  });

  return groups;
}

export function pathIsActive(pathname: string, href: string): boolean {
  if (href === '/' || href === '/business-suite') {
    return pathname === '/' || pathname === '/business-suite';
  }
  if (pathname === href) return true;
  // New and edit still live under /inventory/items; the catalogue people
  // open is /inventory/products, so both should light the same nav row.
  if (
    href === '/inventory/products' &&
    (pathname === '/inventory/items' || pathname.startsWith('/inventory/items/'))
  ) {
    return true;
  }
  // Standard reports stays current while a report from that catalogue is open.
  if (href === '/reports') {
    if (!pathname.startsWith('/reports/')) return false;
    return (
      pathname !== '/reports/custom' &&
      pathname !== '/reports/management' &&
      pathname !== '/reports/performance' &&
      pathname !== '/reports/cash-flow' &&
      !pathname.startsWith('/reports/custom/') &&
      !pathname.startsWith('/reports/management/') &&
      !pathname.startsWith('/reports/performance/') &&
      !pathname.startsWith('/reports/cash-flow/')
    );
  }
  const depth = href.split('/').filter(Boolean).length;
  if (depth <= 1) return false;
  return pathname.startsWith(`${href}/`);
}

export function navItemIsCurrent(pathname: string, item: AppNavItem): boolean {
  if (isNavSection(item)) {
    return item.children.some((child) => navItemIsCurrent(pathname, child));
  }
  return !item.disabled && pathIsActive(pathname, item.href);
}

export function railFromPath(pathname: string, groups: readonly AppNavGroup[]): RailId {
  if (pathname === '/' || pathname === '/business-suite') return 'home';
  if (pathname === '/customers' || pathname.startsWith('/customers/')) return 'customers';
  if (pathname === '/reports' || pathname.startsWith('/reports/')) return 'reports';
  const match = groups.find((group) =>
    group.items.some((item) => navItemIsCurrent(pathname, item)),
  );
  if (match?.id === 'reports') return 'reports';
  if (match) return match.id;
  return 'apps';
}
