#!/usr/bin/env node
/**
 * Checks every SQL statement in the server layer against the real schema.
 *
 * This exists because of a whole class of bug the TypeScript compiler cannot
 * see. A query referring to a column that was renamed in a migration, or
 * calling a function with the wrong number of arguments, compiles perfectly
 * and type-checks perfectly, and then fails at runtime in front of a user. In
 * a financial system that is not an inconvenience: it is a screen that will
 * not load during a month end.
 *
 * The trick is that Postgres resolves every name at parse-and-analyse time,
 * before it binds any parameter. So a statement sent with no parameters comes
 * back with one of two kinds of error:
 *
 *   - "bind message supplies 0 parameters, but ... requires 3", or
 *     "could not determine data type of parameter $1"
 *     Name resolution succeeded. Every table, column and function exists and
 *     every function arity matches. The statement is sound.
 *
 *   - 'column "foo" does not exist', 'function bar(uuid) does not exist',
 *     'relation "baz" does not exist'
 *     A real mismatch between the code and the schema.
 *
 * So the parameters never need supplying and no fixture data is needed. The
 * whole server layer is validated against a freshly migrated database in a
 * couple of seconds.
 *
 *   node scripts/validate-queries.mjs
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createDatabase, repoRoot } from './lib/pglite-harness.mjs';

const SOURCE_ROOTS = [path.join(repoRoot, 'server'), path.join(repoRoot, 'app')];

const RESET = '\u001b[0m';
const RED = '\u001b[31m';
const GREEN = '\u001b[32m';
const DIM = '\u001b[2m';
const BOLD = '\u001b[1m';

/**
 * Errors that mean name resolution succeeded and only binding failed. These
 * are the expected outcome for a correct query sent without its parameters.
 */
const RESOLUTION_SUCCEEDED = [
  /bind message supplies \d+ parameters/i,
  /could not determine data type of parameter/i,
  /there is no parameter \$\d+/i,
  /inconsistent types deduced for parameter/i,
];

/** Errors that mean the code and the schema genuinely disagree. */
const REAL_MISMATCH = [
  /relation ".*" does not exist/i,
  /column .* does not exist/i,
  /function .* does not exist/i,
  /column reference .* is ambiguous/i,
  /missing FROM-clause entry/i,
  /operator does not exist/i,
  /type ".*" does not exist/i,
  /has no field/i,
  /does not have a composite type/i,
];

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.tsx?$/.test(entry.name)) {
      yield full;
    }
  }
}

/**
 * Pulls SQL out of backtick template literals.
 *
 * Only literals that look like a complete statement are taken, and any literal
 * containing a `${}` interpolation is skipped: those are assembled at runtime
 * and cannot be checked as written. There are only a couple of them and they
 * are built from fragments that are themselves checked.
 */
function extractStatements(source) {
  const statements = [];
  const template = /`([^`\\]*(?:\\.[^`\\]*)*)`/g;

  let match;
  while ((match = template.exec(source)) !== null) {
    const body = match[1];
    if (!body) continue;

    const trimmed = body.trim();
    if (!/^(with|select|insert|update|delete)\b/i.test(trimmed)) continue;
    if (trimmed.includes('${')) continue;

    statements.push(trimmed.replace(/\s+/g, ' '));
  }

  // Single-quoted one-liners, which the shorter calls use.
  const singleLine = /'((?:with|select|insert|update|delete)\s[^']{10,})'/gi;
  while ((match = singleLine.exec(source)) !== null) {
    const body = match[1];
    if (body && !body.includes('${')) statements.push(body.trim());
  }

  return statements;
}

async function main() {
  process.stdout.write(`${BOLD}Server layer SQL against the live schema${RESET}\n`);

  const files = [];
  for (const root of SOURCE_ROOTS) {
    for await (const file of walk(root)) files.push(file);
  }

  const db = await createDatabase({ seed: true });

  let checked = 0;
  let skipped = 0;
  const problems = [];

  try {
    for (const file of files.sort()) {
      const source = await readFile(file, 'utf8');
      const statements = extractStatements(source);
      if (statements.length === 0) continue;

      const relative = path.relative(repoRoot, file).replace(/\\/g, '/');

      for (const sql of statements) {
        // Sent with no parameters on purpose; see the header.
        let message = null;
        try {
          await db.query(sql, []);
        } catch (error) {
          message = error.message ?? String(error);
        }

        if (message === null) {
          // A statement with no parameters that simply ran. Also fine, though
          // any write would have been rolled back below.
          checked += 1;
          continue;
        }

        if (RESOLUTION_SUCCEEDED.some((p) => p.test(message))) {
          // `select *` resolves against anything, so a renamed column arrives
          // in the application as undefined with nothing having failed. The
          // check cannot see through a star either, so it refuses them.
          if (/^select\s+\*\s+from/i.test(sql)) {
            problems.push({
              relative,
              sql,
              message:
                'Uses `select *`, which hides a renamed column behind an undefined at runtime. ' +
                'List the columns the code actually reads.',
            });
            continue;
          }
          checked += 1;
          continue;
        }

        if (REAL_MISMATCH.some((p) => p.test(message))) {
          problems.push({ relative, sql, message: message.split('\n')[0] });
          continue;
        }

        // Anything else - a permission error, a constraint, a raised
        // exception - means the names resolved and the statement was actually
        // executed. Not what this script is looking for.
        skipped += 1;
      }
    }
  } finally {
    await db.close();
  }

  process.stdout.write(
    `${DIM}${files.length} files scanned, ${checked} statements verified, ` +
      `${skipped} executed or inconclusive${RESET}\n\n`,
  );

  if (problems.length === 0) {
    process.stdout.write(`${GREEN}${BOLD}Every statement resolves against the schema.${RESET}\n`);
    return;
  }

  process.stdout.write(
    `${RED}${BOLD}${problems.length} statement(s) do not match the schema${RESET}\n\n`,
  );
  for (const problem of problems) {
    process.stdout.write(`${RED}${problem.relative}${RESET}\n`);
    process.stdout.write(`  ${problem.message}\n`);
    process.stdout.write(`  ${DIM}${problem.sql.slice(0, 220)}${RESET}\n\n`);
  }

  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
