import { describe, expect, it } from 'vitest';
import {
  calendarDaysBetween,
  estimateRibbonCaption,
  firstQuery,
  last3MonthsRange,
  parseSalesTxnHidden,
  parseSalesTxnPage,
  parseSalesTxnPageSize,
  parseSalesTxnRange,
  parseSalesTxnSearch,
  parseSalesTxnStatus,
  parseSalesTxnType,
  salesTxnAgeingLabel,
  salesTxnDateBounds,
  salesTxnHideClass,
  salesTxnHref,
  salesTxnPagerRange,
  salesTxnQueryString,
  salesTxnStatusLabel,
  SALES_TXN_DEFAULT_HIDDEN,
} from '@/lib/sales-transactions';

describe('sales transaction query parsing', () => {
  it('defaults type, date, status and search', () => {
    expect(parseSalesTxnType(undefined)).toBe('all');
    expect(parseSalesTxnType('invoice')).toBe('invoice');
    expect(parseSalesTxnType('widgets')).toBe('all');
    expect(parseSalesTxnRange(undefined)).toBe('last3');
    expect(parseSalesTxnRange('thisMonth')).toBe('thisMonth');
    expect(parseSalesTxnStatus(undefined)).toBe('all');
    expect(parseSalesTxnStatus('overdue')).toBe('overdue');
    expect(parseSalesTxnSearch(undefined)).toBeUndefined();
    expect(parseSalesTxnSearch('  acme  ')).toBe('acme');
    expect(firstQuery(['invoice', 'payment'])).toBe('invoice');
  });

  it('only accepts 50, 100, 200 or 300 rows and a positive page', () => {
    expect(parseSalesTxnPageSize(undefined)).toBe(50);
    expect(parseSalesTxnPageSize('100')).toBe(100);
    expect(parseSalesTxnPageSize('200')).toBe(200);
    expect(parseSalesTxnPageSize('300')).toBe(300);
    expect(parseSalesTxnPageSize('25')).toBe(50);
    expect(parseSalesTxnPageSize('75')).toBe(50);
    expect(parseSalesTxnPage(undefined)).toBe(1);
    expect(parseSalesTxnPage('3')).toBe(3);
    expect(parseSalesTxnPage('0')).toBe(1);
    expect(parseSalesTxnPage('1.5')).toBe(1);
  });

  it('keeps email, ageing, last delivered and attachments hidden unless asked', () => {
    expect(parseSalesTxnHidden(undefined)).toEqual([...SALES_TXN_DEFAULT_HIDDEN]);
    expect(parseSalesTxnHidden('')).toEqual([]);
    expect(parseSalesTxnHidden('-')).toEqual([]);
    expect(parseSalesTxnHidden('no,memo,gone')).toEqual(['no', 'memo']);
    expect(salesTxnHideClass(['email', 'ageing'])).toContain('is-hide-email');
  });

  it('windows last 3 months as a 90-day lookback', () => {
    expect(last3MonthsRange('2026-09-05')).toEqual({ from: '2026-06-07', to: '2026-09-05' });
    expect(salesTxnDateBounds('all', '2026-09-05')).toEqual({ from: null, to: null });
    expect(salesTxnDateBounds('thisMonth', '2026-09-05')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(salesTxnDateBounds('last3', '2026-09-05').from).toBe('2026-06-07');
  });

  it('omits default filters from the query string', () => {
    expect(
      salesTxnQueryString({
        type: 'all',
        range: 'last3',
        status: 'all',
        page: 1,
        rows: 50,
        hidden: [...SALES_TXN_DEFAULT_HIDDEN],
      }),
    ).toBe('');
    expect(
      salesTxnQueryString({
        type: 'invoice',
        range: 'thisMonth',
        status: 'overdue',
        q: 'acme',
        page: 2,
        rows: 100,
        hidden: ['memo'],
      }),
    ).toBe('?type=invoice&range=thisMonth&status=overdue&q=acme&page=2&rows=100&hidden=memo');
    expect(
      salesTxnQueryString({
        type: 'all',
        range: 'last3',
        status: 'all',
        page: 1,
        rows: 50,
        hidden: [],
      }),
    ).toBe('?hidden=-');
  });
});

describe('sales transaction labels', () => {
  it('describes invoice due dates from the real due date', () => {
    expect(
      salesTxnStatusLabel({
        kind: 'invoice',
        docStatus: 'ISSUED',
        balance: '10.0000',
        dueDate: '2026-09-08',
        convertedInvoiceId: null,
        today: '2026-09-05',
      }),
    ).toBe('Due in 3 days');
    expect(
      salesTxnStatusLabel({
        kind: 'invoice',
        docStatus: 'ISSUED',
        balance: '10.0000',
        dueDate: '2026-09-04',
        convertedInvoiceId: null,
        today: '2026-09-05',
      }),
    ).toBe('Overdue');
    expect(
      salesTxnStatusLabel({
        kind: 'invoice',
        docStatus: 'ISSUED',
        balance: '0.0000',
        dueDate: '2026-09-01',
        convertedInvoiceId: null,
        today: '2026-09-05',
      }),
    ).toBe('Paid');
    expect(
      salesTxnStatusLabel({
        kind: 'estimate',
        docStatus: 'SENT',
        balance: '0',
        dueDate: null,
        convertedInvoiceId: null,
        today: '2026-09-05',
      }),
    ).toBe('Pending');
    expect(calendarDaysBetween('2026-09-01', '2026-09-05')).toBe(4);
    expect(salesTxnAgeingLabel('invoice', '2026-08-01', '25.0000', '2026-09-05')).toBe('35 days');
    expect(salesTxnAgeingLabel('payment', '2026-08-01', '25.0000', '2026-09-05')).toBe('');
    expect(estimateRibbonCaption('1')).toBe('1 estimate');
    expect(estimateRibbonCaption('0')).toBe('0 estimates');
    expect(salesTxnHref('invoice', 'abc')).toBe('/sales/invoices/abc');
    expect(salesTxnHref('payment', 'abc')).toBeNull();
    expect(salesTxnPagerRange(0, 1, 50)).toBe('1-0 of 0');
    expect(salesTxnPagerRange(4, 1, 50)).toBe('1-4 of 4');
  });
});
