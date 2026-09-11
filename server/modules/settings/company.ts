import {
  withReadOnlyTransaction,
  withTransaction,
  withUnauthenticatedRead,
  type RequestContext,
} from '@/server/db/transaction';
import type { SaveEntityInput } from './schemas';

export async function getPublicCompanyBrand(): Promise<{
  displayName: string | null;
  hasLogo: boolean;
  cacheKey: string | null;
} | null> {
  try {
    const row = await withUnauthenticatedRead((query) =>
      query<{ display_name: string | null; has_logo: boolean; cache_key: string | null }>(
        `select display_name, has_logo, cache_key from app.public_company_brand()`,
      ).then((rows) => rows[0] ?? null),
    );
    if (!row) return null;
    return {
      displayName: row.display_name,
      hasLogo: row.has_logo,
      cacheKey: row.cache_key,
    };
  } catch {
    return null;
  }
}

export async function getPublicCompanyLogo(): Promise<{
  mime: string;
  bytes: Buffer;
} | null> {
  const row = await withUnauthenticatedRead((query) =>
    query<{ mime: string; bytes: Buffer }>(`select mime, bytes from app.public_company_logo()`).then(
      (rows) => rows[0] ?? null,
    ),
  );
  if (!row?.mime || !row.bytes) return null;
  const bytes = Buffer.isBuffer(row.bytes) ? row.bytes : Buffer.from(row.bytes as unknown as Uint8Array);
  return { mime: row.mime, bytes };
}

export async function getEntityProfile(context: RequestContext) {
  return withReadOnlyTransaction(context, (tx) =>
    tx.one<{
      code: string;
      legal_name: string;
      trading_name: string | null;
      tax_pin: string | null;
      registration_number: string | null;
      country_code: string;
      base_currency_code: string;
      fiscal_year_start_month: number;
      timezone: string;
      address_line1: string | null;
      address_line2: string | null;
      city: string | null;
      postal_code: string | null;
      phone: string | null;
      email: string | null;
      has_logo: boolean;
      updated_at: string;
    }>(
      `select code, legal_name, trading_name, tax_pin, registration_number,
              country_code, base_currency_code, fiscal_year_start_month, timezone,
              address_line1, address_line2, city, postal_code, phone, email,
              (logo_bytes is not null) as has_logo, updated_at::text as updated_at
         from app.entities
        where id = $1`,
      [context.entityId],
    ),
  );
}

export async function saveEntity(context: RequestContext, input: SaveEntityInput) {
  return withTransaction(context, async (tx) => {
    const entityId = await tx.scalar<string>(`select app.save_entity($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        legal_name: input.legalName,
        trading_name: input.tradingName || null,
        tax_pin: input.taxPin || null,
        registration_number: input.registrationNumber || null,
        country_code: input.countryCode ?? null,
        fiscal_year_start_month: input.fiscalYearStartMonth ?? null,
        timezone: input.timezone ?? null,
        address_line1: input.addressLine1 || null,
        address_line2: input.addressLine2 || null,
        city: input.city || null,
        postal_code: input.postalCode || null,
        phone: input.phone || null,
        email: input.email || null,
      }),
    ]);
    return { entityId };
  });
}

export async function saveEntityLogo(
  context: RequestContext,
  input: { mimeType: string; bytes: Buffer } | { clear: true },
) {
  return withTransaction(context, async (tx) => {
    if ('clear' in input) {
      await tx.scalar<string>(`select app.save_entity_logo($1, null, null)`, [context.entityId]);
      return { entityId: context.entityId };
    }
    await tx.query(`select app.save_entity_logo($1, $2, $3::bytea)`, [
      context.entityId,
      input.mimeType,
      input.bytes,
    ]);
    return { entityId: context.entityId };
  });
}

export async function listAuditLog(context: RequestContext) {
  return withReadOnlyTransaction(context, (tx) =>
    tx.query<{
      id: string;
      occurred_at: string;
      actor_name: string | null;
      operation: string;
      schema_name: string;
      table_name: string;
      record_id: string | null;
      changed_fields: string[] | null;
    }>(
      `select l.id::text,
              l.occurred_at::text,
              u.full_name as actor_name,
              l.operation,
              l.schema_name,
              l.table_name,
              l.record_id,
              l.changed_fields
         from audit.log l
         left join app.users u on u.id = l.actor_user_id
        where l.entity_id = $1
        order by l.occurred_at desc
        limit 200`,
      [context.entityId],
    ),
  );
}
