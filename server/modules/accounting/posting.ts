/**
 * Calling the posting engine.
 *
 * There is very little logic in this file, and that is the point. The rules
 * about what a journal entry may be live in `gl.post_entry`, where they apply
 * to every caller including a psql session. This layer builds the payload,
 * hands it over, and translates the answer.
 *
 * If you find yourself wanting to add a validation here, add it to the
 * migration instead. A rule enforced in TypeScript is a rule that stops
 * applying the moment someone writes a script.
 */
import { withTransaction, type RequestContext } from '@/server/db/transaction';
import { BusinessRuleError } from '@/server/db/errors';
import { Money } from '@/lib/money';
import type { PostJournalInput } from './schemas';

export interface PostedEntry {
  readonly entryId: string;
  readonly entryNo: string;
  readonly wasReplay: boolean;
}

/**
 * Posts a manual journal.
 *
 * The idempotency key deserves a note. Without one, a user who submits and
 * then loses the connection has no way to know whether the entry landed, and
 * the natural response — pressing Post again — books it twice. With one, the
 * retry returns the original entry. The key must therefore be generated on the
 * client when the form is opened, not on the server when it is submitted, or
 * every retry gets a fresh key and the protection is illusory.
 */
export async function postJournal(
  context: RequestContext,
  input: PostJournalInput,
): Promise<PostedEntry> {
  /**
   * The payload gl.post_entry expects.
   *
   * Two things are worth noting. The user's reference goes to
   * `source_document_no`, which is the field the engine indexes and searches
   * on, rather than being buried in the free-text memo. And currency and rate
   * are per line, not per entry: the entry-level choice on the form is simply
   * the default applied to each line here. That is not a quirk — a single
   * journal legitimately carries lines in different currencies, and the ledger
   * stores the rate against the line it was applied to.
   *
   * The document type is deliberately omitted so the engine derives it from
   * the source type, keeping the numbering series for manual journals in one
   * place rather than restating it at every call site.
   */
  const payload = {
    entry_date: input.entryDate,
    source_type: 'MANUAL_JOURNAL',
    description: input.description,
    source_document_no: input.reference ?? null,
    lines: input.lines.map((line) => ({
      account_id: line.accountId,
      memo: line.description ?? null,
      debit: line.debit ?? '0',
      credit: line.credit ?? '0',
      currency_code: line.currencyCode ?? input.currencyCode,
      fx_rate: line.fxRate ?? input.fxRate ?? null,
      customer_id: line.customerId ?? null,
      supplier_id: line.supplierId ?? null,
      warehouse_id: line.warehouseId ?? null,
      item_id: line.itemId ?? null,
      cost_centre: line.costCentre ?? null,
      project_code: line.projectCode ?? null,
    })),
  };

  return withTransaction(context, async (tx) => {
    // Looked up before posting so the caller can be told the difference
    // between "posted" and "this had already been posted, nothing happened".
    const before = input.idempotencyKey
      ? await tx.maybeOne<{ entry_id: string }>(
          `select (result ->> 'entry_id') as entry_id
             from app.idempotency_keys
            where entity_id = $1 and idempotency_key = $2`,
          [context.entityId, input.idempotencyKey],
        )
      : null;

    const entryId = await tx.scalar<string>('select gl.post_entry($1, $2::jsonb, $3)', [
      context.entityId,
      JSON.stringify(payload),
      input.idempotencyKey ?? null,
    ]);

    const entry = await tx.one<{ entry_no: string }>(
      'select entry_no from gl.journal_entry where id = $1',
      [entryId],
    );

    return {
      entryId,
      entryNo: entry.entry_no,
      wasReplay: before?.entry_id === entryId,
    };
  });
}

/**
 * Reverses a posted entry.
 *
 * Nothing in this system amends or deletes a journal entry, because an audit
 * trail with an eraser is not an audit trail. A mistake is corrected by
 * posting its mirror image and letting both stand, which is also what a
 * reviewer needs to see to understand what happened.
 */
export async function reverseJournal(
  context: RequestContext,
  input: { entryId: string; reason: string; reversalDate?: string; idempotencyKey?: string },
): Promise<PostedEntry> {
  return withTransaction(context, async (tx) => {
    const original = await tx.maybeOne<{
      id: string;
      entity_id: string;
      entry_no: string;
      reversal_of_entry_id: string | null;
    }>(
      `select id, entity_id, entry_no, reversal_of_entry_id
         from gl.journal_entry where id = $1`,
      [input.entryId],
    );

    if (!original) throw new BusinessRuleError('That entry does not exist');
    if (original.entity_id !== context.entityId) {
      throw new BusinessRuleError('That entry belongs to a different entity');
    }
    if (original.reversal_of_entry_id) {
      throw new BusinessRuleError(
        'That entry is itself a reversal. Reverse the original entry instead.',
      );
    }

    const entryId = await tx.scalar<string>('select gl.reverse_entry($1, $2, $3::date, $4)', [
      input.entryId,
      input.reason,
      input.reversalDate ?? null,
      input.idempotencyKey ?? null,
    ]);

    const entry = await tx.one<{ entry_no: string }>(
      'select entry_no from gl.journal_entry where id = $1',
      [entryId],
    );

    return { entryId, entryNo: entry.entry_no, wasReplay: false };
  });
}

/**
 * The exchange rate that will be used for a date, so the form can show the
 * user the rate their entry is about to be translated at rather than letting
 * them discover it afterwards on the ledger.
 *
 * `app.fx_rate_on` takes a currency pair because a rate is meaningless without
 * both sides of it; the target is the entity's functional currency.
 */
export async function getFxRate(
  context: RequestContext,
  currencyCode: string,
  onDate: string,
  options: { rateType?: string } = {},
): Promise<string | null> {
  return withTransaction(
    context,
    async (tx) => {
      const base = await tx.scalar<string>(
        'select base_currency_code from app.entities where id = $1',
        [context.entityId],
      );
      if (currencyCode === base) return '1';

      return tx.scalar<string | null>('select app.fx_rate_on($1, $2, $3, $4::date, $5)', [
        context.entityId,
        currencyCode,
        base,
        onDate,
        options.rateType ?? 'SPOT',
      ]);
    },
    { readOnly: true },
  );
}

/** Totals a set of lines for the form's running footer. */
export function summariseLines(lines: ReadonlyArray<{ debit?: string; credit?: string }>): {
  debits: Money;
  credits: Money;
  difference: Money;
  balanced: boolean;
} {
  const debits = Money.sum(lines.map((l) => l.debit ?? '0'));
  const credits = Money.sum(lines.map((l) => l.credit ?? '0'));
  const difference = debits.minus(credits);
  return { debits, credits, difference, balanced: difference.isZero() };
}
