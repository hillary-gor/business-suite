import { parseSalesSurveySettings, type SalesSurveySettings } from '@/lib/customer-hub';
import {
  withReadOnlyTransaction,
  withTransaction,
  type RequestContext,
} from '@/server/db/transaction';
import type { SaveSalesSurveySettingsInput } from './schemas';

export async function getSalesSurveySettings(
  context: RequestContext,
): Promise<SalesSurveySettings> {
  const raw = await withReadOnlyTransaction(context, (tx) =>
    tx.scalar<string>(`select app.get_sales_survey_settings($1)::text`, [context.entityId]),
  );
  return parseSalesSurveySettings(JSON.parse(raw) as unknown);
}

export async function saveSalesSurveySettings(
  context: RequestContext,
  input: SaveSalesSurveySettingsInput,
): Promise<SalesSurveySettings> {
  const raw = await withTransaction(context, (tx) =>
    tx.scalar<string>(`select app.save_sales_survey_settings($1, $2::jsonb)::text`, [
      context.entityId,
      JSON.stringify({
        ask_work_request: input.askWorkRequest,
        ask_review: input.askReview,
        ask_referral: input.askReferral,
        frequency_days: input.frequencyDays,
      }),
    ]),
  );
  return parseSalesSurveySettings(JSON.parse(raw) as unknown);
}
