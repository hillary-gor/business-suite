/**
 * Generates TypeScript types from the database schema.
 *
 * The schema is the source of truth, so the types describing it are derived
 * rather than written. Hand-maintained types drift, and the way you discover
 * they have drifted is a runtime error on a column that was renamed in a
 * migration six weeks ago.
 *
 * Runs against PGlite by default, so it works with no server running and no
 * network. Set SUPABASE_DB_URL to introspect a real database instead.
 *
 *   node scripts/generate-types.mjs
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDatabase } from './lib/pglite-harness.mjs';

const OUTPUT = resolve('server/db/schema.generated.ts');

const SCHEMAS = ['app', 'gl', 'inv', 'integration', 'audit', 'sales', 'purch'];

/** Postgres type to TypeScript type. NUMERIC stays a string, deliberately. */
const TYPE_MAP = {
  uuid: 'string',
  text: 'string',
  varchar: 'string',
  bpchar: 'string',
  char: 'string',
  citext: 'string',
  bool: 'boolean',
  int2: 'number',
  int4: 'number',
  // int8 exceeds Number.MAX_SAFE_INTEGER, so it is carried as a string.
  int8: 'string',
  // NUMERIC is the whole point of the precision work in the migrations. If it
  // arrived here as `number` the ledger would be approximate.
  numeric: 'string',
  float4: 'number',
  float8: 'number',
  date: 'string',
  timestamp: 'string',
  timestamptz: 'string',
  time: 'string',
  interval: 'string',
  json: 'unknown',
  jsonb: 'unknown',
  bytea: 'Buffer',
  inet: 'string',
  // Domains over numeric, declared in migration 0001.
  money_amount: 'string',
  quantity: 'string',
  fx_rate: 'string',
  tax_rate: 'string',
};

async function main() {
  const { query, close } = await connect();

  try {
    const enums = await query(
      // enumlabel is `name`, and node-postgres has no parser for name[], so it
      // would arrive as the raw literal '{A,B}' rather than an array. Casting
      // to text[] gives a type both node-postgres and PGlite decode the same
      // way, which is the point of having one generator for both.
      `select n.nspname as schema_name,
              t.typname  as enum_name,
              array_agg(e.enumlabel::text order by e.enumsortorder) as labels
         from pg_type t
         join pg_namespace n on n.oid = t.typnamespace
         join pg_enum e on e.enumtypid = t.oid
        where n.nspname = any($1)
        group by n.nspname, t.typname
        order by n.nspname, t.typname`,
      [SCHEMAS],
    );

    const columns = await query(
      `select c.table_schema as schema_name,
              c.table_name,
              c.column_name,
              c.is_nullable = 'YES' as nullable,
              c.column_default is not null as has_default,
              coalesce(c.domain_name, t.typname) as pg_type,
              c.data_type,
              tab.table_type
         from information_schema.columns c
         join information_schema.tables tab
           on tab.table_schema = c.table_schema and tab.table_name = c.table_name
         join pg_catalog.pg_type t on t.typname = c.udt_name
        where c.table_schema = any($1)
        order by c.table_schema, c.table_name, c.ordinal_position`,
      [SCHEMAS],
    );

    const output = render(enums, columns);
    await writeFile(OUTPUT, output, 'utf8');

    const tableCount = new Set(columns.map((c) => `${c.schema_name}.${c.table_name}`)).size;
    console.log(
      `Wrote ${OUTPUT} — ${tableCount} relations, ${enums.length} enums, ${columns.length} columns.`,
    );
  } finally {
    await close();
  }
}

function render(enums, columns) {
  const lines = [];

  lines.push('/**');
  lines.push(' * Generated from the database schema. Do not edit by hand.');
  lines.push(' *');
  lines.push(' * Regenerate with `npm run db:types` after changing a migration.');
  lines.push(' *');
  lines.push(' * NUMERIC columns are typed as `string`. That is not an oversight: a');
  lines.push(' * JavaScript number is a double and would lose precision the moment it');
  lines.push(' * touched a monetary value. Pass them through Money from @/lib/money.');
  lines.push(' */');
  lines.push('');
  lines.push('/* eslint-disable @typescript-eslint/no-explicit-any */');
  lines.push('');

  for (const e of enums) {
    const name = pascal(`${e.schema_name}_${e.enum_name}`);
    const labels = (e.labels ?? []).map((l) => `'${l}'`).join(' | ');
    lines.push(`export type ${name} = ${labels};`);
    lines.push('');
  }

  const byTable = new Map();
  for (const column of columns) {
    const key = `${column.schema_name}.${column.table_name}`;
    if (!byTable.has(key)) byTable.set(key, { meta: column, columns: [] });
    byTable.get(key).columns.push(column);
  }

  const enumLookup = new Map(
    enums.map((e) => [
      `${e.schema_name}.${e.enum_name}`,
      pascal(`${e.schema_name}_${e.enum_name}`),
    ]),
  );

  for (const [key, { meta, columns: cols }] of [...byTable].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const rowName = pascal(`${meta.schema_name}_${meta.table_name}`) + 'Row';
    lines.push(`/** ${key}${meta.table_type === 'VIEW' ? ' (view)' : ''} */`);
    lines.push(`export interface ${rowName} {`);
    for (const col of cols) {
      const tsType = toTsType(col, enumLookup);
      const optional = col.nullable ? ' | null' : '';
      lines.push(`  ${quoteKey(col.column_name)}: ${tsType}${optional};`);
    }
    lines.push('}');
    lines.push('');

    // The insertable shape: columns with a default or that are nullable are
    // optional, which is what the compiler needs to check an insert.
    const insertable = cols.filter((c) => !isGenerated(c));
    if (meta.table_type === 'BASE TABLE') {
      lines.push(`export interface ${pascal(`${meta.schema_name}_${meta.table_name}`)}Insert {`);
      for (const col of insertable) {
        const tsType = toTsType(col, enumLookup);
        const optional = col.nullable || col.has_default ? '?' : '';
        const nullSuffix = col.nullable ? ' | null' : '';
        lines.push(`  ${quoteKey(col.column_name)}${optional}: ${tsType}${nullSuffix};`);
      }
      lines.push('}');
      lines.push('');
    }
  }

  lines.push('/** Every relation, keyed by qualified name. */');
  lines.push('export interface Database {');
  for (const [key, { meta }] of [...byTable].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`  ${quoteKey(key)}: ${pascal(`${meta.schema_name}_${meta.table_name}`)}Row;`);
  }
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

function toTsType(column, enumLookup) {
  const qualified = `${column.schema_name}.${column.pg_type}`;
  if (enumLookup.has(qualified)) return enumLookup.get(qualified);

  for (const [key, value] of enumLookup) {
    if (key.endsWith(`.${column.pg_type}`)) return value;
  }

  if (column.data_type === 'ARRAY') {
    const element = column.pg_type.replace(/^_/, '');
    return `${TYPE_MAP[element] ?? 'string'}[]`;
  }

  return TYPE_MAP[column.pg_type] ?? 'string';
}

/** Identity and generated columns cannot be supplied on insert. */
function isGenerated(column) {
  return column.column_name === 'search_vector';
}

function pascal(value) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function quoteKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `'${key}'`;
}

async function connect() {
  if (process.env.SUPABASE_DB_URL) {
    const { default: pg } = await import('pg');
    const { resolveScriptSsl } = await import('./lib/pg-ssl.mjs');
    const client = new pg.Client({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: resolveScriptSsl(process.env.SUPABASE_DB_URL),
    });
    await client.connect();
    return {
      query: async (sql, params) => (await client.query(sql, params)).rows,
      close: () => client.end(),
    };
  }

  console.log('No SUPABASE_DB_URL set; introspecting a fresh PGlite database.');
  const db = await createDatabase({ seed: false });
  return {
    query: async (sql, params) => (await db.query(sql, params)).rows,
    close: () => db.close(),
  };
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
