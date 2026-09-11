/**
 * TLS options for a node-postgres client talking to a remote database.
 *
 * Mirrors server/db/pool.ts. Scripts open their own Client and so cannot
 * reuse that module; they must not silently fall back to plaintext either.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './pglite-harness.mjs';

const bundledCa = readFileSync(path.join(repoRoot, 'certs', 'supabase-prod-ca-2021.crt'), 'utf8');

export function resolveScriptSsl(connectionString) {
  const mode = process.env.DATABASE_SSL ?? (isLocalHost(connectionString) ? 'disable' : 'require');
  if (mode === 'disable') return false;
  if (process.env.DATABASE_SSL_CA) {
    const ca = process.env.DATABASE_SSL_CA;
    return {
      ca: ca.startsWith('-----BEGIN') ? ca : readFileSync(ca, 'utf8'),
      rejectUnauthorized: true,
    };
  }
  if (mode === 'no-verify') return { rejectUnauthorized: false };
  if (isSupabaseHost(connectionString)) {
    return { ca: bundledCa, rejectUnauthorized: true };
  }
  return { rejectUnauthorized: true };
}

function isLocalHost(connectionString) {
  try {
    const { hostname } = new URL(connectionString);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

function isSupabaseHost(connectionString) {
  try {
    const { hostname } = new URL(connectionString);
    return (
      hostname === 'supabase.com' ||
      hostname.endsWith('.supabase.com') ||
      hostname.endsWith('.supabase.co')
    );
  } catch {
    return false;
  }
}
