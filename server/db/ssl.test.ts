import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isSupabaseHost, resolveSsl } from './pool';
import { SUPABASE_PROD_CA_2021 } from './supabase-ca';

describe('resolveSsl', () => {
  const previous = process.env.DATABASE_SSL;
  const previousCa = process.env.DATABASE_SSL_CA;

  afterEach(() => {
    if (previous === undefined) delete process.env.DATABASE_SSL;
    else process.env.DATABASE_SSL = previous;
    if (previousCa === undefined) delete process.env.DATABASE_SSL_CA;
    else process.env.DATABASE_SSL_CA = previousCa;
  });

  it('disables TLS for localhost', () => {
    delete process.env.DATABASE_SSL;
    expect(resolveSsl('postgresql://skyjet_app@127.0.0.1:54322/postgres')).toBe(false);
  });

  it('trusts the bundled Supabase CA for pooler hosts', () => {
    delete process.env.DATABASE_SSL;
    delete process.env.DATABASE_SSL_CA;
    const ssl = resolveSsl(
      'postgresql://skyjet_app.ref@aws-1-eu-west-1.pooler.supabase.com:6543/postgres',
    );
    expect(ssl).not.toBe(false);
    if (ssl === false) return;
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.ca).toContain('BEGIN CERTIFICATE');
    expect(ssl.ca).toBe(SUPABASE_PROD_CA_2021);
  });

  it('keeps the on-disk CA file in step with the inlined copy', () => {
    const file = readFileSync(resolve('certs/supabase-prod-ca-2021.crt'), 'utf8');
    const pems = (text: string) =>
      [...text.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)].map((m) =>
        m[0].replace(/\s+/g, ''),
      );
    expect(pems(file)).toEqual(pems(SUPABASE_PROD_CA_2021));
  });
});

describe('isSupabaseHost', () => {
  it('matches the pooler and the direct host', () => {
    expect(isSupabaseHost('postgresql://u@aws-1-eu-west-1.pooler.supabase.com:6543/postgres')).toBe(
      true,
    );
    expect(isSupabaseHost('postgresql://u@db.abc.supabase.co:5432/postgres')).toBe(true);
  });

  it('does not match localhost or an unrelated host', () => {
    expect(isSupabaseHost('postgresql://u@127.0.0.1:54322/postgres')).toBe(false);
    expect(isSupabaseHost('postgresql://u@db.example.com:5432/postgres')).toBe(false);
  });
});
