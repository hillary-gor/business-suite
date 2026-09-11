import { last12MonthsRange, thisYearRange } from '@/lib/payables';

export type CustomerDirectoryTab = 'customers' | 'leads';
export type EstimateStatusFilter = 'all' | 'draft' | 'pending' | 'accepted' | 'cancelled';
export type EstimateDateRange = 'last12' | 'thisYear' | 'all';
export type HubOverviewRange = 'last12' | 'thisYear';

export function parseCustomerTab(raw: string | undefined): CustomerDirectoryTab {
  return raw === 'leads' ? 'leads' : 'customers';
}

export function parseEstimateStatus(raw: string | undefined): EstimateStatusFilter {
  if (raw === 'draft' || raw === 'pending' || raw === 'accepted' || raw === 'cancelled') {
    return raw;
  }
  return 'all';
}

export function parseEstimateRange(raw: string | undefined): EstimateDateRange {
  if (raw === 'thisYear' || raw === 'all') return raw;
  return 'last12';
}

export function parseHubOverviewRange(raw: string | undefined): HubOverviewRange {
  return raw === 'thisYear' ? 'thisYear' : 'last12';
}

export function hubOverviewRangeLabel(range: HubOverviewRange): string {
  return range === 'thisYear' ? 'This year' : 'Last 365 days';
}

/** Maps the list filter onto `sales.quotations.status`. */
export function quotationStatusSql(filter: EstimateStatusFilter): string | null {
  switch (filter) {
    case 'draft':
      return 'DRAFT';
    case 'pending':
      return 'SENT';
    case 'accepted':
      return 'ACCEPTED';
    case 'cancelled':
      return 'CANCELLED';
    default:
      return null;
  }
}

export function estimateDateBounds(
  range: EstimateDateRange,
  today?: string,
): { from: string | null; to: string | null } {
  if (range === 'all') return { from: null, to: null };
  if (range === 'thisYear') {
    const bounds = thisYearRange(today);
    return bounds;
  }
  return last12MonthsRange(today);
}

/**
 * Sent estimates show as Pending on the list — that is the customer's
 * outstanding quote, not a workflow queue.
 */
export function estimateStatusLabel(status: string): string {
  if (status === 'SENT') return 'Pending';
  if (status === 'DRAFT') return 'Draft';
  if (status === 'ACCEPTED') return 'Accepted';
  if (status === 'CANCELLED') return 'Cancelled';
  return status;
}

export function estimateStatusCaption(status: string, updatedOn: string | null): string | null {
  if (!updatedOn) return null;
  if (status === 'SENT') return `Sent ${updatedOn}`;
  if (status === 'ACCEPTED') return `Accepted ${updatedOn}`;
  if (status === 'CANCELLED') return `Cancelled ${updatedOn}`;
  return null;
}

export function overdueCaption(count: string): string {
  return count === '1' ? '1 overdue invoice' : `${count} overdue invoices`;
}

export function openBalanceCaption(count: string): string {
  return count === '1' ? '1 open invoice or credit' : `${count} open invoices or credits`;
}

export function recentlyPaidCaption(count: string): string {
  return `${count} recently paid`;
}

export function registerPagerLabel(total: number): string {
  if (total === 0) return '0-0 of 0';
  return `1-${total} of ${total}`;
}

export const SURVEY_SETTINGS_HREF = '/settings/sales?section=survey';

export const SURVEY_FREQUENCY_DAYS = [30, 60, 90, 180] as const;
export type SurveyFrequencyDays = (typeof SURVEY_FREQUENCY_DAYS)[number];

export type SalesSurveySettings = {
  askWorkRequest: boolean;
  askReview: boolean;
  askReferral: boolean;
  frequencyDays: SurveyFrequencyDays;
};

export const DEFAULT_SALES_SURVEY_SETTINGS: SalesSurveySettings = {
  askWorkRequest: false,
  askReview: false,
  askReferral: false,
  frequencyDays: 90,
};

export function parseSurveyFrequencyDays(raw: unknown): SurveyFrequencyDays {
  if (raw === 30 || raw === 60 || raw === 90 || raw === 180) return raw;
  if (raw === '30' || raw === '60' || raw === '90' || raw === '180') {
    return Number(raw) as SurveyFrequencyDays;
  }
  return 90;
}

export function parseSalesSurveySettings(raw: unknown): SalesSurveySettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    askWorkRequest: obj.ask_work_request === true,
    askReview: obj.ask_review === true,
    askReferral: obj.ask_referral === true,
    frequencyDays: parseSurveyFrequencyDays(obj.frequency_days),
  };
}

export function surveyOnOff(on: boolean): 'On' | 'Off' {
  return on ? 'On' : 'Off';
}

export function surveyFrequencyLabel(days: SurveyFrequencyDays): string {
  return `${days} days`;
}

export function reviewStars(rating: number): string {
  const n = Number.parseInt(String(rating), 10);
  const filled = !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 5 ? 5 : n;
  return `${'★'.repeat(filled)}${'☆'.repeat(5 - filled)}`;
}

export type { InvoiceListStatus } from '@/lib/sales-invoices';
export { parseInvoiceListStatus } from '@/lib/sales-invoices';
