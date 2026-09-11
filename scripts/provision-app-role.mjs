#!/usr/bin/env node
/**
 * Provisions the application's login role, out of band.
 *
 * supabase/migrations/0005_posting_engine.sql creates `skyjet_app` as NOLOGIN
 * and hangs every application privilege off it. It deliberately stops there:
 * a role that can log in needs a password, and a password in a migration is a
 * password in version control.
 *
 * This script closes that gap. It creates a separate login role and grants it
 * membership of skyjet_app, so the credential and the privilege set can be
 * managed independently - you can rotate or disable a login, or add a second
 * one for a background worker, without touching the grants.
 *
 * The generated password is written to .env.local and never printed. Run it
 * again at any time to rotate: the role is altered in place, so existing
 * grants are untouched and only the credential changes.
 *
 * Usage:
 *   node scripts/provision-app-role.mjs [--login-role skyjet_app_login]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

const RESET = '\u001b[0m';
const RED = '\u001b[31m';
const GREEN = '\u001b[32m';
const DIM = '\u001b[2m';
const BOLD = '\u001b[1m';

const args = process.argv.slice(2);
const loginRole = args[args.indexOf('--login-role') + 1]?.startsWith('skyjet')
  ? args[args.indexOf('--login-role') + 1]
  : 'skyjet_app_login';
const PRIVILEGE_ROLE = 'skyjet_app';
const envPath = path.join(process.cwd(), '.env.local');

/** Base62 keeps the password safe to drop straight into a URL unescaped. */
function generatePassword(length = 40) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length * 2);
  let out = '';
  for (const byte of bytes) {
    if (out.length === length) break;
    // Reject the tail of the byte range so every character is equally likely.
    if (byte >= 248) continue;
    out += alphabet[byte % 62];
  }
  return out;
}

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

/** Rewrites a single KEY=value line, preserving everything else including comments. */
function setEnvLine(text, key, value) {
  const pattern = new RegExp(`^(\\s*${key}\\s*=).*$`, 'm');
  return pattern.test(text)
    ? text.replace(pattern, `$1${value}`)
    : `${text.trimEnd()}\n${key}=${value}\n`;
}

let envText = await readFile(envPath, 'utf8');
const env = parseEnv(envText);
const connectionString = env.SUPABASE_DB_URL;

if (!connectionString) {
  process.stderr.write(`${RED}SUPABASE_DB_URL is not set in .env.local.${RESET}\n`);
  process.exit(2);
}

const password = generatePassword();

const { default: pg } = await import('pg');
const { resolveScriptSsl } = await import('./lib/pg-ssl.mjs');
const client = new pg.Client({
  connectionString,
  application_name: 'skyjet-provision-role',
  ssl: resolveScriptSsl(connectionString),
});
await client.connect();

/**
 * Builds DDL through Postgres's own format(), so the identifier and literal
 * are quoted by the server rather than by string concatenation here.
 */
async function ddl(template, ...params) {
  const { rows } = await client.query(
    `select format($1${params.map((_, i) => `, $${i + 2}::text`).join('')}) as stmt`,
    [template, ...params],
  );
  return client.query(rows[0].stmt);
}

try {
  const { rows: priv } = await client.query('select 1 from pg_roles where rolname = $1', [
    PRIVILEGE_ROLE,
  ]);
  if (priv.length === 0) {
    throw new Error(`${PRIVILEGE_ROLE} does not exist - run the migrations first.`);
  }

  const { rows: existing } = await client.query('select 1 from pg_roles where rolname = $1', [
    loginRole,
  ]);

  await client.query('begin');

  if (existing.length === 0) {
    await ddl('create role %I with login password %L', loginRole, password);
    process.stdout.write(`${GREEN}created${RESET} role ${BOLD}${loginRole}${RESET}\n`);
  } else {
    await ddl('alter role %I with login password %L', loginRole, password);
    process.stdout.write(`${GREEN}rotated${RESET} password for ${BOLD}${loginRole}${RESET}\n`);
  }

  // NOINHERIT would leave the login able to SET ROLE but not to use the
  // privileges directly, which is not what a connection pool can work with.
  await ddl('alter role %I inherit', loginRole);
  await ddl('grant %I to %I', PRIVILEGE_ROLE, loginRole);

  const { rows: db } = await client.query('select current_database() as name');
  await ddl('grant connect on database %I to %I', db[0].name, loginRole);

  await client.query('commit');
} catch (error) {
  await client.query('rollback').catch(() => {});
  process.stdout.write(`${RED}${BOLD}Failed - rolled back.${RESET}\n  ${error.message}\n`);
  await client.end();
  process.exit(1);
}

// Verify the result rather than trusting that the DDL meant what we hoped.
const { rows: check } = await client.query(
  `select r.rolcanlogin, r.rolinherit, r.rolsuper, r.rolbypassrls,
          pg_has_role(r.rolname, $2, 'member') as in_privilege_role
     from pg_roles r where r.rolname = $1`,
  [loginRole, PRIVILEGE_ROLE],
);
await client.end();

const result = check[0];
process.stdout.write(
  `${DIM}login=${result.rolcanlogin} inherit=${result.rolinherit} ` +
    `member_of_${PRIVILEGE_ROLE}=${result.in_privilege_role} ` +
    `superuser=${result.rolsuper} bypassrls=${result.rolbypassrls}${RESET}\n`,
);

if (!result.rolcanlogin || !result.in_privilege_role || result.rolsuper || result.rolbypassrls) {
  process.stdout.write(`${RED}Role is not in the expected state.${RESET}\n`);
  process.exit(1);
}

const ref = /postgres\.([a-z0-9]+):/.exec(connectionString)?.[1];
const host = /@([^:/]+)/.exec(connectionString)?.[1];
const user = ref ? `${loginRole}.${ref}` : loginRole;

envText = setEnvLine(envText, 'SKYJET_APP_PASSWORD', password);
// The password is written into DATABASE_URL. Next.js expands ${VAR} in
// .env.local, but Vercel does not — pasting an unexpanded URL is how
// production ends up with "password authentication failed".
envText = setEnvLine(
  envText,
  'DATABASE_URL',
  `postgresql://${user}:${password}@${host?.replace(':5432', '')}:6543/postgres`,
);
await writeFile(envPath, envText, 'utf8');

process.stdout.write(
  `${GREEN}Wrote the new credential to .env.local.${RESET} ${DIM}(not printed)${RESET}\n`,
);
