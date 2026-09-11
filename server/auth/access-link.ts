/**
 * Invite and recovery emails must land on this application with a token_hash.
 *
 * generateLink() also returns an action_link that points at GoTrue's
 * /auth/v1/verify endpoint. That URL completes confirmation on Auth, then
 * redirects here with implicit hash tokens. The browser client uses PKCE and
 * ignores those fragments, so updateUser() has no session and the person
 * cannot sign in with the password they think they chose.
 */

export type AccessLinkType = 'invite' | 'recovery';

export function accessCallbackUrl(
  origin: string,
  tokenHash: string,
  type: AccessLinkType,
): string {
  const url = new URL('/auth/callback', `${origin.replace(/\/$/, '')}/`);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', type);
  url.searchParams.set('next', '/auth/set-password');
  return url.toString();
}

export function hashedTokenFrom(properties: unknown): string | null {
  if (!properties || typeof properties !== 'object') return null;
  const token = (properties as { hashed_token?: unknown }).hashed_token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

/** Marks that this browser arrived from an invite or recovery email. */
export const SET_PASSWORD_COOKIE = 'skyjet_password_setup';

export function setPasswordCookieOptions(secure: boolean): {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 30,
  };
}

export function safeNextPath(value: string | null | undefined, fallback = '/auth/set-password'): string {
  if (!value) return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (value.includes('://') || value.includes('\\')) return fallback;
  return value;
}
