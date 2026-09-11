import { describe, expect, it } from 'vitest';
import {
  estimateDateBounds,
  estimateStatusCaption,
  estimateStatusLabel,
  hubOverviewRangeLabel,
  openBalanceCaption,
  overdueCaption,
  parseCustomerTab,
  parseEstimateRange,
  parseEstimateStatus,
  parseHubOverviewRange,
  parseInvoiceListStatus,
  parseSalesSurveySettings,
  quotationStatusSql,
  recentlyPaidCaption,
  registerPagerLabel,
  reviewStars,
  surveyOnOff,
} from '@/lib/customer-hub';

describe('customer hub helpers', () => {
  it('treats an unknown tab as customers', () => {
    expect(parseCustomerTab(undefined)).toBe('customers');
    expect(parseCustomerTab('leads')).toBe('leads');
    expect(parseCustomerTab('other')).toBe('customers');
  });

  it('maps estimate filters onto quotation statuses and date bounds', () => {
    expect(parseEstimateStatus('pending')).toBe('pending');
    expect(parseEstimateStatus('nope')).toBe('all');
    expect(quotationStatusSql('pending')).toBe('SENT');
    expect(quotationStatusSql('all')).toBeNull();
    expect(parseEstimateRange(undefined)).toBe('last12');
    expect(estimateDateBounds('all')).toEqual({ from: null, to: null });
    expect(estimateDateBounds('thisYear', '2026-09-05')).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  it('defaults the hub funnel to the last 365 days', () => {
    expect(parseHubOverviewRange(undefined)).toBe('last12');
    expect(parseHubOverviewRange('thisYear')).toBe('thisYear');
    expect(hubOverviewRangeLabel('last12')).toBe('Last 365 days');
  });

  it('labels a sent estimate as pending with a sent date', () => {
    expect(estimateStatusLabel('SENT')).toBe('Pending');
    expect(estimateStatusCaption('SENT', '05/09/2026')).toBe('Sent 05/09/2026');
    expect(estimateStatusCaption('DRAFT', '05/09/2026')).toBeNull();
  });

  it('phrases glance captions the way the strip reads them', () => {
    expect(overdueCaption('0')).toBe('0 overdue invoices');
    expect(overdueCaption('1')).toBe('1 overdue invoice');
    expect(openBalanceCaption('1')).toBe('1 open invoice or credit');
    expect(openBalanceCaption('2')).toBe('2 open invoices or credits');
    expect(recentlyPaidCaption('1')).toBe('1 recently paid');
    expect(registerPagerLabel(0)).toBe('0-0 of 0');
    expect(registerPagerLabel(1)).toBe('1-1 of 1');
  });

  it('keeps survey questions off until a saved true flag arrives', () => {
    expect(parseSalesSurveySettings(null)).toEqual({
      askWorkRequest: false,
      askReview: false,
      askReferral: false,
      frequencyDays: 90,
    });
    expect(
      parseSalesSurveySettings({
        ask_review: true,
        ask_work_request: false,
        ask_referral: true,
        frequency_days: 30,
      }).askReview,
    ).toBe(true);
    expect(surveyOnOff(false)).toBe('Off');
    expect(reviewStars(3)).toBe('★★★☆☆');
  });

  it('treats invoice lists as all unless unpaid is asked for', () => {
    expect(parseInvoiceListStatus(undefined)).toBe('all');
    expect(parseInvoiceListStatus('unpaid')).toBe('unpaid');
    expect(parseInvoiceListStatus('draft')).toBe('all');
  });
});
