/**
 * The trust boundary.
 *
 * Everything arriving from a browser is parsed here before it reaches a
 * function that can write. The database validates all of this again — it has
 * to, since it is the real authority — but validating at the edge means the
 * user gets a sentence about the field they got wrong rather than a Postgres
 * error about a constraint they have never heard of.
 *
 * Amounts are strings throughout. A JSON number is a double, and accepting one
 * here would lose precision before any of the careful work downstream begins.
 */
import { z } from 'zod';
import { Money } from '@/lib/money';

/** A decimal amount as text. Refuses anything that is not exactly a number. */
export const amountString = z
  .string()
  .trim()
  .min(1, 'Enter an amount')
  .refine((value) => /^-?\d{1,15}(\.\d{1,4})?$/.test(value.replace(/,/g, '')), {
    message: 'Enter an amount with up to four decimal places',
  })
  .transform((value) => Money.from(value).toDatabase());

export const positiveAmount = amountString.refine((value) => Money.from(value).isPositive(), {
  message: 'The amount must be greater than zero',
});

export const nonNegativeAmount = amountString.refine((value) => !Money.from(value).isNegative(), {
  message: 'The amount cannot be negative',
});

export const quantityString = z
  .string()
  .trim()
  .min(1, 'Enter a quantity')
  .refine((value) => /^-?\d{1,15}(\.\d{1,6})?$/.test(value.replace(/,/g, '')), {
    message: 'Enter a quantity with up to six decimal places',
  });

export const uuid = z.string().uuid('That is not a valid identifier');

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date as YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'That is not a real date');

export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .length(3, 'A currency code is three letters');

export const fxRate = z
  .string()
  .trim()
  .refine((value) => /^\d{1,11}(\.\d{1,8})?$/.test(value), 'Enter a rate with up to eight decimals')
  .refine((value) => Money.from(value).isPositive(), 'An exchange rate must be greater than zero');

/**
 * One line of a manual journal.
 *
 * A line carries either a debit or a credit, and the refinement below is the
 * first place that is enforced. Both or neither is almost always a
 * misunderstanding of the form rather than an attack, and it deserves a clear
 * message.
 */
export const journalLineInput = z
  .object({
    accountId: uuid,
    description: z.string().trim().max(500).optional(),
    debit: nonNegativeAmount.optional(),
    credit: nonNegativeAmount.optional(),
    currencyCode: currencyCode.optional(),
    fxRate: fxRate.optional(),
    // Analysis dimensions. An account may require one of these, in which case
    // the posting engine refuses a line that omits it; that is what keeps a
    // control account reconcilable to its sub-ledger.
    customerId: uuid.optional(),
    supplierId: uuid.optional(),
    warehouseId: uuid.optional(),
    itemId: uuid.optional(),
    costCentre: z.string().trim().max(50).optional(),
    projectCode: z.string().trim().max(50).optional(),
  })
  .refine(
    (line) => {
      const debit = line.debit ? Money.from(line.debit) : Money.zero();
      const credit = line.credit ? Money.from(line.credit) : Money.zero();
      return debit.isPositive() !== credit.isPositive();
    },
    { message: 'Each line needs either a debit or a credit, not both and not neither' },
  );

export type JournalLineInput = z.infer<typeof journalLineInput>;

/**
 * A manual journal.
 *
 * Two lines minimum, because a single-sided entry cannot balance and there is
 * no point troubling the database with it. The narrative is required and has a
 * floor of ten characters: "adjustment" tells an auditor nothing, and a
 * journal nobody can explain in two years is a journal that will be questioned
 * and cannot be defended.
 */
export const postJournalInput = z
  .object({
    entryDate: isoDate,
    description: z
      .string()
      .trim()
      .min(10, 'Explain what this entry is for, in at least a few words')
      .max(1000),
    reference: z.string().trim().max(100).optional(),
    currencyCode: currencyCode.default('KES'),
    fxRate: fxRate.optional(),
    lines: z.array(journalLineInput).min(2, 'A journal needs at least two lines'),
    idempotencyKey: z.string().trim().min(8).max(200).optional(),
  })
  .refine(
    (entry) => {
      const debits = Money.sum(entry.lines.map((l) => l.debit ?? '0'));
      const credits = Money.sum(entry.lines.map((l) => l.credit ?? '0'));
      return debits.equals(credits);
    },
    { message: 'The entry does not balance. Total debits must equal total credits.' },
  )
  .refine((entry) => Money.sum(entry.lines.map((l) => l.debit ?? '0')).isPositive(), {
    message: 'An entry of zero has no effect and cannot be posted',
  });

export type PostJournalInput = z.infer<typeof postJournalInput>;

export const reverseJournalInput = z.object({
  entryId: uuid,
  reason: z
    .string()
    .trim()
    .min(10, 'Record why this entry is being reversed, in at least a few words')
    .max(1000),
  reversalDate: isoDate.optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

export const createAccountInput = z.object({
  code: z
    .string()
    .trim()
    .regex(
      /^\d{4}(-\d{2})?$/,
      'An account code is four digits, optionally with a two-digit suffix',
    ),
  name: z.string().trim().min(3, 'Give the account a name').max(200),
  accountType: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  parentId: uuid.optional(),
  isSummary: z.boolean().default(false),
  isContra: z.boolean().default(false),
  isMonetary: z.boolean().default(false),
  currencyCode: currencyCode.optional(),
  controlType: z
    .enum([
      'NONE',
      'RECEIVABLES',
      'PAYABLES',
      'INVENTORY',
      'BANK',
      'CASH',
      'TAX',
      'RETAINED_EARNINGS',
      'FX_GAIN_LOSS',
      'ROUNDING',
      'SUSPENSE',
    ])
    .default('NONE'),
  requiresCustomer: z.boolean().default(false),
  requiresSupplier: z.boolean().default(false),
  requiresWarehouse: z.boolean().default(false),
  description: z.string().trim().max(1000).optional(),
});

export const trialBalanceQuery = z.object({
  periodId: uuid.optional(),
  asAt: isoDate.optional(),
  includeZeroBalances: z.boolean().default(false),
});

export const ledgerDetailQuery = z.object({
  accountId: uuid,
  fromDate: isoDate,
  toDate: isoDate,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(500).default(100),
});

export const closePeriodInput = z.object({
  periodId: uuid,
});

export const reopenPeriodInput = z.object({
  periodId: uuid,
  reason: z
    .string()
    .trim()
    .min(20, 'Reopening a closed period is exceptional. Record the full reason.')
    .max(1000),
});

export const revalueFxInput = z.object({
  periodId: uuid,
  // The date is derived from the period by gl.revalue_fx, so it cannot be
  // pointed at a date outside the period being revalued.
  rateType: z.enum(['CLOSING', 'SPOT', 'AVERAGE']).default('CLOSING'),
});

/** Formats Zod issues as a field-keyed map the forms can render inline. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : 'form';
    result[key] ??= issue.message;
  }
  return result;
}
