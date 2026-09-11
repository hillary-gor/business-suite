/**
 * Recipients and copy for in-app feedback.
 *
 * Give feedback opens a dialog on the current screen and emails the developers.
 * There is no in-app mailbox.
 */
export const DEFAULT_FEEDBACK_RECIPIENTS = [
  'khilary4600@gmail.com',
  'surgeinnovationsltd@gmail.com',
] as const;

export const FEEDBACK_TOPICS = [
  { id: 'bug', label: 'Something is broken' },
  { id: 'missing_feature', label: 'A feature is missing' },
  { id: 'other', label: 'Something else' },
] as const;

export const FEEDBACK_SCOPES = [
  { id: 'this_page', label: 'This page' },
  { id: 'something_else', label: 'Something else' },
] as const;

export type FeedbackTopicId = (typeof FEEDBACK_TOPICS)[number]['id'];
export type FeedbackScopeId = (typeof FEEDBACK_SCOPES)[number]['id'];

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f-]{4,}$/i;

const PAGE_TITLES: Record<string, string> = {
  '/': 'Home',
  '/customers': 'Customer Hub',
  '/customers/reviews': 'Reviews',
  '/customers/contracts': 'Contracts',
  '/customers/opportunities': 'Opportunities',
  '/customers/projects': 'Projects',
  '/customers/surveys': 'Surveys',
  '/sales': 'Sales',
  '/sales/customers': 'Customers & leads',
  '/sales/customers/new': 'New customer',
  '/sales/transactions': 'Sales transactions',
  '/sales/invoices': 'Invoices',
  '/sales/invoices/new': 'New invoice',
  '/sales/receipts': 'Sales receipts',
  '/sales/receipts/new': 'New sales receipt',
  '/sales/orders': 'Orders',
  '/sales/orders/new': 'New order',
  '/sales/credit-notes': 'Credit notes',
  '/sales/credit-notes/new': 'New credit note',
  '/sales/debit-notes': 'Debit notes',
  '/sales/debit-notes/new': 'New debit note',
  '/sales/statements': 'Statements',
  '/sales/refunds': 'Refunds',
  '/sales/refunds/new': 'New refund',
  '/sales/payments/new': 'Receive payment',
  '/sales/estimates': 'Estimates',
  '/sales/estimates/new': 'New estimate',
  '/purchasing': 'Expenses & Bills',
  '/purchasing/expenses': 'Expense transactions',
  '/purchasing/expenses/new': 'New expense',
  '/purchasing/vendors': 'Suppliers',
  '/purchasing/vendors/new': 'New supplier',
  '/purchasing/bills': 'Bills',
  '/purchasing/bills/new': 'New bill',
  '/purchasing/statements': 'Supplier statements',
  '/purchasing/orders': 'Purchase orders',
  '/purchasing/orders/new': 'New purchase order',
  '/purchasing/receipts': 'Item receipts',
  '/purchasing/receipts/new': 'New item receipt',
  '/purchasing/payments/new': 'Pay bill',
  '/purchasing/credits/new': 'New supplier credit',
  '/inventory': 'Inventory',
  '/inventory/products': 'Inventory',
  '/inventory/items': 'Inventory',
  '/inventory/items/new': 'New item',
  '/inventory/adjustments': 'Adjustments',
  '/inventory/adjustments/new': 'New adjustment',
  '/inventory/transfers/new': 'New transfer',
  '/inventory/categories': 'Categories',
  '/inventory/warehouses': 'Warehouses',
  '/inventory/stock': 'Stock on hand',
  '/inventory/ledger': 'Stock ledger',
  '/inventory/units': 'Serial units',
  '/inventory/manufacturers': 'Manufacturers',
  '/accounting/accounts': 'Chart of accounts',
  '/accounting/journals': 'Journals',
  '/accounting/journals/new': 'New journal',
  '/accounting/trial-balance': 'Trial balance',
  '/accounting/periods': 'Periods',
  '/accounting/opening-balances': 'Opening balances',
  '/accounting/ledger': 'Account ledger',
  '/team/employees': 'Employees',
  '/team/employees/new': 'New employee',
  '/reports': 'Standard reports',
  '/reports/cash-flow': 'Cash flow overview',
  '/reports/performance': 'Performance centre',
  '/reports/custom': 'Custom reports',
  '/reports/management': 'Management reports',
  '/reports/sales-by-product': 'Sales by product',
  '/reports/profit-and-loss': 'Profit and loss',
  '/reports/balance-sheet': 'Balance sheet',
  '/reports/aged-receivables': 'Aged receivables',
  '/settings/company': 'Company details',
  '/settings/additional': 'Additional settings',
  '/settings/users': 'Manage users',
  '/settings/sales': 'Sales settings',
  '/settings/lists': 'Lists',
  '/settings/form-styles': 'Form styles',
  '/settings/reports': 'Report settings',
  '/settings/billing': 'Billing',
  '/settings/privacy': 'Privacy',
  '/settings/audit': 'Audit log',
  '/settings/feedback': 'Give feedback',
};

export function mergeFeedbackRecipients(
  ...groups: Array<string | readonly string[] | null | undefined>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    const values = typeof group === 'string' ? group.split(/[,;]/) : (group ?? []);
    for (const raw of values) {
      const email = raw.trim().toLowerCase();
      if (!EMAIL_LIKE.test(email) || seen.has(email)) continue;
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}

export function feedbackTopicLabel(id: string): string {
  return FEEDBACK_TOPICS.find((topic) => topic.id === id)?.label ?? 'Feedback';
}

export function feedbackScopeLabel(id: string): string {
  return FEEDBACK_SCOPES.find((scope) => scope.id === id)?.label ?? 'This page';
}

export function safeFeedbackPage(value: string | undefined): string {
  if (!value) return '';
  try {
    const decoded = decodeURIComponent(value).trim();
    return /^\/[A-Za-z0-9/_-]*$/.test(decoded) ? decoded : '';
  } catch {
    return '';
  }
}

function humanize(segment: string): string {
  return segment.replace(/-/g, ' ').replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/** The screen name we show in the dialog and put on the email. */
export function feedbackPageTitle(pathname: string): string {
  const path = (pathname.split('?')[0] ?? pathname).replace(/\/+$/, '') || '/';
  if (PAGE_TITLES[path]) return PAGE_TITLES[path];

  const parts = path.split('/').filter(Boolean);
  while (parts.length > 0) {
    const last = parts[parts.length - 1] ?? '';
    if (last === 'edit' || last === 'pdf' || ID_SEGMENT.test(last)) {
      parts.pop();
      const parent = `/${parts.join('/')}`;
      if (PAGE_TITLES[parent]) return PAGE_TITLES[parent];
      continue;
    }
    break;
  }

  const trimmed = `/${parts.join('/')}` || '/';
  if (PAGE_TITLES[trimmed]) return PAGE_TITLES[trimmed];

  const prefixes = Object.keys(PAGE_TITLES).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (prefix !== '/' && (path === prefix || path.startsWith(`${prefix}/`))) {
      return PAGE_TITLES[prefix] ?? 'this page';
    }
  }

  return humanize(parts[parts.length - 1] ?? 'this page');
}
