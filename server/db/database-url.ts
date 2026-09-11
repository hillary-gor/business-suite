/**
 * Guards on DATABASE_URL that must hold before we open a connection.
 *
 * The local .env.local file expands ${SKYJET_APP_PASSWORD} because Next.js
 * does. Vercel does not. Pasting the unexpanded line is the failure that
 * shows up in production as "password authentication failed for user
 * skyjet_app_login". Catch it here, in words, before Postgres does.
 */
import { ConfigurationError } from './errors';

export function assertDatabaseUrl(connectionString: string, options: { vercel?: boolean } = {}) {
  if (!connectionString.trim()) {
    throw new ConfigurationError(
      'DATABASE_URL is not set. It must point at the database as skyjet_app_login, through the pooler in production.',
    );
  }

  if (/\$\{/.test(connectionString)) {
    throw new ConfigurationError(
      'DATABASE_URL still contains ${...}. Vercel does not expand those references. Put the password in the URL itself, then redeploy.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionString.replace(/^postgresql:/i, 'http:'));
  } catch {
    throw new ConfigurationError('DATABASE_URL is not a valid connection string.');
  }

  const user = decodeURIComponent(parsed.username);
  if (!user) {
    throw new ConfigurationError('DATABASE_URL has no username.');
  }
  if (user === 'postgres' || user.startsWith('postgres.')) {
    throw new ConfigurationError(
      'DATABASE_URL must connect as skyjet_app_login, not as postgres. Connecting as the owner would bypass the posting-function wall.',
    );
  }

  const vercel = options.vercel ?? Boolean(process.env.VERCEL);
  const host = parsed.hostname;
  const port = parsed.port;
  if (vercel && host.includes('pooler.supabase.com') && port !== '6543') {
    throw new ConfigurationError(
      'On Vercel, DATABASE_URL must use the transaction-mode pooler on port 6543 so the function can reach Postgres over IPv4.',
    );
  }
}
