#!/usr/bin/env node
/**
 * Runs the database invariant suite.
 *
 * Against a real Postgres when SUPABASE_DB_URL is set - which is what CI does,
 * after `supabase db reset` - and otherwise against an in-memory PGlite with
 * the migrations and seed freshly applied, so the suite is runnable on a
 * laptop without Docker.
 *
 * Each suite file runs inside a transaction that is rolled back afterwards.
 * Suites therefore cannot see each other's data, and every one of them starts
 * from the same seeded configuration.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createDatabase, repoRoot } from './lib/pglite-harness.mjs';

const testsDir = path.join(repoRoot, 'tests', 'sql');
const databaseUrl = process.env.SUPABASE_DB_URL;

const RESET = '\u001b[0m';
const RED = '\u001b[31m';
const GREEN = '\u001b[32m';
const DIM = '\u001b[2m';
const BOLD = '\u001b[1m';

/** Uniform interface over PGlite and node-postgres. */
async function connect() {
  if (databaseUrl) {
    const { default: pg } = await import('pg');
    const { resolveScriptSsl } = await import('./lib/pg-ssl.mjs');
    const client = new pg.Client({
      connectionString: databaseUrl,
      ssl: resolveScriptSsl(databaseUrl),
    });
    await client.connect();
    return {
      label: `Postgres at ${databaseUrl.replace(/:[^:@/]+@/, ':****@')}`,
      exec: (sql) => client.query(sql),
      query: async (sql) => (await client.query(sql)).rows,
      close: () => client.end(),
    };
  }

  const db = await createDatabase({ seed: true });
  return {
    label: 'PGlite (in-memory Postgres 17)',
    exec: (sql) => db.exec(sql),
    query: async (sql) => (await db.query(sql)).rows,
    close: () => db.close(),
  };
}

const db = await connect();
process.stdout.write(`${BOLD}Database invariant suite${RESET}\n${DIM}${db.label}${RESET}\n\n`);

await db.exec(await readFile(path.join(testsDir, '_harness.sql'), 'utf8'));

const files = (await readdir(testsDir))
  .filter((f) => f.endsWith('.sql') && !f.startsWith('_'))
  .sort();

let passed = 0;
let failed = 0;
const failures = [];

for (const file of files) {
  const sql = await readFile(path.join(testsDir, file), 'utf8');
  let rows;
  let crash = null;

  const collect = () =>
    db.query('select suite, name, passed, detail from test.results order by id');

  await db.exec('begin');
  try {
    await db.exec(sql);
    rows = await collect();
  } catch (error) {
    crash = error;
    // A suite that aborts part way through has still recorded the assertions
    // it got through, and those are the ones that locate the failure.
    try {
      rows = await collect();
    } catch {
      rows = [];
    }
  }
  await db.exec('rollback');

  const suiteName = rows[0]?.suite ?? file.replace(/^\d+_/, '').replace(/\.sql$/, '');
  process.stdout.write(`${BOLD}${suiteName}${RESET} ${DIM}(${file})${RESET}\n`);

  for (const row of rows) {
    if (row.passed) {
      passed += 1;
      process.stdout.write(`  ${GREEN}pass${RESET}  ${row.name}\n`);
    } else {
      failed += 1;
      failures.push(`${suiteName} / ${row.name}: ${row.detail ?? 'no detail'}`);
      process.stdout.write(`  ${RED}FAIL${RESET}  ${row.name}\n`);
      if (row.detail) process.stdout.write(`        ${DIM}${row.detail}${RESET}\n`);
    }
  }

  if (crash) {
    failed += 1;
    const message = crash.message ?? String(crash);
    failures.push(`${suiteName}: suite aborted - ${message}`);
    process.stdout.write(`  ${RED}ABORTED${RESET} ${message}\n`);
  }

  process.stdout.write('\n');
}

await db.close();

process.stdout.write(
  `${BOLD}${passed} passed, ${failed} failed${RESET} across ${files.length} suites\n`,
);

if (failed > 0) {
  process.stdout.write(`\n${RED}${BOLD}Failures${RESET}\n`);
  for (const failure of failures) process.stdout.write(`  - ${failure}\n`);
  process.exit(1);
}
