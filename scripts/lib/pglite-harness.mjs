/**
 * A disposable Postgres for developers without Docker.
 *
 * The real database is Supabase Postgres, and CI runs the test suite against
 * it. But a schema this size needs to be executable on a laptop during
 * development, so this harness boots PGlite - Postgres 17 compiled to
 * WebAssembly - creates the handful of objects Supabase would have provided,
 * and applies the migrations.
 *
 * Anything this harness has to fake is listed in SUPABASE_PRELUDE below. That
 * list is deliberately short: if it starts growing, the schema has begun to
 * depend on Supabase in ways that will make it hard to move.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..');
export const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
export const seedFile = path.join(repoRoot, 'supabase', 'seed.sql');

/**
 * Objects that exist on a Supabase project but not in bare Postgres.
 * Kept minimal and explicit so the dependency is visible.
 */
const SUPABASE_PRELUDE = `
  create schema if not exists extensions;
  create schema if not exists auth;

  create table if not exists auth.users (
    id                 uuid primary key default gen_random_uuid(),
    email              text unique,
    encrypted_password text,
    created_at         timestamptz not null default now()
  );

  do $$
  begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role nologin noinherit bypassrls;
    end if;
  end;
  $$;
`;

export async function listMigrations() {
  const files = await readdir(migrationsDir);
  return files.filter((f) => f.endsWith('.sql')).sort();
}

/**
 * Boots an in-memory database with the full schema applied.
 *
 * @param {{ seed?: boolean, verbose?: boolean }} options
 */
export async function createDatabase({ seed = true, verbose = false } = {}) {
  const db = await PGlite.create({ extensions: { btree_gist } });

  await db.exec(SUPABASE_PRELUDE);

  for (const file of await listMigrations()) {
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    if (verbose) process.stdout.write(`  applying ${file}\n`);
    try {
      await db.exec(sql);
    } catch (error) {
      throw new MigrationError(file, error);
    }
  }

  if (seed) {
    const sql = await readFile(seedFile, 'utf8');
    if (verbose) process.stdout.write('  applying seed.sql\n');
    try {
      await db.exec(sql);
    } catch (error) {
      throw new MigrationError('seed.sql', error);
    }
  }

  return db;
}

export class MigrationError extends Error {
  constructor(file, cause) {
    super(`${file}: ${cause.message}`);
    this.name = 'MigrationError';
    this.file = file;
    this.cause = cause;
  }
}

/**
 * Runs a statement expecting it to fail, and returns the error message.
 * Throws when the statement unexpectedly succeeds, because a guard that does
 * not guard is worse than no guard at all.
 */
export async function expectFailure(db, sql, params = []) {
  try {
    await db.query(sql, params);
  } catch (error) {
    return error.message;
  }
  throw new Error(`Expected this statement to be rejected, but it succeeded:\n${sql}`);
}
