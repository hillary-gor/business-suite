import { describe, expect, it } from 'vitest';
import { accessCallbackUrl, hashedTokenFrom, safeNextPath } from './access-link';

describe('accessCallbackUrl', () => {
  it('points at this app with a token_hash, not GoTrue verify', () => {
    const url = accessCallbackUrl(
      'https://skyjet-business-suite.vercel.app',
      'abc123',
      'invite',
    );
    expect(url).toBe(
      'https://skyjet-business-suite.vercel.app/auth/callback?token_hash=abc123&type=invite&next=%2Fauth%2Fset-password',
    );
    expect(url).not.toContain('/auth/v1/verify');
  });

  it('strips a trailing slash on the origin', () => {
    const url = accessCallbackUrl('https://example.test/', 'tok', 'recovery');
    expect(url.startsWith('https://example.test/auth/callback?')).toBe(true);
    expect(url).toContain('type=recovery');
  });
});

describe('hashedTokenFrom', () => {
  it('reads generateLink properties', () => {
    expect(hashedTokenFrom({ hashed_token: 'pkce_or_hash' })).toBe('pkce_or_hash');
    expect(hashedTokenFrom({ action_link: 'https://x/auth/v1/verify' })).toBeNull();
    expect(hashedTokenFrom(null)).toBeNull();
  });
});

describe('safeNextPath', () => {
  it('allows in-app paths and rejects open redirects', () => {
    expect(safeNextPath('/auth/set-password')).toBe('/auth/set-password');
    expect(safeNextPath('/sales')).toBe('/sales');
    expect(safeNextPath('https://evil.example/')).toBe('/auth/set-password');
    expect(safeNextPath('//evil.example')).toBe('/auth/set-password');
    expect(safeNextPath('\\evil')).toBe('/auth/set-password');
    expect(safeNextPath(null)).toBe('/auth/set-password');
  });
});
