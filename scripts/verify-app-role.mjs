#!/usr/bin/env node
/**
 * Verifies the deployed security posture, as the application actually sees it.
 *
 * tests/sql/100_security_posture.sql asserts the same rules, but it runs as
 * the database owner against a schema it just built. This connects over the
 * real transaction-mode pooler as the real application role, which is the only
 * way to prove that what is deployed matches what was designed.
 *
 * Every check is an assertion about something that must NOT be possible. A
 * pass here means the write path is genuinely the only way in.
 *
 * Usage: node scripts/verify-app-role.mjs
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const RESET = '\u001b[0m';
const RED = '\u001b[31m';
const GREEN = '\u001b[32m';
const DIM = '\u001b[2m';
const BOLD = '\u001b[1m';

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  for (const key of Object.keys(values)) {
    values[key] = values[key].replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, n) => values[n] ?? '');
  }
  return values;
}

const env = parseEnv(await readFile(path.join(process.cwd(), '.env.local'), 'utf8'));
const connectionString = env.DATABASE_URL;

if (!connectionString) {
  process.stderr.write(`${RED}DATABASE_URL is not set in .env.local.${RESET}\n`);
  process.exit(2);
}

const { default: pg } = await import('pg');
const { resolveScriptSsl } = await import('./lib/pg-ssl.mjs');
const client = new pg.Client({
  connectionString,
  application_name: 'skyjet-verify-role',
  ssl: resolveScriptSsl(connectionString),
});
await client.connect();

process.stdout.write(
  `${BOLD}Application role posture${RESET}\n${DIM}${connectionString.replace(/:[^:@/]+@/, ':****@')}${RESET}\n\n`,
);

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    process.stdout.write(`  ${GREEN}pass${RESET}  ${name}\n`);
  } catch (error) {
    failed += 1;
    process.stdout.write(`  ${RED}FAIL${RESET}  ${name}\n        ${DIM}${error.message}${RESET}\n`);
  }
}

/** Asserts the statement is rejected, and that it is rejected for the stated reason. */
async function mustReject(sql, expected) {
  await client.query('begin');
  try {
    await client.query(sql);
    await client.query('rollback');
    throw new Error('statement was ALLOWED but must be rejected');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    if (/must be rejected/.test(error.message)) throw error;
    if (!new RegExp(expected, 'i').test(error.message)) {
      throw new Error(`rejected, but for the wrong reason: ${error.message}`, { cause: error });
    }
  }
}

await check('connects as skyjet_app_login, not as an owner', async () => {
  const { rows } = await client.query('select session_user, current_user');
  if (rows[0].session_user !== 'skyjet_app_login') {
    throw new Error(`session_user is ${rows[0].session_user}`);
  }
});

await check('the session is NOT privileged, so RBAC is enforced', async () => {
  const { rows } = await client.query('select app.is_privileged_session() as p');
  if (rows[0].p !== false) throw new Error('is_privileged_session() returned true');
});

// RLS is scoped by app.current_user_id, which transaction.ts sets per
// transaction. With no context set there is no caller, so the correct answer
// from every entity-scoped table is silence. Seeing rows here would mean the
// policies are not actually being evaluated.
await check('entity data is invisible without a user context', async () => {
  const { rows } = await client.query('select count(*)::int as n from gl.accounts');
  if (rows[0].n !== 0) throw new Error(`${rows[0].n} accounts visible with no caller set`);
});

await check('a forged user id grants nothing', async () => {
  await client.query('begin');
  await client.query(
    `select set_config('app.current_user_id', '00000000-0000-0000-0000-0000000000ff', true)`,
  );
  const { rows } = await client.query('select count(*)::int as n from gl.accounts');
  await client.query('rollback');
  if (rows[0].n !== 0) throw new Error(`${rows[0].n} accounts visible to an unassigned user`);
});

// Reference data carries `using (true)`, so it must be readable. This is the
// control for the two checks above: it proves they return zero because the
// policy said no, not because the role is locked out of the schema entirely.
await check('reference data is readable', async () => {
  const { rows } = await client.query('select count(*)::int as n from app.currencies');
  if (rows[0].n === 0) throw new Error('no currencies visible - the role cannot read at all');
});

await check('cannot INSERT into the journal directly', () =>
  mustReject('insert into gl.journal_entry default values', 'permission denied'),
);

await check('cannot INSERT a journal line directly', () =>
  mustReject(
    'insert into gl.journal_entry_line (entry_id, line_no, account_id, debit_txn, credit_txn) values (gen_random_uuid(), 1, gen_random_uuid(), 1, 0)',
    'permission denied',
  ),
);

await check('cannot UPDATE posted journal lines', () =>
  mustReject('update gl.journal_entry_line set debit_txn = debit_txn + 1', 'permission denied'),
);

await check('cannot DELETE journal entries', () =>
  mustReject('delete from gl.journal_entry', 'permission denied'),
);

await check('cannot write to the stock ledger directly', () =>
  mustReject('delete from inv.stock_ledger', 'permission denied'),
);

await check('cannot tamper with the audit log', () =>
  mustReject('delete from audit.log', 'permission denied'),
);

await check('cannot grant itself a role', () =>
  mustReject('grant skyjet_app to skyjet_app_login', 'permission denied|must have admin option'),
);

await check('posting without a permission grant is refused', () =>
  mustReject(
    `select gl.post_entry('{"entity_id":"10000000-0000-0000-0000-000000000001"}'::jsonb)`,
    'permission denied|no acting user|does not exist|invalid input',
  ),
);

await client.end();

process.stdout.write(`\n${BOLD}${passed} passed, ${failed} failed${RESET}\n`);
if (failed > 0) process.exit(1);
