/**
 * Shared report arithmetic.
 *
 * Amounts stay on Money. These helpers are the place P&L / balance sheet
 * classification lives so the viewer cannot invent a cash figure from an
 * accrual ledger, or a balancing balance sheet that omits unclosed earnings.
 */
import { Money } from '@/lib/money';

/** Earliest date used when summing still-open P&L accounts as at a report date. */
export const UNCLOSED_EARNINGS_FROM = '1970-01-01';

export const NET_INCOME_ROW_ID = 'net-income';

/**
 * SkyJet's seeded chart puts cost of sales on 5xxx (parent 5000) and operating
 * expenses on 6xxx. Classification is by code, not by guessing from the name.
 */
export function isCostOfSalesAccount(code: string): boolean {
  return code.startsWith('5');
}

export type LedgerReportRow = {
  account_id: string;
  code: string;
  name: string;
  account_type: string;
  amount: string;
};

export function pnlNetIncome(
  rows: readonly Pick<LedgerReportRow, 'account_type' | 'amount'>[],
): Money {
  const income = Money.sum(
    rows.filter((row) => row.account_type === 'REVENUE').map((row) => row.amount),
  );
  const expenses = Money.sum(
    rows.filter((row) => row.account_type === 'EXPENSE').map((row) => row.amount),
  );
  return income.minus(expenses);
}

export function splitPnl<T extends Pick<LedgerReportRow, 'account_type' | 'code' | 'amount'>>(
  rows: readonly T[],
) {
  const income = rows.filter((row) => row.account_type === 'REVENUE');
  const cos = rows.filter(
    (row) => row.account_type === 'EXPENSE' && isCostOfSalesAccount(row.code),
  );
  const expenses = rows.filter(
    (row) => row.account_type === 'EXPENSE' && !isCostOfSalesAccount(row.code),
  );
  const incomeTotal = Money.sum(income.map((row) => row.amount));
  const cosTotal = Money.sum(cos.map((row) => row.amount));
  const expenseTotal = Money.sum(expenses.map((row) => row.amount));
  const gross = incomeTotal.minus(cosTotal);
  const net = gross.minus(expenseTotal);
  return { income, cos, expenses, incomeTotal, cosTotal, expenseTotal, gross, net };
}

export function sheetSectionTotals(
  rows: readonly Pick<LedgerReportRow, 'account_type' | 'amount'>[],
) {
  const assets = Money.sum(
    rows.filter((row) => row.account_type === 'ASSET').map((row) => row.amount),
  );
  const liabilities = Money.sum(
    rows.filter((row) => row.account_type === 'LIABILITY').map((row) => row.amount),
  );
  const equity = Money.sum(
    rows.filter((row) => row.account_type === 'EQUITY').map((row) => row.amount),
  );
  return { assets, liabilities, equity, financing: liabilities.plus(equity) };
}

/**
 * Posted journals that balance imply Assets = Liabilities + Equity + unclosed
 * P&L. Year-end close moves that P&L into retained earnings; until then it
 * belongs on the balance sheet as Net income, or the statement does not add up.
 */
export function withNetIncomeEquity(
  rows: readonly LedgerReportRow[],
  earnings: Money,
): LedgerReportRow[] {
  return [
    ...rows,
    {
      account_id: NET_INCOME_ROW_ID,
      code: '',
      name: 'Net income',
      account_type: 'EQUITY',
      amount: earnings.toDecimal().toString(),
    },
  ];
}

export function equityRollforward(input: {
  openingPostedEquity: Money;
  closingPostedEquity: Money;
  openingEarnings: Money;
  closingEarnings: Money;
  periodProfit: Money;
}) {
  const opening = input.openingPostedEquity.plus(input.openingEarnings);
  const otherMovements = input.closingPostedEquity.minus(input.openingPostedEquity);
  const closing = input.closingPostedEquity.plus(input.closingEarnings);
  const rolled = opening.plus(input.periodProfit).plus(otherMovements);
  return { opening, otherMovements, closing, rolled };
}
