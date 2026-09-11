import { describe, expect, it } from 'vitest';
import { ConfigurationError } from './errors';
import { assertDatabaseUrl } from './database-url';

const good =
  'postgresql://skyjet_app_login.ref:secret@aws-1-eu-west-1.pooler.supabase.com:6543/postgres';

describe('assertDatabaseUrl', () => {
  it('accepts a pooled application login URL', () => {
    expect(() => assertDatabaseUrl(good, { vercel: true })).not.toThrow();
  });

  it('rejects leftover ${} interpolation that Vercel will not expand', () => {
    expect(() =>
      assertDatabaseUrl(
        'postgresql://skyjet_app_login.ref:${SKYJET_APP_PASSWORD}@aws-1-eu-west-1.pooler.supabase.com:6543/postgres',
        { vercel: true },
      ),
    ).toThrow(ConfigurationError);
  });

  it('rejects the database owner', () => {
    expect(() =>
      assertDatabaseUrl(
        'postgresql://postgres.ref:secret@aws-1-eu-west-1.pooler.supabase.com:6543/postgres',
        { vercel: true },
      ),
    ).toThrow(/skyjet_app_login/);
  });

  it('rejects the session-mode pooler port on Vercel', () => {
    expect(() =>
      assertDatabaseUrl(
        'postgresql://skyjet_app_login.ref:secret@aws-1-eu-west-1.pooler.supabase.com:5432/postgres',
        { vercel: true },
      ),
    ).toThrow(/6543/);
  });
});
