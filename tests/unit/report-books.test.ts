import { describe, expect, it } from 'vitest';
import { Money } from '@/lib/money';
import {
  equityRollforward,
  isCostOfSalesAccount,
  pnlNetIncome,
  sheetSectionTotals,
  splitPnl,
  withNetIncomeEquity,
} from '@/lib/report-books';

describe('report books', () => {
  it('treats 5xxx as cost of sales and 6xxx as operating expense', () => {
    expect(isCostOfSalesAccount('5010')).toBe(true);
    expect(isCostOfSalesAccount('5050')).toBe(true);
    expect(isCostOfSalesAccount('6010')).toBe(false);
    expect(isCostOfSalesAccount('4010')).toBe(false);
  });

  it('nets P&L as revenue minus every expense, with COS split only for presentation', () => {
    const rows = [
      {
        account_id: 'rev',
        code: '4010',
        name: 'Parts Sales',
        account_type: 'REVENUE',
        amount: '10000',
      },
      {
        account_id: 'cos',
        code: '5010',
        name: 'Cost of Parts Sold',
        account_type: 'EXPENSE',
        amount: '4000',
      },
      {
        account_id: 'adj',
        code: '5050',
        name: 'Inventory Adjustments',
        account_type: 'EXPENSE',
        amount: '-200',
      },
      {
        account_id: 'rent',
        code: '6110',
        name: 'Rent',
        account_type: 'EXPENSE',
        amount: '1500',
      },
    ];
    const pnl = splitPnl(rows);
    expect(pnl.incomeTotal.toDecimal().toString()).toBe('10000');
    expect(pnl.cosTotal.toDecimal().toString()).toBe('3800');
    expect(pnl.expenseTotal.toDecimal().toString()).toBe('1500');
    expect(pnl.gross.toDecimal().toString()).toBe('6200');
    expect(pnl.net.toDecimal().toString()).toBe('4700');
    expect(pnlNetIncome(rows).equals(pnl.net)).toBe(true);
  });

  it('puts unclosed earnings on the balance sheet so assets equal financing', () => {
    const posted = [
      {
        account_id: 'ar',
        code: '1110',
        name: 'Trade Receivables',
        account_type: 'ASSET',
        amount: '11600',
      },
      {
        account_id: 'vat',
        code: '2110',
        name: 'VAT Output',
        account_type: 'LIABILITY',
        amount: '1600',
      },
    ];
    const unbalanced = sheetSectionTotals(posted);
    expect(unbalanced.assets.equals(unbalanced.financing)).toBe(false);

    const withEarnings = withNetIncomeEquity(posted, Money.from('10000'));
    const balanced = sheetSectionTotals(withEarnings);
    expect(balanced.assets.toDecimal().toString()).toBe('11600');
    expect(balanced.equity.toDecimal().toString()).toBe('10000');
    expect(balanced.financing.toDecimal().toString()).toBe('11600');
    expect(balanced.assets.equals(balanced.financing)).toBe(true);
  });

  it('rolls opening equity plus profit plus other movements to closing equity', () => {
    const rolled = equityRollforward({
      openingPostedEquity: Money.from('5000'),
      closingPostedEquity: Money.from('5000'),
      openingEarnings: Money.from('1000'),
      closingEarnings: Money.from('4700'),
      periodProfit: Money.from('3700'),
    });
    expect(rolled.opening.toDecimal().toString()).toBe('6000');
    expect(rolled.otherMovements.isZero()).toBe(true);
    expect(rolled.closing.toDecimal().toString()).toBe('9700');
    expect(rolled.rolled.equals(rolled.closing)).toBe(true);
  });
});
