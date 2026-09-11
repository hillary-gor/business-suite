#!/usr/bin/env node
/**
 * Prints the shape of DATABASE_URL without ever printing the password.
 * Use this to check a value before pasting it into Vercel.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

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

const rawFile = await readFile(path.join(process.cwd(), '.env.local'), 'utf8');
const rawLine = rawFile.split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l)) ?? '';
const env = parseEnv(rawFile);
const url = env.DATABASE_URL;
if (!url) {
  process.stderr.write('DATABASE_URL is not set in .env.local\n');
  process.exit(2);
}

const interpolatedInFile = /\$\{/.test(rawLine);
const parsed = new URL(url.replace(/^postgresql:/, 'http:'));
process.stdout.write(`file still uses \${...} interpolation: ${interpolatedInFile}\n`);
process.stdout.write(`username: ${decodeURIComponent(parsed.username)}\n`);
process.stdout.write(`host: ${parsed.hostname}\n`);
process.stdout.write(`port: ${parsed.port || '(default)'}\n`);
process.stdout.write(`database: ${parsed.pathname.replace(/^\//, '')}\n`);
process.stdout.write(`password length: ${decodeURIComponent(parsed.password).length}\n`);
process.stdout.write(
  `vercel-safe (no interpolation): ${interpolatedInFile ? 'NO — expand the password into DATABASE_URL before pasting' : 'yes'}\n`,
);

if (process.argv.includes('--inline')) {
  if (!interpolatedInFile) {
    process.stdout.write('DATABASE_URL is already inlined.\n');
  } else {
    const { writeFile } = await import('node:fs/promises');
    const updated = rawFile.replace(/^(\s*DATABASE_URL\s*=).*$/m, `$1${url}`);
    await writeFile(path.join(process.cwd(), '.env.local'), updated, 'utf8');
    process.stdout.write('Wrote the expanded DATABASE_URL into .env.local (password not printed).\n');
  }
}
