/**
 * The QuickBooks cutover.
 *
 * This runs once in the life of the business, and if it is wrong then every
 * reconciliation afterwards is wrong by the same amount and nobody will be
 * able to say why. So the shape of it is deliberately awkward: data is staged,
 * validated, shown to a human, and only then posted. There is no single call
 * that takes a spreadsheet and books it.
 *
 * The validation lives in `gl.validate_opening_balances`, and posting refuses
 * while any check fails. This layer parses the file and presents the results.
 */
import {
  withTransaction,
  withReadOnlyTransaction,
  type RequestContext,
} from '@/server/db/transaction';
import { BusinessRuleError } from '@/server/db/errors';
import { Money } from '@/lib/money';

export interface ValidationResult {
  readonly checkName: string;
  readonly passed: boolean;
  readonly expected: string | null;
  readonly actual: string | null;
  readonly difference: string | null;
  readonly detail: string | null;
}

export interface BatchSummary {
  readonly id: string;
  readonly cutoverDate: string;
  readonly sourceSystem: string;
  readonly status: string;
  readonly createdAt: string;
  readonly journalEntryNo: string | null;
  readonly counts: {
    readonly trialBalanceLines: number;
    readonly receivables: number;
    readonly payables: number;
    readonly inventory: number;
  };
  readonly totals: {
    readonly debits: string;
    readonly credits: string;
    readonly receivables: string;
    readonly payables: string;
    readonly inventory: string;
  };
}

export async function createBatch(
  context: RequestContext,
  input: { cutoverDate: string; sourceSystem: string; notes?: string },
): Promise<string> {
  return withTransaction(context, async (tx) => {
    const existing = await tx.maybeOne<{ id: string }>(
      `select id from gl.ob_batch where entity_id = $1 and status = 'POSTED'`,
      [context.entityId],
    );
    if (existing) {
      throw new BusinessRuleError(
        'Opening balances have already been posted for this entity. ' +
          'A second cutover would double the opening position.',
      );
    }

    const row = await tx.one<{ id: string }>(
      `insert into gl.ob_batch (entity_id, cutover_date, source_system, description)
       values ($1, $2::date, $3, coalesce($4, ''))
       returning id`,
      [context.entityId, input.cutoverDate, input.sourceSystem, input.notes ?? null],
    );
    return row.id;
  });
}

/**
 * Loads staged rows for a batch.
 *
 * Replaces whatever was there rather than appending, because the realistic
 * workflow is export, load, look at the errors, fix the spreadsheet, load
 * again. Appending would silently double the second attempt.
 */
export async function loadTrialBalance(
  context: RequestContext,
  batchId: string,
  lines: ReadonlyArray<{
    accountCode: string;
    debit: string;
    credit: string;
    memo?: string;
  }>,
): Promise<number> {
  return withTransaction(context, async (tx) => {
    await assertBatchOpen(tx, context, batchId);
    await tx.query('delete from gl.ob_trial_balance_line where batch_id = $1', [batchId]);

    let lineNo = 0;
    for (const line of lines) {
      lineNo += 1;
      await tx.query(
        `insert into gl.ob_trial_balance_line
           (batch_id, line_no, account_code, debit, credit, memo)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          batchId,
          lineNo,
          line.accountCode.trim(),
          Money.from(line.debit || '0').toDatabase(),
          Money.from(line.credit || '0').toDatabase(),
          line.memo?.trim() || null,
        ],
      );
    }
    return lineNo;
  });
}

export async function loadReceivables(
  context: RequestContext,
  batchId: string,
  items: ReadonlyArray<{
    customerCode: string;
    documentNo: string;
    documentDate: string;
    dueDate: string;
    currencyCode: string;
    amountTxn: string;
    amountBase: string;
  }>,
): Promise<number> {
  return withTransaction(context, async (tx) => {
    await assertBatchOpen(tx, context, batchId);
    await tx.query('delete from gl.ob_ar_open_item where batch_id = $1', [batchId]);

    for (const item of items) {
      await tx.query(
        `insert into gl.ob_ar_open_item
           (batch_id, customer_code, document_no, document_date, due_date,
            currency_code, amount_txn, amount_base)
         values ($1, $2, $3, $4::date, $5::date, $6, $7, $8)`,
        [
          batchId,
          item.customerCode.trim(),
          item.documentNo.trim(),
          item.documentDate,
          item.dueDate,
          item.currencyCode.trim().toUpperCase(),
          Money.from(item.amountTxn).toDatabase(),
          Money.from(item.amountBase).toDatabase(),
        ],
      );
    }
    return items.length;
  });
}

export async function loadPayables(
  context: RequestContext,
  batchId: string,
  items: ReadonlyArray<{
    supplierCode: string;
    documentNo: string;
    documentDate: string;
    dueDate: string;
    currencyCode: string;
    amountTxn: string;
    amountBase: string;
  }>,
): Promise<number> {
  return withTransaction(context, async (tx) => {
    await assertBatchOpen(tx, context, batchId);
    await tx.query('delete from gl.ob_ap_open_item where batch_id = $1', [batchId]);

    for (const item of items) {
      await tx.query(
        `insert into gl.ob_ap_open_item
           (batch_id, supplier_code, document_no, document_date, due_date,
            currency_code, amount_txn, amount_base)
         values ($1, $2, $3, $4::date, $5::date, $6, $7, $8)`,
        [
          batchId,
          item.supplierCode.trim(),
          item.documentNo.trim(),
          item.documentDate,
          item.dueDate,
          item.currencyCode.trim().toUpperCase(),
          Money.from(item.amountTxn).toDatabase(),
          Money.from(item.amountBase).toDatabase(),
        ],
      );
    }
    return items.length;
  });
}

export async function loadInventory(
  context: RequestContext,
  batchId: string,
  lines: ReadonlyArray<{
    partNumber: string;
    warehouseCode: string;
    binCode?: string;
    conditionCode: string;
    serialNumber?: string;
    lotNumber?: string;
    quantity: string;
    unitCostBase: string;
  }>,
): Promise<number> {
  return withTransaction(context, async (tx) => {
    await assertBatchOpen(tx, context, batchId);
    await tx.query('delete from gl.ob_inventory_line where batch_id = $1', [batchId]);

    for (const line of lines) {
      await tx.query(
        `insert into gl.ob_inventory_line
           (batch_id, part_number, warehouse_code, bin_code, condition_code,
            serial_number, lot_number, quantity, unit_cost_base)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          batchId,
          line.partNumber.trim(),
          line.warehouseCode.trim(),
          line.binCode?.trim() || null,
          line.conditionCode.trim().toUpperCase(),
          line.serialNumber?.trim() || null,
          line.lotNumber?.trim() || null,
          line.quantity,
          Money.from(line.unitCostBase).toDatabase(),
        ],
      );
    }
    return lines.length;
  });
}

export async function validate(
  context: RequestContext,
  batchId: string,
): Promise<ValidationResult[]> {
  return withReadOnlyTransaction(context, async (tx) => {
    const rows = await tx.query<{
      check_name: string;
      passed: boolean;
      expected: string | null;
      actual: string | null;
      difference: string | null;
      detail: string | null;
    }>(
      `select check_name, passed, expected, actual, difference, detail
         from gl.validate_opening_balances($1)`,
      [batchId],
    );

    return rows.map((r) => ({
      checkName: r.check_name,
      passed: r.passed,
      expected: r.expected,
      actual: r.actual,
      difference: r.difference,
      detail: r.detail,
    }));
  });
}

/**
 * Posts the cutover.
 *
 * Validation is run again inside the database transaction. The user has
 * already seen the results, but between looking at them and pressing the
 * button someone could have changed a master record, and this is not a
 * decision to take on stale information.
 */
export async function post(
  context: RequestContext,
  batchId: string,
): Promise<{ entryId: string; entryNo: string }> {
  return withTransaction(context, async (tx) => {
    const entryId = await tx.scalar<string>('select gl.post_opening_balances($1)', [batchId]);
    const entry = await tx.one<{ entry_no: string }>(
      'select entry_no from gl.journal_entry where id = $1',
      [entryId],
    );
    return { entryId, entryNo: entry.entry_no };
  });
}

export async function getBatch(
  context: RequestContext,
  batchId: string,
): Promise<BatchSummary | null> {
  return withReadOnlyTransaction(context, async (tx) => {
    const row = await tx.maybeOne<{
      id: string;
      cutover_date: string;
      source_system: string;
      status: string;
      created_at: string;
      journal_entry_no: string | null;
      tb_lines: string;
      ar_count: string;
      ap_count: string;
      inv_count: string;
      total_debits: string;
      total_credits: string;
      total_ar: string;
      total_ap: string;
      total_inv: string;
    }>(
      `select b.id,
              to_char(b.cutover_date, 'YYYY-MM-DD') as cutover_date,
              b.source_system,
              b.status::text,
              to_char(b.created_at, 'YYYY-MM-DD HH24:MI') as created_at,
              e.entry_no as journal_entry_no,
              (select count(*) from gl.ob_trial_balance_line t where t.batch_id = b.id) as tb_lines,
              (select count(*) from gl.ob_ar_open_item a where a.batch_id = b.id) as ar_count,
              (select count(*) from gl.ob_ap_open_item a where a.batch_id = b.id) as ap_count,
              (select count(*) from gl.ob_inventory_line i where i.batch_id = b.id) as inv_count,
              (select coalesce(sum(t.debit), 0) from gl.ob_trial_balance_line t
                where t.batch_id = b.id) as total_debits,
              (select coalesce(sum(t.credit), 0) from gl.ob_trial_balance_line t
                where t.batch_id = b.id) as total_credits,
              (select coalesce(sum(a.amount_base), 0) from gl.ob_ar_open_item a
                where a.batch_id = b.id) as total_ar,
              (select coalesce(sum(a.amount_base), 0) from gl.ob_ap_open_item a
                where a.batch_id = b.id) as total_ap,
              (select coalesce(sum(i.quantity * i.unit_cost_base), 0)
                 from gl.ob_inventory_line i where i.batch_id = b.id) as total_inv
         from gl.ob_batch b
         left join gl.journal_entry e on e.id = b.journal_entry_id
        where b.id = $1 and b.entity_id = $2`,
      [batchId, context.entityId],
    );

    if (!row) return null;

    return {
      id: row.id,
      cutoverDate: row.cutover_date,
      sourceSystem: row.source_system,
      status: row.status,
      createdAt: row.created_at,
      journalEntryNo: row.journal_entry_no,
      counts: {
        trialBalanceLines: Number(row.tb_lines),
        receivables: Number(row.ar_count),
        payables: Number(row.ap_count),
        inventory: Number(row.inv_count),
      },
      totals: {
        debits: row.total_debits,
        credits: row.total_credits,
        receivables: row.total_ar,
        payables: row.total_ap,
        inventory: row.total_inv,
      },
    };
  });
}

export async function listBatches(context: RequestContext): Promise<BatchSummary[]> {
  const ids = await withReadOnlyTransaction(context, async (tx) => {
    const rows = await tx.query<{ id: string }>(
      'select id from gl.ob_batch where entity_id = $1 order by created_at desc',
      [context.entityId],
    );
    return rows.map((r) => r.id);
  });

  const batches = await Promise.all(ids.map((id) => getBatch(context, id)));
  return batches.filter((b): b is BatchSummary => b !== null);
}

async function assertBatchOpen(
  tx: {
    maybeOne: <T extends Record<string, unknown>>(
      sql: string,
      params: unknown[],
    ) => Promise<T | null>;
  },
  context: RequestContext,
  batchId: string,
): Promise<void> {
  const batch = await tx.maybeOne<{ status: string }>(
    'select status::text as status from gl.ob_batch where id = $1 and entity_id = $2',
    [batchId, context.entityId],
  );
  if (!batch) throw new BusinessRuleError('That import batch does not exist');
  if (batch.status === 'POSTED') {
    throw new BusinessRuleError('That batch has been posted and can no longer be changed');
  }
}

/**
 * Parses a pasted or uploaded CSV.
 *
 * Deliberately strict about the header row: a column silently ignored because
 * it was spelled differently is how an entire currency column goes missing
 * from an import and nobody notices until the FX revaluation looks wrong.
 */
export function parseCsv(
  text: string,
  expectedColumns: readonly string[],
): { rows: Array<Record<string, string>>; errors: string[] } {
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { rows: [], errors: ['The file is empty'] };

  const header = splitCsvLine(lines[0] as string).map((h) => normaliseHeader(h));
  const missing = expectedColumns.filter((c) => !header.includes(normaliseHeader(c)));
  if (missing.length > 0) {
    errors.push(
      `The file is missing these columns: ${missing.join(', ')}. ` + `Found: ${header.join(', ')}.`,
    );
    return { rows: [], errors };
  }

  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i] as string);
    if (values.length !== header.length) {
      errors.push(`Line ${i + 1} has ${values.length} values but the header has ${header.length}.`);
      continue;
    }
    const row: Record<string, string> = {};
    header.forEach((key, index) => {
      row[key] = (values[index] ?? '').trim();
    });
    rows.push(row);
  }

  return { rows, errors };
}

function normaliseHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Handles quoted fields, which matters because descriptions contain commas. */
function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}
