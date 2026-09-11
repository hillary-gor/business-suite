/**
 * Turning database errors into messages a person can act on.
 *
 * The invariants live in the database, so the database is where violations are
 * detected, and its messages are written for whoever is reading the log rather
 * than for the person who just clicked Post. This translates the ones users
 * will actually meet into plain language, and — importantly — does not
 * translate the ones they should never meet.
 *
 * An unexpected error keeps its original text. Rewriting an error nobody
 * anticipated into something reassuring is how a broken ledger stays broken
 * for a month.
 */

export class DatabaseError extends Error {
  readonly code: string;
  readonly detail?: string;

  constructor(message: string, code: string, detail?: string) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    this.detail = detail;
  }
}

/** A rule the user broke, safe to show them. */
export class BusinessRuleError extends Error {
  readonly code: string;

  constructor(message: string, code = 'business_rule') {
    super(message);
    this.name = 'BusinessRuleError';
    this.code = code;
  }
}

export class PermissionDeniedError extends Error {
  constructor(message = 'You do not have permission to do that') {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}

/** The organisation is not entitled to a product module. The session remains valid. */
export class ModuleNotEntitledError extends Error {
  readonly moduleCode: string;

  constructor(moduleCode: string, message?: string) {
    super(
      message ??
        'Your organisation does not currently have access to this area. You are still signed in.',
    );
    this.name = 'ModuleNotEntitledError';
    this.moduleCode = moduleCode;
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** The host is missing or holding the wrong DATABASE_URL. Safe to show. */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

interface PgError {
  code?: string;
  message?: string;
  detail?: string;
  constraint?: string;
  table?: string;
}

/**
 * Constraint names mapped to what the user did wrong. Keyed on the constraint
 * rather than the message text so a reworded message in a migration does not
 * silently turn a helpful error back into a raw one.
 */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  entry_lines_balance: 'The entry does not balance. Total debits must equal total credits.',
  line_single_sided: 'A line cannot be both a debit and a credit.',
  line_has_an_amount: 'Every line needs either a debit or a credit amount.',
  accounts_code_unique: 'That account code is already in use.',
  customers_code_unique: 'That customer code is already in use.',
  suppliers_code_unique: 'That supplier code is already in use.',
  items_part_number_unique: 'That part number already exists.',
  stock_units_serial_unique: 'That serial number is already recorded against this part.',
  ob_batch_single_posted_idx:
    'Opening balances have already been posted for this entity. They cannot be posted twice.',
  fx_rates_unique_per_day: 'An exchange rate for that currency pair and date already exists.',
  numbering_sequences_pkey: 'That document numbering series is already defined.',
};

/**
 * PL/pgSQL RAISE messages that are already written for users. Matched on a
 * distinctive fragment.
 */
const MESSAGE_PATTERNS: ReadonlyArray<{ pattern: RegExp; code: string }> = [
  { pattern: /is closed|is not open|period is/i, code: 'period_closed' },
  { pattern: /append-only|cannot be (updated|deleted|amended)|immutable/i, code: 'immutable' },
  { pattern: /does not balance|must equal total credits/i, code: 'unbalanced' },
  { pattern: /permission|not authorised|not authorized/i, code: 'permission_denied' },
  { pattern: /would drive .* negative|insufficient stock/i, code: 'insufficient_stock' },
  { pattern: /not releasable|quarantine|certificate/i, code: 'not_releasable' },
  { pattern: /cannot be posted|validation/i, code: 'validation_failed' },
  { pattern: /already been reversed/i, code: 'already_reversed' },
  { pattern: /summary account|postable/i, code: 'invalid_account' },
];

export function translateDatabaseError(error: unknown): Error {
  if (
    error instanceof BusinessRuleError ||
    error instanceof PermissionDeniedError ||
    error instanceof NotFoundError ||
    error instanceof DatabaseError ||
    error instanceof ConfigurationError
  ) {
    return error;
  }

  const pg = error as PgError | null;
  if (!pg || typeof pg !== 'object') {
    return error instanceof Error ? error : new Error(String(error));
  }

  const constraint = pg.constraint;
  if (constraint && CONSTRAINT_MESSAGES[constraint]) {
    return new BusinessRuleError(CONSTRAINT_MESSAGES[constraint] as string, constraint);
  }

  const message = pg.message ?? '';

  // Errors the migrations raise deliberately. RAISE EXCEPTION with no explicit
  // SQLSTATE reports P0001; check constraints report 23514; status/state
  // guards use restrict_violation (23001). All three are the database
  // enforcing a rule rather than failing.
  if (pg.code === 'P0001' || pg.code === '23514' || pg.code === '23001') {
    const matched = MESSAGE_PATTERNS.find((m) => m.pattern.test(message));
    return new BusinessRuleError(cleanUp(message), matched?.code ?? 'business_rule');
  }

  switch (pg.code) {
    case '23505':
      return new BusinessRuleError('That record already exists.', constraint ?? 'unique_violation');
    case '23503':
      return new BusinessRuleError(
        'That refers to a record which does not exist, or is still in use elsewhere.',
        constraint ?? 'foreign_key_violation',
      );
    case '23502':
      return new BusinessRuleError('A required value is missing.', 'not_null_violation');
    case '28P01':
      return new ConfigurationError(
        'The database rejected the application password. DATABASE_URL on this host must contain the skyjet_app_login password itself; Vercel does not expand ${SKYJET_APP_PASSWORD}.',
      );
    case '42501':
      return new PermissionDeniedError(
        'The application is not permitted to do that directly. It must go through a posting function.',
      );
    case '40001':
    case '40P01':
      return new DatabaseError(
        'The system was too busy to complete that safely. Please try again.',
        'serialisation_failure',
      );
    case '57014':
      return new DatabaseError(
        'That took too long and was stopped. Try narrowing the date range.',
        'statement_timeout',
      );
    default:
      // Deliberately unmodified. An error we did not anticipate must arrive in
      // the log exactly as the database wrote it.
      return new DatabaseError(message || 'Database error', pg.code ?? 'unknown', pg.detail);
  }
}

/** Strips PL/pgSQL context noise, keeping the sentence a user needs. */
function cleanUp(message: string): string {
  return (
    message
      .replace(/^ERROR:\s*/i, '')
      .split('\nCONTEXT:')[0]
      ?.trim() ?? message
  );
}

/** True when the error is safe to show verbatim in the interface. */
export function isUserFacing(error: unknown): boolean {
  return (
    error instanceof BusinessRuleError ||
    error instanceof PermissionDeniedError ||
    error instanceof ModuleNotEntitledError ||
    error instanceof NotFoundError ||
    error instanceof ConfigurationError
  );
}

/** The message to render, never leaking internals for unexpected failures. */
export function userMessage(error: unknown): string {
  if (isUserFacing(error)) return (error as Error).message;
  if (error instanceof DatabaseError && error.code === 'serialisation_failure') {
    return error.message;
  }
  return 'Something went wrong and nothing was saved. The problem has been logged.';
}
