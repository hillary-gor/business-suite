/**
 * Reads for the accounting screens.
 *
 * All of these run in read-only transactions, so a reporting query cannot
 * write even if someone later edits the SQL carelessly. Amounts come back as
 * strings and stay strings all the way to the browser.
 */
import { withReadOnlyTransaction, type RequestContext } from '@/server/db/transaction';

export interface AccountRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly accountType: string;
  readonly normalBalance: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly isSummary: boolean;
  readonly isContra: boolean;
  readonly isActive: boolean;
  readonly controlType: string;
  readonly currencyCode: string | null;
  readonly requiresCustomer: boolean;
  readonly requiresSupplier: boolean;
  readonly requiresWarehouse: boolean;
}

/** The chart of accounts in code order, with hierarchy depth for indenting. */
export async function listAccounts(
  context: RequestContext,
  options: { includeInactive?: boolean } = {},
): Promise<AccountRow[]> {
  return withReadOnlyTransaction(context, async (tx) => {
    const rows = await tx.query<{
      id: string;
      code: string;
      name: string;
      account_type: string;
      normal_balance: string;
      parent_id: string | null;
      depth: string;
      is_summary: boolean;
      is_contra: boolean;
      is_active: boolean;
      control_type: string | null;
      currency_code: string | null;
      requires_customer: boolean;
      requires_supplier: boolean;
      requires_warehouse: boolean;
    }>(
      // A summary account is simply one that cannot be posted to; the schema
      // records the capability rather than the label, which is the useful way
      // round because it is what the posting engine actually checks.
      `with recursive tree as (
         select a.id, a.code, a.name, a.account_type, a.normal_balance, a.parent_id,
                a.is_postable, a.is_contra, a.is_active, a.control_type, a.currency_code,
                a.requires_customer, a.requires_supplier, a.requires_warehouse,
                0 as depth
           from gl.accounts a
          where a.entity_id = $1 and a.parent_id is null
         union all
         select a.id, a.code, a.name, a.account_type, a.normal_balance, a.parent_id,
                a.is_postable, a.is_contra, a.is_active, a.control_type, a.currency_code,
                a.requires_customer, a.requires_supplier, a.requires_warehouse,
                t.depth + 1
           from gl.accounts a
           join tree t on a.parent_id = t.id
          where a.entity_id = $1
       )
       select id, code, name, account_type::text as account_type,
              normal_balance::text as normal_balance, parent_id, depth,
              not is_postable as is_summary, is_contra, is_active,
              control_type::text as control_type, currency_code,
              requires_customer, requires_supplier, requires_warehouse
         from tree
        where ($2 or is_active)
        order by code`,
      [context.entityId, options.includeInactive ?? false],
    );

    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      accountType: r.account_type,
      normalBalance: r.normal_balance,
      parentId: r.parent_id,
      depth: Number(r.depth),
      isSummary: r.is_summary,
      isContra: r.is_contra,
      isActive: r.is_active,
      controlType: r.control_type ?? 'NONE',
      currencyCode: r.currency_code,
      requiresCustomer: r.requires_customer,
      requiresSupplier: r.requires_supplier,
      requiresWarehouse: r.requires_warehouse,
    }));
  });
}

export interface TrialBalanceRow {
  readonly accountId: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly accountType: string;
  readonly openingBase: string;
  readonly periodDebit: string;
  readonly periodCredit: string;
  readonly closingBase: string;
}

export async function getTrialBalance(
  context: RequestContext,
  periodId: string,
  options: { includeZeroBalances?: boolean } = {},
): Promise<{ rows: TrialBalanceRow[]; totalDebits: string; totalCredits: string }> {
  return withReadOnlyTransaction(context, async (tx) => {
    const rows = await tx.query<{
      account_id: string;
      account_code: string;
      account_name: string;
      account_type: string;
      opening_base: string;
      period_debit: string;
      period_credit: string;
      closing_base: string;
    }>(
      `select account_id, account_code, account_name, account_type::text as account_type,
              opening_base, period_debit, period_credit, closing_base
         from gl.trial_balance($1, $2)
        where $3
           or opening_base <> 0 or period_debit <> 0 or period_credit <> 0 or closing_base <> 0
        order by account_code`,
      [context.entityId, periodId, options.includeZeroBalances ?? false],
    );

    const totals = await tx.one<{ total_debits: string; total_credits: string }>(
      `select coalesce(sum(period_debit), 0) as total_debits,
              coalesce(sum(period_credit), 0) as total_credits
         from gl.trial_balance($1, $2)`,
      [context.entityId, periodId],
    );

    return {
      rows: rows.map((r) => ({
        accountId: r.account_id,
        accountCode: r.account_code,
        accountName: r.account_name,
        accountType: r.account_type,
        openingBase: r.opening_base,
        periodDebit: r.period_debit,
        periodCredit: r.period_credit,
        closingBase: r.closing_base,
      })),
      totalDebits: totals.total_debits,
      totalCredits: totals.total_credits,
    };
  });
}

export interface LedgerLine {
  readonly lineId: string;
  readonly entryId: string;
  readonly entryNo: string;
  readonly entryDate: string;
  readonly description: string;
  readonly lineDescription: string | null;
  readonly reference: string | null;
  readonly sourceType: string;
  readonly currencyCode: string;
  readonly debitTxn: string;
  readonly creditTxn: string;
  readonly debitBase: string;
  readonly creditBase: string;
  readonly runningBalance: string;
  readonly counterparty: string | null;
  readonly isReversal: boolean;
}

/**
 * The detail behind a trial balance figure, with a running balance.
 *
 * The running balance is computed in the database with a window function
 * rather than accumulated in TypeScript, because the whole point of the page
 * is to drill from a total to the transactions that make it up, and a total
 * computed in a different place with different arithmetic is how those two
 * numbers come to disagree.
 */
export async function getLedgerDetail(
  context: RequestContext,
  params: { accountId: string; fromDate: string; toDate: string; page: number; pageSize: number },
): Promise<{ lines: LedgerLine[]; openingBalance: string; total: number }> {
  return withReadOnlyTransaction(context, async (tx) => {
    const opening = await tx.scalar<string>(
      'select gl.account_balance_as_at($1, $2, ($3::date - 1))',
      [context.entityId, params.accountId, params.fromDate],
    );

    const total = await tx.scalar<string>(
      `select count(*) from gl.journal_entry_line
        where entity_id = $1 and account_id = $2 and entry_date between $3 and $4`,
      [context.entityId, params.accountId, params.fromDate, params.toDate],
    );

    const rows = await tx.query<{
      line_id: string;
      entry_id: string;
      entry_no: string;
      entry_date: string;
      description: string;
      line_description: string | null;
      reference: string | null;
      source_type: string;
      currency_code: string;
      debit_txn: string;
      credit_txn: string;
      debit_base: string;
      credit_base: string;
      running_balance: string;
      counterparty: string | null;
      is_reversal: boolean;
    }>(
      `select l.id as line_id,
              e.id as entry_id,
              e.entry_no,
              to_char(l.entry_date, 'YYYY-MM-DD') as entry_date,
              e.description,
              l.memo as line_description,
              coalesce(e.source_document_no, e.memo) as reference,
              e.source_type::text,
              l.currency_code,
              l.debit_txn, l.credit_txn, l.debit_base, l.credit_base,
              $5::numeric + sum(l.debit_base - l.credit_base)
                over (order by l.entry_date, e.entry_no, l.line_no
                      rows between unbounded preceding and current row) as running_balance,
              coalesce(c.legal_name, s.legal_name, w.name) as counterparty,
              e.reversal_of_entry_id is not null as is_reversal
         from gl.journal_entry_line l
         join gl.journal_entry e on e.id = l.entry_id
         left join app.customers c on c.id = l.customer_id
         left join app.suppliers s on s.id = l.supplier_id
         left join inv.warehouses w on w.id = l.warehouse_id
        where l.entity_id = $1
          and l.account_id = $2
          and l.entry_date between $3 and $4
        order by l.entry_date, e.entry_no, l.line_no
        limit $6 offset $7`,
      [
        context.entityId,
        params.accountId,
        params.fromDate,
        params.toDate,
        opening,
        params.pageSize,
        (params.page - 1) * params.pageSize,
      ],
    );

    return {
      openingBalance: opening,
      total: Number(total),
      lines: rows.map((r) => ({
        lineId: r.line_id,
        entryId: r.entry_id,
        entryNo: r.entry_no,
        entryDate: r.entry_date,
        description: r.description,
        lineDescription: r.line_description,
        reference: r.reference,
        sourceType: r.source_type,
        currencyCode: r.currency_code,
        debitTxn: r.debit_txn,
        creditTxn: r.credit_txn,
        debitBase: r.debit_base,
        creditBase: r.credit_base,
        runningBalance: r.running_balance,
        counterparty: r.counterparty,
        isReversal: r.is_reversal,
      })),
    };
  });
}

export interface JournalSummary {
  readonly id: string;
  readonly entryNo: string;
  readonly entryDate: string;
  readonly description: string;
  readonly reference: string | null;
  readonly sourceType: string;
  readonly currencyCode: string;
  readonly totalBase: string;
  readonly lineCount: number;
  readonly postedByName: string;
  readonly postedAt: string;
  readonly isReversal: boolean;
  readonly isReversed: boolean;
}

export async function listJournalEntries(
  context: RequestContext,
  params: {
    fromDate?: string;
    toDate?: string;
    search?: string;
    sourceType?: string;
    page: number;
    pageSize: number;
  },
): Promise<{ entries: JournalSummary[]; total: number }> {
  return withReadOnlyTransaction(context, async (tx) => {
    const filters = [
      context.entityId,
      params.fromDate ?? null,
      params.toDate ?? null,
      params.search?.trim() || null,
      params.sourceType ?? null,
    ];

    const where = `
      e.entity_id = $1
      and ($2::date is null or e.entry_date >= $2::date)
      and ($3::date is null or e.entry_date <= $3::date)
      and ($4::text is null or e.entry_no ilike '%' || $4 || '%'
           or e.description ilike '%' || $4 || '%'
           or e.memo ilike '%' || $4 || '%'
           or e.source_document_no ilike '%' || $4 || '%')
      and ($5::text is null or e.source_type::text = $5)`;

    const total = await tx.scalar<string>(
      `select count(*) from gl.journal_entry e where ${where}`,
      filters,
    );

    const rows = await tx.query<{
      id: string;
      entry_no: string;
      entry_date: string;
      description: string;
      reference: string | null;
      source_type: string;
      currency_code: string;
      total_base: string;
      line_count: string;
      posted_by_name: string;
      posted_at: string;
      is_reversal: boolean;
      is_reversed: boolean;
    }>(
      // total_debit_base and line_count are maintained on the entry by the
      // posting engine, so there is no need to re-aggregate the lines here.
      `select e.id,
              e.entry_no,
              to_char(e.entry_date, 'YYYY-MM-DD') as entry_date,
              e.description,
              coalesce(e.source_document_no, e.memo) as reference,
              e.source_type::text,
              e.base_currency_code as currency_code,
              e.total_debit_base as total_base,
              e.line_count,
              coalesce(u.full_name, 'System') as posted_by_name,
              to_char(e.posted_at, 'YYYY-MM-DD HH24:MI') as posted_at,
              e.reversal_of_entry_id is not null as is_reversal,
              exists (select 1 from gl.journal_entry r where r.reversal_of_entry_id = e.id)
                as is_reversed
         from gl.journal_entry e
         left join app.users u on u.id = e.posted_by
        where ${where}
        order by e.entry_date desc, e.entry_no desc
        limit $6 offset $7`,
      [...filters, params.pageSize, (params.page - 1) * params.pageSize],
    );

    return {
      total: Number(total),
      entries: rows.map((r) => ({
        id: r.id,
        entryNo: r.entry_no,
        entryDate: r.entry_date,
        description: r.description,
        reference: r.reference,
        sourceType: r.source_type,
        currencyCode: r.currency_code,
        totalBase: r.total_base,
        lineCount: Number(r.line_count),
        postedByName: r.posted_by_name,
        postedAt: r.posted_at,
        isReversal: r.is_reversal,
        isReversed: r.is_reversed,
      })),
    };
  });
}

export async function getJournalEntry(
  context: RequestContext,
  entryId: string,
): Promise<{
  entry: JournalSummary & { reversalOfEntryNo: string | null; reversedByEntryNo: string | null };
  lines: Array<{
    lineNo: number;
    accountCode: string;
    accountName: string;
    description: string | null;
    debitTxn: string;
    creditTxn: string;
    debitBase: string;
    creditBase: string;
    currencyCode: string;
    fxRate: string;
    counterparty: string | null;
  }>;
} | null> {
  return withReadOnlyTransaction(context, async (tx) => {
    const entry = await tx.maybeOne<{
      id: string;
      entry_no: string;
      entry_date: string;
      description: string;
      reference: string | null;
      source_type: string;
      currency_code: string;
      total_base: string;
      line_count: string;
      posted_by_name: string;
      posted_at: string;
      is_reversal: boolean;
      is_reversed: boolean;
      reversal_of_entry_no: string | null;
      reversed_by_entry_no: string | null;
    }>(
      `select e.id,
              e.entry_no,
              to_char(e.entry_date, 'YYYY-MM-DD') as entry_date,
              e.description,
              coalesce(e.source_document_no, e.memo) as reference,
              e.source_type::text,
              e.base_currency_code as currency_code,
              e.total_debit_base as total_base,
              e.line_count,
              coalesce(u.full_name, 'System') as posted_by_name,
              to_char(e.posted_at, 'YYYY-MM-DD HH24:MI') as posted_at,
              e.reversal_of_entry_id is not null as is_reversal,
              exists (select 1 from gl.journal_entry r where r.reversal_of_entry_id = e.id)
                as is_reversed,
              orig.entry_no as reversal_of_entry_no,
              (select r.entry_no from gl.journal_entry r
                where r.reversal_of_entry_id = e.id limit 1) as reversed_by_entry_no
         from gl.journal_entry e
         left join app.users u on u.id = e.posted_by
         left join gl.journal_entry orig on orig.id = e.reversal_of_entry_id
        where e.id = $1 and e.entity_id = $2`,
      [entryId, context.entityId],
    );

    if (!entry) return null;

    const lines = await tx.query<{
      line_no: string;
      account_code: string;
      account_name: string;
      description: string | null;
      debit_txn: string;
      credit_txn: string;
      debit_base: string;
      credit_base: string;
      currency_code: string;
      fx_rate: string;
      counterparty: string | null;
    }>(
      `select l.line_no, a.code as account_code, a.name as account_name,
              l.memo as description,
              l.debit_txn, l.credit_txn, l.debit_base, l.credit_base,
              l.currency_code, l.fx_rate,
              coalesce(c.legal_name, s.legal_name, w.name, i.part_number) as counterparty
         from gl.journal_entry_line l
         join gl.accounts a on a.id = l.account_id
         left join app.customers c on c.id = l.customer_id
         left join app.suppliers s on s.id = l.supplier_id
         left join inv.warehouses w on w.id = l.warehouse_id
         left join inv.items i on i.id = l.item_id
        where l.entry_id = $1
        order by l.line_no`,
      [entryId],
    );

    return {
      entry: {
        id: entry.id,
        entryNo: entry.entry_no,
        entryDate: entry.entry_date,
        description: entry.description,
        reference: entry.reference,
        sourceType: entry.source_type,
        currencyCode: entry.currency_code,
        totalBase: entry.total_base,
        lineCount: Number(entry.line_count),
        postedByName: entry.posted_by_name,
        postedAt: entry.posted_at,
        isReversal: entry.is_reversal,
        isReversed: entry.is_reversed,
        reversalOfEntryNo: entry.reversal_of_entry_no,
        reversedByEntryNo: entry.reversed_by_entry_no,
      },
      lines: lines.map((l) => ({
        lineNo: Number(l.line_no),
        accountCode: l.account_code,
        accountName: l.account_name,
        description: l.description,
        debitTxn: l.debit_txn,
        creditTxn: l.credit_txn,
        debitBase: l.debit_base,
        creditBase: l.credit_base,
        currencyCode: l.currency_code,
        fxRate: l.fx_rate,
        counterparty: l.counterparty,
      })),
    };
  });
}

export interface PeriodRow {
  readonly id: string;
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: string;
  /** The fiscal year's code, such as "FY2026". Not always a bare number. */
  readonly fiscalYear: string;
}

export async function listPeriods(context: RequestContext): Promise<PeriodRow[]> {
  return withReadOnlyTransaction(context, async (tx) => {
    const rows = await tx.query<{
      id: string;
      name: string;
      start_date: string;
      end_date: string;
      status: string;
      fiscal_year: string;
    }>(
      `select p.id, p.name,
              to_char(p.start_date, 'YYYY-MM-DD') as start_date,
              to_char(p.end_date, 'YYYY-MM-DD') as end_date,
              p.status::text, y.code as fiscal_year
         from gl.fiscal_periods p
         join gl.fiscal_years y on y.id = p.fiscal_year_id
        where p.entity_id = $1
        order by p.start_date desc`,
      [context.entityId],
    );

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
      fiscalYear: r.fiscal_year,
    }));
  });
}

/** The period containing today, which is what most screens should default to. */
export async function getCurrentPeriod(context: RequestContext): Promise<PeriodRow | null> {
  const periods = await listPeriods(context);
  const today = new Date().toISOString().slice(0, 10);
  return (
    periods.find((p) => p.startDate <= today && p.endDate >= today) ??
    periods.find((p) => p.status === 'OPEN') ??
    periods[0] ??
    null
  );
}
