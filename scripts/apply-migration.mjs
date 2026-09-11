#!/usr/bin/env node
/**
 * Applies one migration file to the hosted database using SUPABASE_DB_URL.
 * Prefer `supabase db push` when the URL expands cleanly; this exists for
 * Windows shells that leave ${DB_PASSWORD} unexpanded in the env file.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const file = process.argv[2];
if (!file) {
  process.stderr.write('usage: node scripts/apply-migration.mjs <migration.sql>\n');
  process.exit(2);
}

async function loadEnv() {
  const values = { ...process.env };
  try {
    const text = await readFile(path.join(process.cwd(), '.env.local'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match || process.env[match[1]]) continue;
      values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // optional
  }
  for (const key of Object.keys(values)) {
    if (typeof values[key] !== 'string') continue;
    values[key] = values[key].replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, n) => values[n] ?? '');
  }
  return values;
}

const env = await loadEnv();
const connectionString = env.SUPABASE_DB_URL;
if (!connectionString) {
  process.stderr.write('SUPABASE_DB_URL is not set.\n');
  process.exit(2);
}

const sql = await readFile(path.resolve(file), 'utf8');
const { default: pg } = await import('pg');
const { resolveScriptSsl } = await import('./lib/pg-ssl.mjs');
const client = new pg.Client({
  connectionString,
  application_name: 'skyjet-apply-migration',
  ssl: resolveScriptSsl(connectionString),
});
await client.connect();
try {
  await client.query('begin');
  await client.query(sql);
  const basename = path.basename(file).replace(/\.sql$/, '');
  const version = basename.split('_')[0];
  const name = basename.slice(version.length + 1);
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ($1, $2)
     on conflict (version) do nothing`,
    [version, name],
  );
  await client.query('commit');
  process.stdout.write(`Applied ${file}\n`);
} catch (error) {
  await client.query('rollback').catch(() => {});
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
} finally {
  await client.end();
}
