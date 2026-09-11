#!/usr/bin/env node
/**
 * Grants a Supabase Auth account access to the application.
 *
 * The preferred way to grant access is Settings → Manage users in the
 * application, which creates the Auth account (when the service role key is
 * configured) and assigns a role. This script remains for break-glass use
 * when the UI cannot be reached.
 *
 * Authenticating and being provisioned are deliberately separate. app.users
 * has no trigger on auth.users, so signing up grants nothing until someone
 * runs this or invites the person in the UI - see the comment in getSession,
 * which treats "authenticated but not provisioned" as a legitimate state that
 * confers no access. That is the correct default for a system holding money:
 * identity is not authorisation.
 *
 * This tool is idempotent, so re-running it to add a role is safe.
 *
 * Usage:
 *   node scripts/provision-user.mjs --email a@b.com --role owner
 *   node scripts/provision-user.mjs --email a@b.com --role accountant --entity SKYJET
 *   node scripts/provision-user.mjs --email a@b.com --list
 *
 * The account must already exist in hosted Supabase Auth. Create it in the
 * dashboard under Authentication -> Users -> Add user, or let the person sign
 * up. Local supabase start is not used for the running application.
 *
 * There is deliberately no --superuser flag. app.users.is_superuser bypasses
 * app.user_has_permission and app.user_has_entity_access in the database.
 * authorise() and can() do not honour that flag. The `owner` and `super_admin`
 * roles already carry every permission through the catalogue, so the audit
 * trail and the permission checks keep working and revoking access is a role
 * change rather than a flag nobody remembers is set.
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
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const email = flag('email');
const roleCode = flag('role');
const entityCode = flag('entity') ?? 'SKYJET';
const fullName = flag('name');
const listOnly = args.includes('--list');

if (!email) {
  process.stderr.write('usage: node scripts/provision-user.mjs --email <address> --role <code>\n');
  process.exit(2);
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

const env = parseEnv(await readFile(path.join(process.cwd(), '.env.local'), 'utf8'));
const connectionString = process.env.SUPABASE_DB_URL ?? env.SUPABASE_DB_URL;

if (!connectionString) {
  process.stderr.write(`${RED}SUPABASE_DB_URL is not set.${RESET}\n`);
  process.exit(2);
}

const { default: pg } = await import('pg');
const { resolveScriptSsl } = await import('./lib/pg-ssl.mjs');
const client = new pg.Client({
  connectionString,
  application_name: 'skyjet-provision-user',
  ssl: resolveScriptSsl(connectionString),
});
await client.connect();

async function report() {
  const { rows } = await client.query(
    `select e.code as entity,
            coalesce(array_agg(distinct r.code) filter (where r.code is not null), '{}') as roles,
            (select count(*) from app.user_effective_permissions p
              where p.user_id = u.id and p.entity_id = e.id)::int as permissions
       from app.users u
       join app.user_roles ur on ur.user_id = u.id
       join app.entities e on e.id = ur.entity_id
       join app.roles r on r.id = ur.role_id
      where u.email = $1
      group by e.code, e.id, u.id
      order by e.code`,
    [email],
  );

  if (rows.length === 0) {
    process.stdout.write(`${DIM}No entity access.${RESET}\n`);
    return;
  }
  for (const row of rows) {
    process.stdout.write(
      `  ${BOLD}${row.entity}${RESET}  roles: ${row.roles.join(', ')}  ` +
        `${DIM}(${row.permissions} permissions)${RESET}\n`,
    );
  }
}

try {
  const { rows: authRows } = await client.query(
    'select id, email, email_confirmed_at from auth.users where lower(email) = lower($1)',
    [email],
  );

  if (authRows.length === 0) {
    process.stdout.write(
      `${RED}No Supabase Auth account for ${email}.${RESET}\n\n` +
        `Create it first, then re-run:\n` +
        `  Supabase dashboard -> Authentication -> Users -> Add user\n` +
        `  Tick "Auto Confirm User" so no email round trip is needed.\n`,
    );
    process.exit(1);
  }

  const authUser = authRows[0];

  if (!authUser.email_confirmed_at) {
    process.stdout.write(
      `${YELLOW}Warning:${RESET} that account's email is not confirmed, so it may not be able ` +
        `to sign in until it is.\n`,
    );
  }

  if (listOnly) {
    process.stdout.write(`${BOLD}${email}${RESET}\n`);
    await report();
    await client.end();
    process.exit(0);
  }

  if (!roleCode) {
    process.stderr.write(`${RED}--role is required.${RESET} Available roles:\n`);
    const { rows } = await client.query('select code, name from app.roles order by code');
    for (const r of rows) process.stderr.write(`  ${r.code.padEnd(22)} ${r.name}\n`);
    await client.end();
    process.exit(2);
  }

  await client.query('begin');

  // The application row carries the same id as the auth row, so the two cannot
  // drift apart and there is no mapping table to keep in step.
  await client.query(
    `insert into app.users (id, email, full_name, is_active)
     values ($1, $2, $3, true)
     on conflict (id) do update
        set email = excluded.email,
            full_name = coalesce(nullif(excluded.full_name, ''), app.users.full_name),
            is_active = true`,
    [authUser.id, authUser.email, fullName ?? authUser.email.split('@')[0]],
  );

  const { rows: entityRows } = await client.query(
    'select id, code from app.entities where code = $1',
    [entityCode],
  );
  if (entityRows.length === 0) throw new Error(`No entity with code ${entityCode}`);

  const { rows: roleRows } = await client.query('select id, code from app.roles where code = $1', [
    roleCode,
  ]);
  if (roleRows.length === 0) throw new Error(`No role with code ${roleCode}`);

  await client.query(
    `insert into app.user_roles (user_id, entity_id, role_id)
     values ($1, $2, $3)
     on conflict do nothing`,
    [authUser.id, entityRows[0].id, roleRows[0].id],
  );

  await client.query('commit');

  process.stdout.write(`${GREEN}Provisioned${RESET} ${BOLD}${email}${RESET}\n`);
  await report();
} catch (error) {
  await client.query('rollback').catch(() => {});
  process.stdout.write(`${RED}${BOLD}Failed - rolled back.${RESET}\n  ${error.message}\n`);
  await client.end();
  process.exit(1);
}

await client.end();
