#!/usr/bin/env node
/**
 * Applies every migration (and optionally the seed) to a throwaway PGlite
 * database and reports the first failure with its file name.
 *
 * Usage: node scripts/validate-schema.mjs [--no-seed]
 */
import { createDatabase, MigrationError } from './lib/pglite-harness.mjs';

const seed = !process.argv.includes('--no-seed');

try {
  process.stdout.write('Applying schema to an in-memory Postgres\n');
  const db = await createDatabase({ seed, verbose: true });

  const { rows } = await db.query(`
    select table_schema, count(*)::int as tables
      from information_schema.tables
     where table_schema in ('app', 'gl', 'inv', 'audit', 'integration')
       and table_type = 'BASE TABLE'
     group by table_schema
     order by table_schema
  `);

  process.stdout.write('\nSchema applied cleanly.\n');
  for (const row of rows) {
    process.stdout.write(`  ${row.table_schema.padEnd(12)} ${row.tables} tables\n`);
  }
  await db.close();
} catch (error) {
  if (error instanceof MigrationError) {
    process.stderr.write(`\nFAILED in ${error.file}\n\n${error.cause.message}\n`);
  } else {
    process.stderr.write(`\nFAILED\n\n${error.stack ?? error.message}\n`);
  }
  process.exit(1);
}
