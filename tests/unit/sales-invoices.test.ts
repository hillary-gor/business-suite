import { describe, expect, it } from 'vitest';
import { last3MonthsRange } from '@/lib/sales-transactions';
import {
  INVOICE_LIST_DEFAULT_HIDDEN,
  formatInvoiceActivityAt,
  invoiceActivitySteps,
  invoiceListDateBounds,
  invoiceListHideClass,
  invoiceListQueryString,
  invoiceListStatusSortHref,
  parseInvoiceListDir,
  parseInvoiceListHidden,
  parseInvoiceListPage,
  parseInvoiceListPageSize,
  parseInvoiceListQuery,
  parseInvoiceListRange,
  parseInvoiceListSelectedId,
  parseInvoiceListSort,
  parseInvoiceListStatus,
} from '@/lib/sales-invoices';

describe('invoice list status parsing', () => {
  it('keeps unpaid as a first-class filter for the overview link', () => {
    expect(parseInvoiceListStatus(undefined)).toBe('all');
    expect(parseInvoiceListStatus('unpaid')).toBe('unpaid');
    expect(parseInvoiceListStatus('overdue')).toBe('overdue');
    expect(parseInvoiceListStatus('not_due')).toBe('not_due');
    expect(parseInvoiceListStatus('paid')).toBe('paid');
    expect(parseInvoiceListStatus('deposited')).toBe('deposited');
    expect(parseInvoiceListStatus('not_deposited')).toBe('not_deposited');
    expect(parseInvoiceListStatus('needs_attention')).toBe('needs_attention');
    expect(parseInvoiceListStatus('draft')).toBe('all');
  });
});

describe('invoice list date parsing', () => {
  it('defaults to last 3 months and accepts the screenshot windows', () => {
    expect(parseInvoiceListRange(undefined)).toBe('last3');
    expect(parseInvoiceListRange('today')).toBe('today');
    expect(parseInvoiceListRange('2025')).toBe('2025');
    expect(parseInvoiceListRange('nope')).toBe('last3');
  });

  it('reuses calendar helpers instead of inventing bounds', () => {
    const today = '2026-09-05';
    expect(invoiceListDateBounds('last3', today)).toEqual(last3MonthsRange(today));
    expect(invoiceListDateBounds('today', today)).toEqual({ from: today, to: today });
    expect(invoiceListDateBounds('yesterday', today)).toEqual({
      from: '2026-09-04',
      to: '2026-09-04',
    });
    expect(invoiceListDateBounds('thisWeek', today)).toEqual({
      from: '2026-08-31',
      to: '2026-09-06',
    });
    expect(invoiceListDateBounds('lastWeek', today)).toEqual({
      from: '2026-08-24',
      to: '2026-08-30',
    });
    expect(invoiceListDateBounds('thisMonth', today)).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(invoiceListDateBounds('lastMonth', today)).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(invoiceListDateBounds('last30', today)).toEqual({
      from: '2026-08-06',
      to: '2026-09-05',
    });
    expect(invoiceListDateBounds('thisQuarter', today)).toEqual({
      from: '2026-07-01',
      to: '2026-09-30',
    });
    expect(invoiceListDateBounds('lastQuarter', today)).toEqual({
      from: '2026-04-01',
      to: '2026-06-30',
    });
    expect(invoiceListDateBounds('last6', today)).toEqual({
      from: '2026-03-09',
      to: '2026-09-05',
    });
    expect(invoiceListDateBounds('last12', today)).toEqual({
      from: '2025-09-05',
      to: '2026-09-05',
    });
    expect(invoiceListDateBounds('ytd', today)).toEqual({
      from: '2026-01-01',
      to: '2026-09-05',
    });
    expect(invoiceListDateBounds('thisYear', today)).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(invoiceListDateBounds('2025', today)).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
  });
});

describe('invoice list column and row prefs', () => {
  it('hides balance and due date until they are asked for', () => {
    expect(parseInvoiceListHidden(undefined)).toEqual([...INVOICE_LIST_DEFAULT_HIDDEN]);
    expect(parseInvoiceListHidden('')).toEqual([]);
    expect(parseInvoiceListHidden('-')).toEqual([]);
    expect(parseInvoiceListHidden('no,gone')).toEqual(['no']);
    expect(invoiceListHideClass(['due', 'balance'])).toContain('is-hide-due');
  });

  it('only accepts 50, 100, 200 or 300 rows and a positive page', () => {
    expect(parseInvoiceListPageSize(undefined)).toBe(50);
    expect(parseInvoiceListPageSize('100')).toBe(100);
    expect(parseInvoiceListPageSize('25')).toBe(50);
    expect(parseInvoiceListPage(undefined)).toBe(1);
    expect(parseInvoiceListPage('2')).toBe(2);
    expect(parseInvoiceListPage('0')).toBe(1);
  });

  it('sorts by date newest-first unless status is asked for', () => {
    expect(parseInvoiceListSort(undefined)).toBe('date');
    expect(parseInvoiceListSort('status')).toBe('status');
    expect(parseInvoiceListDir(undefined, 'date')).toBe('desc');
    expect(parseInvoiceListDir(undefined, 'status')).toBe('asc');
    expect(parseInvoiceListDir('desc', 'status')).toBe('desc');
  });

  it('omits default filters from the query string and keeps unpaid', () => {
    expect(
      invoiceListQueryString({
        status: 'all',
        range: 'last3',
        page: 1,
        rows: 50,
        hidden: [...INVOICE_LIST_DEFAULT_HIDDEN],
        sort: 'date',
        dir: 'desc',
      }),
    ).toBe('');
    expect(
      invoiceListQueryString({
        status: 'unpaid',
        range: 'last3',
        page: 1,
        rows: 50,
        hidden: [...INVOICE_LIST_DEFAULT_HIDDEN],
        sort: 'date',
        dir: 'desc',
      }),
    ).toBe('?status=unpaid');
    expect(
      invoiceListQueryString({
        status: 'paid',
        range: '2025',
        page: 2,
        rows: 100,
        hidden: [],
        sort: 'status',
        dir: 'desc',
      }),
    ).toBe('?status=paid&range=2025&page=2&rows=100&hidden=-&sort=status&dir=desc');
  });

  it('reads mixed search params the way the listing page will', () => {
    const query = parseInvoiceListQuery({
      status: ['unpaid', 'paid'],
      range: 'thisMonth',
      rows: '200',
      hidden: 'no',
      sort: 'status',
    });
    expect(query.status).toBe('unpaid');
    expect(query.range).toBe('thisMonth');
    expect(query.rows).toBe(200);
    expect(query.hidden).toEqual(['no']);
    expect(query.sort).toBe('status');
    expect(query.dir).toBe('asc');
    expect(invoiceListStatusSortHref(query)).toContain('dir=desc');
  });
});

describe('invoice list selected invoice query', () => {
  const invoiceId = '2f1c4e8a-7b90-4d12-9c3e-55aa00112233';

  it('keeps a uuid invoice param without disturbing unpaid', () => {
    const query = parseInvoiceListQuery({
      status: 'unpaid',
      invoice: invoiceId,
    });
    expect(query.status).toBe('unpaid');
    expect(query.invoice).toBe(invoiceId);
    expect(
      invoiceListQueryString({
        status: 'unpaid',
        range: 'last3',
        page: 1,
        rows: 50,
        hidden: [...INVOICE_LIST_DEFAULT_HIDDEN],
        sort: 'date',
        dir: 'desc',
        invoice: invoiceId,
      }),
    ).toBe(`?status=unpaid&invoice=${invoiceId}`);
  });

  it('drops an invalid invoice id and still reads status=unpaid', () => {
    expect(parseInvoiceListSelectedId('not-an-id')).toBeUndefined();
    const query = parseInvoiceListQuery({
      status: 'unpaid',
      invoice: '1001',
    });
    expect(query.status).toBe('unpaid');
    expect(query.invoice).toBeUndefined();
    expect(invoiceListQueryString({ ...query })).toBe('?status=unpaid');
  });
});

describe('invoice activity mapping', () => {
  it('only completes sent and paid when real timestamps or a zero balance exist', () => {
    expect(
      invoiceActivitySteps({
        issuedAt: null,
        outstanding: '5.00',
        status: 'DRAFT',
        paidOn: null,
      }).map((step) => [step.id, step.complete, step.at]),
    ).toEqual([
      ['sent', false, null],
      ['viewed', false, null],
      ['paid', false, null],
      ['payout', false, null],
    ]);
    expect(
      invoiceActivitySteps({
        issuedAt: '2026-09-03 16:00',
        outstanding: '0.00',
        status: 'ISSUED',
        paidOn: '2026-09-04',
      }),
    ).toEqual([
      { id: 'sent', label: 'Sent', complete: true, at: '2026-09-03 16:00' },
      { id: 'viewed', label: 'Viewed', complete: false, at: null },
      { id: 'paid', label: 'Paid', complete: true, at: '2026-09-04' },
      { id: 'payout', label: 'Payout sent', complete: false, at: null },
    ]);
    expect(
      invoiceActivitySteps({
        issuedAt: '2026-09-03 16:00',
        outstanding: '0.00',
        status: 'ISSUED',
        paidOn: null,
      })[2],
    ).toEqual({ id: 'paid', label: 'Paid', complete: true, at: null });
    expect(formatInvoiceActivityAt('2026-09-03 16:00')).toBe('03/09/2026 at 4:00 pm');
    expect(formatInvoiceActivityAt('2026-09-04')).toBe('04/09/2026');
  });
});
