/**
 * Standard Reports catalogue.
 *
 * Names and groupings follow the Standard Reports home. Help text is what the
 * "?" control shows. A report is either runnable from SkyJet books, a dedicated
 * existing page, or listed with an honest empty state when the books have no
 * source for it (payroll, projects, bank reconciliation, tags).
 */

export const STANDARD_REPORTS_HREF = '/reports';

export type ReportDateMode = 'range' | 'asOf' | 'none';

/** Which cash/accrual figures this report actually computes. Default is accrual. */
export type ReportAccountingMethod = 'accrual' | 'cash' | 'both';

export type StandardReport = {
  id: string;
  title: string;
  help: string;
  href: string;
  dateMode: ReportDateMode;
  accountingMethod?: ReportAccountingMethod;
  defaultFavourite?: boolean;
  unavailable?: boolean;
};

export type StandardReportSection = {
  id: string;
  title: string;
  intro?: string;
  badge?: string;
  reports: readonly StandardReport[];
};

function report(
  id: string,
  title: string,
  help: string,
  options: {
    href?: string;
    dateMode?: ReportDateMode;
    accountingMethod?: ReportAccountingMethod;
    defaultFavourite?: boolean;
    unavailable?: boolean;
  } = {},
): StandardReport {
  return {
    id,
    title,
    help,
    href: options.href ?? `/reports/${id}`,
    dateMode: options.dateMode ?? 'range',
    accountingMethod: options.accountingMethod ?? 'accrual',
    defaultFavourite: options.defaultFavourite,
    unavailable: options.unavailable,
  };
}

export const STANDARD_REPORT_SECTIONS: readonly StandardReportSection[] = [
  {
    id: 'custom-builder',
    title: 'Custom report builder',
    intro: 'Saved layouts and operational status reports built from the same books.',
    reports: [
      report(
        'revenue-recognition',
        'Revenue Recognition Report (Beta)',
        'Would show recognised versus deferred revenue. SkyJet posts sales when an invoice is issued, so there is no deferred-revenue schedule to report.',
        { unavailable: true },
      ),
      report(
        'inventory-status',
        'Inventory Status',
        'Quantity on hand, on purchase order and on sales order for every stocked item, so you can see what is available to sell.',
        { dateMode: 'none' },
      ),
      report(
        'bill-approval-status',
        'Bill Approval Status',
        'Bills grouped by draft, posted and outstanding so you can see what still needs paying.',
        { dateMode: 'none' },
      ),
      report(
        'item-profitability-by-customer',
        'Product/Item Profitability by Customer',
        'Sales amount, cost of sales and margin for each product sold to each customer in the period.',
      ),
      report(
        'invoice-approval-status',
        'Invoice Approval Status',
        'Invoices grouped by draft, issued and voided so you can see what is still waiting to go out.',
        { dateMode: 'none' },
      ),
    ],
  },
  {
    id: 'business-overview',
    title: 'Business overview',
    reports: [
      report(
        'audit-log',
        'Audit Log',
        'Inserts, updates and deletes on audited tables in this company, with who made the change and when.',
        { dateMode: 'none' },
      ),
      report(
        'balance-sheet',
        'Balance Sheet',
        'Assets, liabilities and equity as at the report date. The books balance when assets equal liabilities plus equity.',
        { dateMode: 'asOf', defaultFavourite: true },
      ),
      report(
        'balance-sheet-comparison',
        'Balance Sheet Comparison',
        'This date’s balance sheet beside the same date last year, so you can see how the position moved.',
        { dateMode: 'asOf' },
      ),
      report(
        'balance-sheet-detail',
        'Balance Sheet Detail',
        'Balance sheet accounts with every posting that built the closing balance in the period.',
        { dateMode: 'asOf' },
      ),
      report(
        'balance-sheet-summary',
        'Balance Sheet Summary',
        'Totals only for assets, liabilities and equity — the same statement without the individual accounts.',
        { dateMode: 'asOf' },
      ),
      report(
        'statement-of-cash-flows',
        'Statement of Cash Flows',
        'Cash in and cash out for the period, grouped by operating receipts, supplier payments and other bank movements.',
        { accountingMethod: 'cash' },
      ),
      report(
        'business-snapshot',
        'Business Snapshot',
        'A one-page view of income, expenses, receivables, payables and stock as at the report date.',
        { dateMode: 'asOf' },
      ),
      report(
        'statement-of-changes-in-equity',
        'Statement of Changes in Equity',
        'Opening equity, profit for the period and closing equity. SkyJet does not post drawings or capital injections as separate equity movements yet.',
      ),
      report(
        'profit-and-loss',
        'Profit and Loss',
        'Income, cost of sales, gross profit, operating expenses and net earnings for the period.',
        { defaultFavourite: true },
      ),
      report(
        'profit-and-loss-by-customer',
        'Profit and Loss by Customer',
        'Issued invoice income grouped by customer for the period. Cost of sales follows invoiced stock where it was posted.',
      ),
      report(
        'profit-and-loss-by-month',
        'Profit and Loss by Month',
        'The same profit and loss figures split into a column for each month in the period.',
      ),
      report(
        'profit-and-loss-by-tag',
        'Profit and Loss by Tag Group',
        'Would split profit and loss by class or tag. SkyJet does not store tags on journals yet.',
        { unavailable: true },
      ),
      report(
        'profit-and-loss-comparison',
        'Profit and Loss Comparison',
        'This period beside the same dates last year, account by account.',
      ),
      report(
        'profit-and-loss-detail',
        'Profit and Loss Detail',
        'Profit and loss with every journal line that posted to an income or expense account in the period.',
      ),
      report(
        'profit-and-loss-pct-income',
        'Profit and Loss as % of total income',
        'Each income and expense line as a percentage of total income for the period.',
      ),
      report(
        'profit-and-loss-ytd-comparison',
        'Profit and Loss year-to-date comparison',
        'Year-to-date profit and loss beside the same year-to-date window last year.',
      ),
      report(
        'quarterly-profit-and-loss',
        'Quarterly Profit and Loss Summary',
        'Profit and loss totals for each quarter that overlaps the selected year.',
      ),
    ],
  },
  {
    id: 'who-owes-you',
    title: 'Who owes you',
    reports: [
      report(
        'aged-receivables-summary',
        'Accounts receivable ageing summary',
        'What each customer still owes, split into current, 1–30, 31–60, 61–90 and 90+ days past due.',
        { dateMode: 'asOf', defaultFavourite: true },
      ),
      report(
        'aged-receivables',
        'Accounts receivable ageing detail',
        'Each open invoice, how old it is, and how much is still outstanding.',
        { dateMode: 'asOf' },
      ),
      report(
        'collections-report',
        'Collections Report',
        'Overdue invoices only — the list a collections call is made from.',
        { dateMode: 'asOf' },
      ),
      report(
        'customer-balance-summary',
        'Customer Balance Summary',
        'One line per customer: invoiced, received and still outstanding.',
        { dateMode: 'asOf' },
      ),
      report(
        'invoices-and-payments',
        'Invoices and Received Payments',
        'Issued invoices in the period with the receipts that have been applied to them.',
      ),
      report(
        'open-invoices',
        'Open Invoices',
        'Issued invoices that still have a balance, regardless of whether they are due yet.',
        { dateMode: 'asOf' },
      ),
      report(
        'statement-list',
        'Statement List',
        'Customers with an outstanding balance, ready to send a statement.',
        { dateMode: 'asOf' },
      ),
      report(
        'terms-list',
        'Terms List',
        'Payment terms on the books, with net days and any early-settlement discount.',
        { dateMode: 'none' },
      ),
    ],
  },
  {
    id: 'sales-and-customers',
    title: 'Sales and customers',
    reports: [
      report(
        'cashflow-payment-transactions',
        'Cashflow Payment Transactions',
        'Customer receipts posted in the period — cash that actually came in.',
        { accountingMethod: 'cash' },
      ),
      report(
        'sales-by-customer-type',
        'Sales by Customer Type Detail',
        'Issued invoice totals grouped by customer type (airline, MRO, broker and so on).',
      ),
      report(
        'customer-contact-list',
        'Customer Contact List',
        'Name, email, phone and billing address for every active customer.',
        { dateMode: 'none' },
      ),
      report(
        'income-by-customer',
        'Income by Customer Summary',
        'Issued invoice totals by customer for the period.',
      ),
      report(
        'customer-phone-list',
        'Customer Phone List',
        'Customer names and phone numbers only — the list you print for the warehouse desk.',
        { dateMode: 'none' },
      ),
      report(
        'sales-by-customer-summary',
        'Sales by Customer Summary',
        'Quantity and amount sold to each customer in the period.',
      ),
      report(
        'sales-by-customer-detail',
        'Sales by Customer Detail',
        'Each invoiced line, grouped by customer.',
      ),
      report(
        'deposit-detail',
        'Deposit Detail',
        'Posted customer receipts, with the invoices they were applied to.',
      ),
      report(
        'estimates-by-customer',
        'Estimates by Customer',
        'Quotations in the period, grouped by customer and status.',
      ),
      report(
        'product-service-list',
        'Product/Service List',
        'The item catalogue: part number, type, price, cost and whether the item is active.',
        { dateMode: 'none' },
      ),
      report(
        'sales-by-product',
        'Sales by Product/Service Summary',
        'Quantity, amount, cost of sales and margin by product for the period.',
        { href: '/reports/sales-by-product', accountingMethod: 'both' },
      ),
      report(
        'sales-by-product-detail',
        'Sales by Product/Service Detail',
        'Each invoiced product line in the period, with quantity, amount and cost of sales.',
      ),
      report(
        'payment-method-list',
        'Payment Method List',
        'Bank and cash accounts used to receive customer payments.',
        { dateMode: 'none' },
      ),
      report(
        'time-by-customer',
        'Time Activities by Customer Detail',
        'Would show time billed to customers. SkyJet does not keep timesheets.',
        { unavailable: true },
      ),
      report(
        'transaction-list-by-customer',
        'Transaction List by Customer',
        'Invoices, receipts, credit notes and refunds for each customer in the period.',
      ),
      report(
        'transaction-list-by-tag',
        'Transaction List by Tag Group',
        'Would group sales transactions by tag. SkyJet does not store tags on documents yet.',
        { unavailable: true },
      ),
    ],
  },
  {
    id: 'customers',
    title: 'Customers',
    reports: [
      report(
        'customer-balance-summary',
        'Customer Balance Summary',
        'One line per customer: invoiced, received and still outstanding.',
        { dateMode: 'asOf' },
      ),
      report(
        'customer-balance-detail',
        'Customer Balance Detail',
        'Each open invoice under the customer it belongs to.',
        { dateMode: 'asOf' },
      ),
      report(
        'invoice-list',
        'Invoice List',
        'Every invoice in the period, with status, customer, dates and amount.',
      ),
      report(
        'terms-list',
        'Terms List',
        'Payment terms on the books, with net days and any early-settlement discount.',
        { dateMode: 'none' },
      ),
      report(
        'unbilled-charges',
        'Unbilled charges',
        'Confirmed sales orders that have not yet been converted to an invoice.',
        { dateMode: 'asOf' },
      ),
      report(
        'unbilled-time',
        'Unbilled time',
        'Would show time captured but not yet invoiced. SkyJet does not keep timesheets.',
        { unavailable: true },
      ),
    ],
  },
  {
    id: 'what-you-owe',
    title: 'What you owe',
    reports: [
      report(
        'aged-payables-summary',
        'Accounts payable ageing summary',
        'What you still owe each supplier, split into current, 1–30, 31–60, 61–90 and 90+ days past due.',
        { dateMode: 'asOf' },
      ),
      report(
        'aged-payables-detail',
        'Accounts payable ageing detail',
        'Each unpaid bill, how old it is, and how much is still outstanding.',
        { dateMode: 'asOf' },
      ),
      report(
        'bills-and-payments',
        'Bills and Applied Payments',
        'Posted bills in the period with the supplier payments applied to them.',
      ),
      report('bill-payment-list', 'Bill Payment List', 'Supplier payments posted in the period.'),
      report(
        'unpaid-bills',
        'Unpaid Bills',
        'Posted bills that still have an outstanding balance.',
        { dateMode: 'asOf' },
      ),
      report(
        'supplier-balance-summary',
        'Supplier Balance Summary',
        'One line per supplier: billed, paid and still outstanding.',
        { dateMode: 'asOf' },
      ),
      report(
        'supplier-balance-detail',
        'Supplier Balance Detail',
        'Each unpaid bill under the supplier it belongs to.',
        { dateMode: 'asOf' },
      ),
    ],
  },
  {
    id: 'expenses-and-suppliers',
    title: 'Expenses and suppliers',
    reports: [
      report(
        'cheque-detail',
        'Cheque Detail',
        'Supplier payments posted from bank accounts in the period.',
      ),
      report(
        'purchases-by-product-detail',
        'Purchases by Product/Service Detail',
        'Bill and purchase-order lines in the period, by product.',
      ),
      report(
        'purchase-list',
        'Purchase List',
        'Purchase orders, item receipts and bills in the period.',
      ),
      report(
        'transaction-list-by-supplier',
        'Transaction List by Supplier',
        'Bills, payments, credits and purchase orders for each supplier in the period.',
      ),
      report(
        'purchases-by-supplier-detail',
        'Purchases by Supplier Detail',
        'Posted bill lines grouped by supplier.',
      ),
      report(
        'supplier-contact-list',
        'Supplier Contact List',
        'Name, email, phone and remit-to address for every active supplier.',
        { dateMode: 'none' },
      ),
      report(
        'expenses-by-supplier',
        'Expenses by Supplier Summary',
        'Posted bill totals by supplier for the period.',
      ),
      report('supplier-phone-list', 'Supplier Phone List', 'Supplier names and phone numbers.', {
        dateMode: 'none',
      }),
    ],
  },
  {
    id: 'sales-tax',
    title: 'Sales tax',
    reports: [
      report(
        'tax-liability',
        'Tax Liability Report',
        'VAT charged on issued invoices and VAT on posted bills in the period, by tax code.',
      ),
    ],
  },
  {
    id: 'employees',
    title: 'Employees',
    reports: [
      report(
        'employee-contact-list',
        'Employee Contact List',
        'Name, job title, email and phone for employees on the team list.',
        { dateMode: 'none' },
      ),
      report(
        'recent-time-activities',
        'Recent/Edited Time Activities',
        'Would list recently edited timesheets. SkyJet does not keep time activities.',
        { unavailable: true },
      ),
      report(
        'time-by-employee',
        'Time Activities by Employee Detail',
        'Would show time captured per employee. SkyJet does not keep timesheets.',
        { unavailable: true },
      ),
    ],
  },
  {
    id: 'for-my-accountant',
    title: 'For my accountant',
    reports: [
      report(
        'account-list',
        'Account List',
        'The chart of accounts: code, name, type and whether the account can be posted to.',
        { dateMode: 'none' },
      ),
      report(
        'balance-sheet',
        'Balance Sheet',
        'Assets, liabilities and equity as at the report date.',
        { dateMode: 'asOf', defaultFavourite: true },
      ),
      report(
        'balance-sheet-comparison',
        'Balance Sheet Comparison',
        'This date’s balance sheet beside the same date last year.',
        { dateMode: 'asOf' },
      ),
      report(
        'balance-sheet-detail',
        'Balance Sheet Detail',
        'Balance sheet accounts with the postings that built the closing balance.',
        { dateMode: 'asOf' },
      ),
      report(
        'balance-sheet-summary',
        'Balance Sheet Summary',
        'Totals only for assets, liabilities and equity.',
        { dateMode: 'asOf' },
      ),
      report(
        'statement-of-cash-flows',
        'Statement of Cash Flows',
        'Cash in and cash out for the period from receipts, payments and other bank movements.',
        { accountingMethod: 'cash' },
      ),
      report(
        'invalid-journals',
        'Invalid Journal Transactions',
        'Journal entries whose debit and credit totals do not match. The posting engine refuses these, so this report should be empty.',
        { dateMode: 'none' },
      ),
      report(
        'general-ledger',
        'General Ledger',
        'Every posting to every account in the period, with a running balance on each account.',
      ),
      report(
        'general-ledger-list',
        'General Ledger List',
        'Opening, period movement and closing balance for each account — a compact general ledger.',
      ),
      report(
        'journal',
        'Journal',
        'Posted journal entries in date order, with source, reference and amount.',
      ),
      report(
        'recurring-template-list',
        'Recurring Template List',
        'Would list memorised recurring transactions. Recurring documents are not in this version.',
        { unavailable: true, dateMode: 'none' },
      ),
      report(
        'profit-and-loss',
        'Profit and Loss',
        'Income, cost of sales, expenses and net earnings for the period.',
        { defaultFavourite: true },
      ),
      report(
        'profit-and-loss-by-customer',
        'Profit and Loss by Customer',
        'Issued invoice income grouped by customer for the period.',
      ),
      report(
        'profit-and-loss-by-month',
        'Profit and Loss by Month',
        'Profit and loss split into a column for each month in the period.',
      ),
      report(
        'profit-and-loss-comparison',
        'Profit and Loss Comparison',
        'This period beside the same dates last year.',
      ),
      report(
        'profit-and-loss-pct-income',
        'Profit and Loss as % of total income',
        'Each line as a percentage of total income.',
      ),
      report(
        'profit-and-loss-ytd-comparison',
        'Profit and Loss year-to-date comparison',
        'Year-to-date profit and loss beside last year’s year-to-date.',
      ),
      report(
        'quarterly-profit-and-loss',
        'Quarterly Profit and Loss Summary',
        'Profit and loss totals by quarter.',
      ),
      report(
        'recent-transactions',
        'Recent Transactions',
        'The latest journal entries posted to the books, newest first.',
        { dateMode: 'none' },
      ),
      report(
        'reconciliation-reports',
        'Reconciliation Reports',
        'Would show completed bank reconciliations. Bank reconciliation is not in this version.',
        { unavailable: true },
      ),
      report(
        'trial-balance',
        'Trial Balance',
        'Opening, debit, credit and closing for every account in the period. Debits must equal credits.',
      ),
      report(
        'adjusted-trial-balance',
        'Adjusted Trial Balance',
        'The same trial balance after period journals. SkyJet has a single ledger, so this matches the trial balance.',
      ),
      report(
        'transaction-detail-by-account',
        'Transaction Detail by Account',
        'Journal lines grouped by account for the period.',
      ),
      report(
        'transaction-list-by-date',
        'Transaction List by Date',
        'Posted journals in date order, one line per entry.',
      ),
      report(
        'transaction-list-with-splits',
        'Transaction List with Splits',
        'Posted journals with every debit and credit line shown underneath.',
      ),
    ],
  },
  {
    id: 'payroll',
    title: 'Payroll',
    intro: 'SkyJet does not run payroll. Employee records live under Team.',
    reports: [
      report(
        'employee-contact-list',
        'Employee Contact List',
        'Name, job title, email and phone for employees on the team list.',
        { dateMode: 'none' },
      ),
      report(
        'recent-time-activities',
        'Recent/Edited Time Activities',
        'Would list recently edited timesheets. SkyJet does not keep time activities.',
        { unavailable: true },
      ),
      report(
        'time-by-employee',
        'Time Activities by Employee Detail',
        'Would show time captured per employee. SkyJet does not keep timesheets.',
        { unavailable: true },
      ),
    ],
  },
  {
    id: 'time',
    title: 'Time',
    badge: 'NEW',
    reports: [
      report(
        'timesheet-by-employee',
        'Timesheet Detail by Employee',
        'Would show timesheet lines by employee. SkyJet does not keep timesheets.',
        { unavailable: true },
      ),
      report(
        'time-summary-by-pay-type',
        'Time Summary by Pay Type',
        'Would summarise time by pay type. SkyJet does not keep timesheets.',
        { unavailable: true },
      ),
    ],
  },
  {
    id: 'projects',
    title: 'Projects',
    reports: [
      report(
        'project-profitability',
        'Project Profitability Summary',
        'Would show income and cost by project. SkyJet does not keep projects.',
        { unavailable: true },
      ),
      report(
        'estimates-vs-actuals',
        'Estimates vs. actuals by project v4',
        'Would compare estimates to actuals by project. SkyJet does not keep projects.',
        { unavailable: true },
      ),
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory',
    reports: [
      report(
        'inventory-valuation-detail',
        'Inventory Valuation Detail',
        'Stock movements in the period that changed quantity or value, by item and warehouse.',
      ),
      report(
        'inventory-valuation-summary',
        'Inventory Valuation Summary',
        'Quantity on hand and stock value by item as at the report date.',
        { dateMode: 'asOf' },
      ),
      report(
        'open-po-detail',
        'Open Purchase Order Detail',
        'Approved purchase-order lines that have not yet been fully received.',
        { dateMode: 'asOf' },
      ),
      report(
        'open-po-list',
        'Open Purchase Order List',
        'Approved purchase orders still open, with amount and remaining balance.',
        { dateMode: 'asOf' },
      ),
      report(
        'stock-take-worksheet',
        'Stock Take Worksheet',
        'A count sheet: item, warehouse, system quantity on hand and a blank physical-count column.',
        { dateMode: 'asOf' },
      ),
      report(
        'inventory-status',
        'Inventory Status',
        'Quantity on hand, on purchase order and on sales order for every stocked item.',
        { dateMode: 'none' },
      ),
    ],
  },
];

const BY_ID = new Map<string, StandardReport>();
for (const section of STANDARD_REPORT_SECTIONS) {
  for (const row of section.reports) {
    if (!BY_ID.has(row.id)) BY_ID.set(row.id, row);
  }
}

export function allStandardReports(): StandardReport[] {
  return [...BY_ID.values()];
}

export function getStandardReport(id: string): StandardReport | undefined {
  return BY_ID.get(id);
}

export function reportAccountingMethod(report: Pick<StandardReport, 'accountingMethod'>): ReportAccountingMethod {
  return report.accountingMethod ?? 'accrual';
}

export function defaultFavouriteIds(): string[] {
  return allStandardReports()
    .filter((row) => row.defaultFavourite)
    .map((row) => row.id);
}

export const REPORT_FAVOURITES_KEY = 'skyjet.report-favourites';
