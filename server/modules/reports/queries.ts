/**
 * Financial report reads.
 *
 * These call the SQL helpers in gl / sales. Amounts stay strings end-to-end.
 */
import { withReadOnlyTransaction, type RequestContext } from '@/server/db/transaction';

export async function getProfitAndLoss(context: RequestContext, fromDate: string, toDate: string) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      account_id: string;
      code: string;
      name: string;
      account_type: string;
      amount: string;
    }>(
      `select account_id, code, name, account_type::text, amount::text
         from gl.profit_and_loss($1, $2::date, $3::date)`,
      [context.entityId, fromDate, toDate],
    ),
  );
}

export async function getBalanceSheet(context: RequestContext, asAt: string) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      account_id: string;
      code: string;
      name: string;
      account_type: string;
      amount: string;
    }>(
      `select account_id, code, name, account_type::text, amount::text
         from gl.balance_sheet($1, $2::date)`,
      [context.entityId, asAt],
    ),
  );
}

export async function getSalesByProduct(
  context: RequestContext,
  fromDate: string,
  toDate: string,
  basis: 'ACCRUAL' | 'CASH',
) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      item_id: string | null;
      category_id: string | null;
      category_name: string | null;
      product_name: string;
      quantity: string;
      amount: string;
      cos: string;
    }>(
      `select item_id::text,
              category_id::text,
              category_name,
              product_name,
              quantity::text,
              amount::text,
              cos::text
         from sales.sales_by_product_summary($1::uuid, $2::date, $3::date, $4::text)`,
      [context.entityId, fromDate, toDate, basis],
    ),
  );
}

export async function getAgedReceivables(context: RequestContext, asAt: string) {
  return withReadOnlyTransaction(context, async (tx) =>
    tx.query<{
      customer_id: string;
      customer_code: string;
      customer_name: string;
      invoice_id: string;
      invoice_no: string;
      invoice_date: string;
      due_date: string;
      total: string;
      outstanding: string;
      bucket: string;
    }>(
      `select customer_id, customer_code, customer_name, invoice_id, invoice_no,
              invoice_date::text, due_date::text, total::text, outstanding::text, bucket
         from sales.aged_receivables($1, $2::date)`,
      [context.entityId, asAt],
    ),
  );
}
