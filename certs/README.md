# TLS certificates

`supabase-prod-ca-2021.crt` is the public certificate authority that signs
hosted Supabase Postgres and pooler endpoints. Node's Mozilla bundle does not
include it, so a connection that asks for a verified certificate fails with
`SELF_SIGNED_CERT_IN_CHAIN` unless this file (or an equivalent
`DATABASE_SSL_CA`) is supplied.

The application pool loads it automatically for `*.supabase.com` hosts. Scripts
that open their own `pg` client should do the same via `scripts/lib/pg-ssl.mjs`.

Fingerprints (SHA-256):

- Supabase Intermediate 2021 CA
  `30:3B:0A:59:BB:C8:D7:7E:96:7F:BE:D2:0B:3F:E6:8E:C5:D7:D3:91:C3:08:1E:CE:99:36:EF:CE:EF:0A:55:EA`
- Supabase Root 2021 CA
  `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`
