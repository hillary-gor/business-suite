#!/usr/bin/env node
/**
 * Applies a SQL file to a database, verbatim and atomically.
 *
 * Migrations go through `supabase db push`, which keeps its own history. This
 * script exists for the files that sit outside that history - principally
 * supabase/seed.sql, which `supabase db reset` applies locally but which has
 * no equivalent path to a hosted project.
 *
 * The file is sent byte for byte. Nothing here parses, splits or rewrites the
 * SQL, because a seed that defines a chart of accounts is not something a
 * naive statement splitter should be allowed near.
 *
 * Usage:
 *   node scripts/apply-sql.mjs supabase/seed.sql [--exclude-local] [--dry-run]
 *
 * --exclude-local  Strip regions fenced by `-- @local-only:begin` and
 *                  `-- @local-only:end`. These hold developer fixtures such as
 *                  the local login role, whose password is in version control
 *                  and must never reach a hosted database.
 * --dry-run        Report what would be applied, then roll back.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const RESET = '\u001b[0m';
const RED = '\u001b[31m';
const GREEN = '\u001b[32m';
const YELLOW = '\u001b[33m';
const DIM = '\u001b[2m';
const BOLD = '\u001b[1m';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const excludeLocal = args.includes('--exclude-local');
const dryRun = args.includes('--dry-run');

if (!file) {
  process.stderr.write(
    'usage: node scripts/apply-sql.mjs <file.sql> [--exclude-local] [--dry-run]\n',
  );
  process.exit(2);
}

/**
 * Reads .env.local when the variable is not already in the environment, and
 * expands ${VAR} references. Next.js does this for the app; a bare node script
 * does not get it for free.
 */
async function loadEnv() {
  const values = { ...process.env };
  try {
    const text = await readFile(path.join(process.cwd(), '.env.local'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, key, raw] = match;
      if (process.env[key]) continue;
      values[key] = raw.trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // No .env.local is fine; the environment may already carry the URL.
  }
  for (const key of Object.keys(values)) {
    if (typeof values[key] !== 'string') continue;
    values[key] = values[key].replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (_, name) => values[name] ?? '',
    );
  }
  return values;
}

/** Removes fenced local-only regions, and reports how many lines went. */
function stripLocalOnly(sql) {
  const lines = sql.split(/\r?\n/);
  const kept = [];
  let inside = false;
  let removed = 0;
  let regions = 0;

  for (const line of lines) {
    if (/^\s*--\s*@local-only:begin\s*$/.test(line)) {
      if (inside) throw new Error('nested @local-only:begin');
      inside = true;
      regions += 1;
      removed += 1;
      continue;
    }
    if (/^\s*--\s*@local-only:end\s*$/.test(line)) {
      if (!inside) throw new Error('@local-only:end without a matching begin');
      inside = false;
      removed += 1;
      continue;
    }
    if (inside) removed += 1;
    else kept.push(line);
  }

  if (inside) throw new Error('unterminated @local-only region');
  return { sql: kept.join('\n'), removed, regions };
}

const env = await loadEnv();
const connectionString = env.SUPABASE_DB_URL;

if (!connectionString) {
  process.stderr.write(
    `${RED}SUPABASE_DB_URL is not set.${RESET} Put it in .env.local or the environment.\n`,
  );
  process.exit(2);
}

const secret = /:([^:@/]+)@/.exec(connectionString)?.[1];
const redact = (text) => (secret ? String(text).split(secret).join('****') : String(text));
const safeUrl = connectionString.replace(/:[^:@/]+@/, ':****@');

let sql = await readFile(path.resolve(file), 'utf8');
const originalBytes = Buffer.byteLength(sql, 'utf8');

process.stdout.write(`${BOLD}Applying ${file}${RESET}\n${DIM}${safeUrl}${RESET}\n`);

if (excludeLocal) {
  const result = stripLocalOnly(sql);
  sql = result.sql;
  process.stdout.write(
    `${DIM}excluded ${result.regions} local-only region(s), ${result.removed} lines${RESET}\n`,
  );
}

process.stdout.write(
  `${DIM}${originalBytes} bytes read, ${Buffer.byteLength(sql, 'utf8')} bytes to apply${RESET}\n\n`,
);

const { default: pg } = await import('pg');
const { resolveScriptSsl } = await import('./lib/pg-ssl.mjs');
const client = new pg.Client({
  connectionString,
  application_name: 'skyjet-apply-sql',
  ssl: resolveScriptSsl(connectionString),
});

const notices = [];
client.on('notice', (n) => notices.push(n.message));

await client.connect();

try {
  await client.query('begin');
  await client.query(sql);

  if (dryRun) {
    await client.query('rollback');
    process.stdout.write(`${YELLOW}DRY RUN - rolled back.${RESET}\n`);
  } else {
    await client.query('commit');
    process.stdout.write(`${GREEN}Applied and committed.${RESET}\n`);
  }
} catch (error) {
  await client.query('rollback').catch(() => {});
  process.stdout.write(`${RED}${BOLD}Failed - rolled back, nothing was applied.${RESET}\n`);
  process.stdout.write(`  ${redact(error.message)}\n`);
  if (error.detail) process.stdout.write(`  detail: ${redact(error.detail)}\n`);
  if (error.hint) process.stdout.write(`  hint:   ${redact(error.hint)}\n`);
  if (error.where) process.stdout.write(`  where:  ${redact(error.where)}\n`);
  await client.end();
  process.exit(1);
} finally {
  if (notices.length) {
    process.stdout.write(`${DIM}${notices.length} notice(s) from the server${RESET}\n`);
  }
}

await client.end();
