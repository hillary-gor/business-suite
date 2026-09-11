'use server';

/**
 * Server actions for accounting.
 *
 * Every action follows the same four steps, in the same order, and there are
 * no exceptions to it:
 *
 *   1. authorise, which establishes who is calling and refuses if they may not
 *   2. parse, which rejects malformed input at the boundary
 *   3. call a module function, which calls a database function
 *   4. return a result the form can render, or a message the user can act on
 *
 * The uniformity is the safety property. A reviewer can check that an action
 * is safe by confirming it has these four steps in this order, without reading
 * the rest of the file.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { userMessage } from '@/server/db/errors';
import * as posting from '@/server/modules/accounting/posting';
import * as periods from '@/server/modules/accounting/periods';
import * as openingBalances from '@/server/modules/accounting/opening-balances';
import {
  closePeriodInput,
  fieldErrors,
  postJournalInput,
  reopenPeriodInput,
  reverseJournalInput,
  revalueFxInput,
} from '@/server/modules/accounting/schemas';

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fields?: Record<string, string> };

/**
 * Wraps an action so a thrown error becomes a result rather than an unhandled
 * rejection, and so nothing internal reaches the browser. The full error is
 * logged; the user gets the sentence they need.
 */
async function run<T>(
  label: string,
  work: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await work();
  } catch (error) {
    console.error(`[action:${label}]`, error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function postJournalAction(
  raw: unknown,
): Promise<ActionResult<{ entryId: string; entryNo: string; wasReplay: boolean }>> {
  return run('postJournal', async () => {
    const { context } = await authorise(Permission.GlPostJournal);

    const parsed = postJournalInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'The entry could not be posted. Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }

    const result = await posting.postJournal(context, parsed.data);

    revalidatePath('/accounting/journals');
    revalidatePath('/accounting/trial-balance');

    return {
      ok: true,
      data: result,
      message: result.wasReplay
        ? `This entry had already been posted as ${result.entryNo}. Nothing was posted twice.`
        : `Posted as ${result.entryNo}.`,
    };
  });
}

export async function reverseJournalAction(
  raw: unknown,
): Promise<ActionResult<{ entryId: string; entryNo: string }>> {
  return run('reverseJournal', async () => {
    const { context } = await authorise(Permission.GlReverseJournal);

    const parsed = reverseJournalInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'The reversal could not be posted. Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }

    const result = await posting.reverseJournal(context, parsed.data);

    revalidatePath('/accounting/journals');
    revalidatePath('/accounting/trial-balance');

    return {
      ok: true,
      data: { entryId: result.entryId, entryNo: result.entryNo },
      message: `Reversed. The correcting entry is ${result.entryNo}. Both entries remain on the ledger.`,
    };
  });
}

export async function closePeriodAction(raw: unknown): Promise<ActionResult<periods.CloseResult>> {
  return run('closePeriod', async () => {
    const { context } = await authorise(Permission.GlClosePeriod);

    const parsed = closePeriodInput.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Choose a period to close.' };
    }

    const result = await periods.closePeriod(context, parsed.data.periodId);

    revalidatePath('/accounting/periods');
    revalidatePath('/accounting/trial-balance');

    return {
      ok: true,
      data: result,
      message: `${result.periodName} is closed. Balances for ${result.snapshotAccounts} accounts were snapshotted.`,
    };
  });
}

export async function reopenPeriodAction(raw: unknown): Promise<ActionResult> {
  return run('reopenPeriod', async () => {
    // Deliberately a separate permission from closing. Reopening a closed
    // period changes numbers that have already been reported, and the audit
    // log records who did it and why.
    const { context } = await authorise(Permission.GlReopenPeriod);

    const parsed = reopenPeriodInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'The period was not reopened.',
        fields: fieldErrors(parsed.error),
      };
    }

    await periods.reopenPeriod(context, parsed.data.periodId, parsed.data.reason);

    revalidatePath('/accounting/periods');

    return {
      ok: true,
      data: undefined,
      message: 'The period is open again. The reason has been recorded against your name.',
    };
  });
}

export async function revalueFxAction(
  raw: unknown,
): Promise<ActionResult<periods.RevaluationSummary>> {
  return run('revalueFx', async () => {
    const { context } = await authorise(Permission.GlRevalueFx);

    const parsed = revalueFxInput.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Choose a period to revalue.' };
    }

    const result = await periods.revalueFx(context, parsed.data.periodId, {
      rateType: parsed.data.rateType,
    });

    revalidatePath('/accounting/trial-balance');
    revalidatePath('/accounting/journals');

    return {
      ok: true,
      data: result,
      message: result.entryNo
        ? `Revalued at the ${result.rateType.toLowerCase()} rate as at ${result.asAt}. The adjustment was posted as ${result.entryNo}.`
        : `Nothing needed revaluing at ${result.asAt}, so no entry was posted.`,
    };
  });
}

const createBatchInput = z.object({
  cutoverDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the cutover date as YYYY-MM-DD'),
  sourceSystem: z.string().trim().min(2).max(100).default('QuickBooks Desktop'),
  notes: z.string().trim().max(2000).optional(),
});

export async function createOpeningBatchAction(
  raw: unknown,
): Promise<ActionResult<{ batchId: string }>> {
  return run('createOpeningBatch', async () => {
    const { context } = await authorise(Permission.GlImportOpeningBalances);

    const parsed = createBatchInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'The batch could not be created.',
        fields: fieldErrors(parsed.error),
      };
    }

    const batchId = await openingBalances.createBatch(context, parsed.data);
    revalidatePath('/accounting/opening-balances');

    return { ok: true, data: { batchId }, message: 'Batch created. Load the staging data next.' };
  });
}

const loadCsvInput = z.object({
  batchId: z.string().uuid(),
  dataset: z.enum(['trial-balance', 'receivables', 'payables', 'inventory']),
  csv: z.string().min(1, 'Paste the exported data or choose a file'),
});

/** Column headers each dataset must supply, matched case- and space-insensitively. */
const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  'trial-balance': ['account_code', 'debit', 'credit'],
  receivables: [
    'customer_code',
    'document_no',
    'document_date',
    'due_date',
    'currency_code',
    'amount_txn',
    'amount_base',
  ],
  payables: [
    'supplier_code',
    'document_no',
    'document_date',
    'due_date',
    'currency_code',
    'amount_txn',
    'amount_base',
  ],
  inventory: ['part_number', 'warehouse_code', 'condition_code', 'quantity', 'unit_cost_base'],
};

export async function loadOpeningDataAction(
  raw: unknown,
): Promise<ActionResult<{ rowsLoaded: number; warnings: string[] }>> {
  return run('loadOpeningData', async () => {
    const { context } = await authorise(Permission.GlImportOpeningBalances);

    const parsed = loadCsvInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'The data could not be loaded.',
        fields: fieldErrors(parsed.error),
      };
    }

    const { batchId, dataset, csv } = parsed.data;
    const columns = REQUIRED_COLUMNS[dataset] as readonly string[];
    const { rows, errors } = openingBalances.parseCsv(csv, columns);

    if (errors.length > 0 && rows.length === 0) {
      return { ok: false, error: errors.join(' ') };
    }

    let rowsLoaded = 0;

    switch (dataset) {
      case 'trial-balance':
        rowsLoaded = await openingBalances.loadTrialBalance(
          context,
          batchId,
          rows.map((r) => ({
            accountCode: r.account_code ?? '',
            debit: r.debit || '0',
            credit: r.credit || '0',
            memo: r.memo,
          })),
        );
        break;
      case 'receivables':
        rowsLoaded = await openingBalances.loadReceivables(
          context,
          batchId,
          rows.map((r) => ({
            customerCode: r.customer_code ?? '',
            documentNo: r.document_no ?? '',
            documentDate: r.document_date ?? '',
            dueDate: r.due_date ?? '',
            currencyCode: r.currency_code ?? 'KES',
            amountTxn: r.amount_txn ?? '0',
            amountBase: r.amount_base ?? '0',
          })),
        );
        break;
      case 'payables':
        rowsLoaded = await openingBalances.loadPayables(
          context,
          batchId,
          rows.map((r) => ({
            supplierCode: r.supplier_code ?? '',
            documentNo: r.document_no ?? '',
            documentDate: r.document_date ?? '',
            dueDate: r.due_date ?? '',
            currencyCode: r.currency_code ?? 'KES',
            amountTxn: r.amount_txn ?? '0',
            amountBase: r.amount_base ?? '0',
          })),
        );
        break;
      case 'inventory':
        rowsLoaded = await openingBalances.loadInventory(
          context,
          batchId,
          rows.map((r) => ({
            partNumber: r.part_number ?? '',
            warehouseCode: r.warehouse_code ?? '',
            binCode: r.bin_code,
            conditionCode: r.condition_code ?? '',
            serialNumber: r.serial_number,
            lotNumber: r.lot_number,
            quantity: r.quantity ?? '0',
            unitCostBase: r.unit_cost_base ?? '0',
          })),
        );
        break;
    }

    revalidatePath('/accounting/opening-balances');

    return {
      ok: true,
      data: { rowsLoaded, warnings: errors },
      message: `Loaded ${rowsLoaded} row(s). Run the validation before posting.`,
    };
  });
}

export async function validateOpeningBalancesAction(
  raw: unknown,
): Promise<ActionResult<openingBalances.ValidationResult[]>> {
  return run('validateOpeningBalances', async () => {
    const { context } = await authorise(Permission.GlImportOpeningBalances);

    const parsed = z.object({ batchId: z.string().uuid() }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: 'Choose a batch to validate.' };

    const results = await openingBalances.validate(context, parsed.data.batchId);
    const failed = results.filter((r) => !r.passed);

    return {
      ok: true,
      data: results,
      message:
        failed.length === 0
          ? 'Every check passed. The batch is ready to post.'
          : `${failed.length} of ${results.length} checks failed. Fix the source data and load it again.`,
    };
  });
}

export async function postOpeningBalancesAction(
  raw: unknown,
): Promise<ActionResult<{ entryId: string; entryNo: string }>> {
  return run('postOpeningBalances', async () => {
    // A separate, more restricted permission than loading the data. Loading is
    // clerical; posting sets the opening position of the business once.
    const { context } = await authorise(Permission.GlPostOpeningBalances);

    const parsed = z.object({ batchId: z.string().uuid() }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: 'Choose a batch to post.' };

    const result = await openingBalances.post(context, parsed.data.batchId);

    revalidatePath('/accounting/opening-balances');
    revalidatePath('/accounting/trial-balance');

    return {
      ok: true,
      data: result,
      message: `Opening balances posted as ${result.entryNo}. This cannot be repeated.`,
    };
  });
}
