/**
 * Figures the home screen can actually stand behind.
 *
 * The dashboard is a morning check, not a report pack: integrity of the books,
 * cash on hand, this period's result, and what is waiting. Every query here is
 * read-only and returns amounts as strings.
 */
import { withReadOnlyTransaction, type RequestContext } from '@/server/db/transaction';

export async function getDashboardSnapshot(
  context: RequestContext,
  params: { fromDate: string; toDate: string; asAt: string; priorFrom?: string; priorTo?: string },
) {
  return withReadOnlyTransaction(context, async (tx) => {
    const ledgerNet = await tx.scalar<string>(
      `select coalesce(sum(debit_base - credit_base), 0)
         from gl.journal_entry_line where entity_id = $1`,
      [context.entityId],
    );

    const entryCount = await tx.scalar<string>(
      'select count(*) from gl.journal_entry where entity_id = $1',
      [context.entityId],
    );

    const stockTie = await tx.maybeOne<{
      subledger_value: string;
      ledger_value: string;
      difference: string;
    }>(
      `select subledger_value, ledger_value, difference
         from inv.verify_inventory_ties_to_gl($1, current_date)`,
      [context.entityId],
    );

    const outboxBacklog = await tx.scalar<string>(
      `select count(*) from integration.outbox
        where entity_id = $1 and status in ('PENDING', 'FAILED')`,
      [context.entityId],
    );

    const unclassified = await tx.scalar<string>(
      'select count(*) from integration.v_items_missing_classification where entity_id = $1',
      [context.entityId],
    );

    const openingPosted = await tx.maybeOne<{ cutover_date: string; entry_no: string | null }>(
      `select to_char(b.cutover_date, 'YYYY-MM-DD') as cutover_date, e.entry_no
         from gl.ob_batch b
         left join gl.journal_entry e on e.id = b.journal_entry_id
        where b.entity_id = $1 and b.status = 'POSTED'`,
      [context.entityId],
    );

    const pnl = await tx.query<{
      account_id: string;
      code: string;
      name: string;
      account_type: string;
      amount: string;
    }>(
      `select account_id, code, name, account_type::text, amount::text
         from gl.profit_and_loss($1, $2::date, $3::date)`,
      [context.entityId, params.fromDate, params.toDate],
    );

    const priorPnl =
      params.priorFrom && params.priorTo
        ? await tx.query<{ account_type: string; amount: string }>(
            `select account_type::text, amount::text
               from gl.profit_and_loss($1, $2::date, $3::date)`,
            [context.entityId, params.priorFrom, params.priorTo],
          )
        : [];

    const banks = await tx.query<{
      id: string;
      code: string;
      name: string;
      control_type: string;
      balance: string;
    }>(
      `select a.id, a.code, a.name, a.control_type::text,
              gl.account_balance_as_at($1, a.id, $2::date)::text as balance
         from gl.accounts a
        where a.entity_id = $1
          and a.control_type in ('BANK', 'CASH')
          and a.is_postable
          and a.is_active
        order by a.code`,
      [context.entityId, params.asAt],
    );

    const aged = await tx.query<{ bucket: string; outstanding: string }>(
      `select bucket, coalesce(sum(outstanding), 0)::text as outstanding
         from sales.aged_receivables($1, $2::date)
        group by bucket`,
      [context.entityId, params.asAt],
    );

    return {
      ledgerNet,
      entryCount,
      stockTie,
      outboxBacklog,
      unclassified,
      openingPosted,
      pnl,
      priorPnl,
      banks,
      aged,
    };
  });
}
