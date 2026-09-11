import { createClient, type User } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { accessCallbackUrl, hashedTokenFrom, type AccessLinkType } from '@/server/auth/access-link';
import { BusinessRuleError, ConfigurationError } from '@/server/db/errors';

/**
 * The Auth admin client. Server-only. The secret must never be a NEXT_PUBLIC_
 * variable: that would put a key that can create users into the browser bundle.
 */
export function supabaseSecretKey(): string | null {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key?.trim()) return null;
  return key.trim();
}

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = supabaseSecretKey();
  if (!url || !key) {
    throw new ConfigurationError(
      'Inviting a new person needs SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) on the server. Add the service role key from Supabase → Project Settings → API as a Secret on this host — never as NEXT_PUBLIC_.',
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requestOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (configured) return configured;
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');
  const proto =
    headerList.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  if (!host) return 'http://localhost:3000';
  return `${proto}://${host}`;
}

export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const admin = createSupabaseAdminClient();
  const needle = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new ConfigurationError(
        'The Auth admin key was rejected. Check SUPABASE_SECRET_KEY on this host.',
      );
    }
    const found = data.users.find((user) => user.email?.toLowerCase() === needle);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

function appAccessLink(origin: string, properties: unknown, type: AccessLinkType): string | null {
  const token = hashedTokenFrom(properties);
  if (!token) return null;
  return accessCallbackUrl(origin, token, type);
}

export async function issueRecoveryLink(input: {
  email: string;
  origin: string;
}): Promise<string | null> {
  const existing = await findAuthUserByEmail(input.email);
  if (!existing) return null;

  const admin = createSupabaseAdminClient();
  const redirectTo = `${input.origin.replace(/\/$/, '')}/auth/callback?next=/auth/set-password`;
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: input.email,
    options: { redirectTo },
  });
  const actionLink = appAccessLink(input.origin, data?.properties, 'recovery');
  if (error || !actionLink) {
    throw new BusinessRuleError(error?.message ?? 'Could not create a password link.');
  }
  return actionLink;
}

export async function issueAccessLink(input: {
  email: string;
  fullName: string;
  origin: string;
}): Promise<{ userId: string; actionLink: string; created: boolean; kind: AccessLinkType }> {
  const existing = await findAuthUserByEmail(input.email);
  const admin = createSupabaseAdminClient();
  const redirectTo = `${input.origin.replace(/\/$/, '')}/auth/callback?next=/auth/set-password`;

  if (existing) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: input.email,
      options: { redirectTo },
    });
    const actionLink = appAccessLink(input.origin, data?.properties, 'recovery');
    if (error || !actionLink) {
      throw new BusinessRuleError(error?.message ?? 'Could not create a password link.');
    }
    return { userId: existing.id, actionLink, created: false, kind: 'recovery' };
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: input.email,
    options: {
      data: { full_name: input.fullName },
      redirectTo,
    },
  });
  const actionLink = appAccessLink(input.origin, data?.properties, 'invite');
  if (error || !data?.user || !actionLink) {
    throw new BusinessRuleError(error?.message ?? 'Could not create the Auth account.');
  }
  return { userId: data.user.id, actionLink, created: true, kind: 'invite' };
}
