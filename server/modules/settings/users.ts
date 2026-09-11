import {
  withReadOnlyTransaction,
  withTransaction,
  type RequestContext,
  type Transaction,
} from '@/server/db/transaction';
import type {
  ProvisionUserInput,
  SetUserActiveInput,
  SetUserRoleInput,
  UpdateOwnProfileInput,
} from './schemas';

export interface EntityUser {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
  isActive: boolean;
  roleCodes: string[];
  roleNames: string[];
}

export interface AssignableRole {
  code: string;
  name: string;
  description: string;
}

const ROLE_ORDER = [
  'sales',
  'procurement',
  'inventory',
  'warehouse_operator',
  'accountant',
  'manager',
  'viewer',
  'super_admin',
  'owner',
] as const;

function roleRank(code: string): number {
  const index = ROLE_ORDER.indexOf(code as (typeof ROLE_ORDER)[number]);
  return index === -1 ? ROLE_ORDER.length : index;
}

export async function listAssignableRoles(context: RequestContext): Promise<AssignableRole[]> {
  const rows = await withReadOnlyTransaction(context, (tx) =>
    tx.query<AssignableRole>(`select code, name, description from app.roles order by name`),
  );
  return [...rows].sort(
    (a, b) => roleRank(a.code) - roleRank(b.code) || a.name.localeCompare(b.name),
  );
}

export async function listEntityUsers(context: RequestContext): Promise<EntityUser[]> {
  const rows = await withReadOnlyTransaction(context, (tx) =>
    tx.query<{
      id: string;
      email: string;
      full_name: string;
      job_title: string | null;
      is_active: boolean;
      role_codes: string[];
      role_names: string[];
    }>(
      `select u.id, u.email, u.full_name, u.job_title, u.is_active,
              coalesce(
                array_agg(r.code order by
                  case r.code
                    when 'owner' then 0
                    when 'super_admin' then 1
                    else 2
                  end, r.code)
                filter (where r.id is not null),
                '{}'
              ) as role_codes,
              coalesce(
                array_agg(r.name order by
                  case r.code
                    when 'owner' then 0
                    when 'super_admin' then 1
                    else 2
                  end, r.code)
                filter (where r.id is not null),
                '{}'
              ) as role_names
         from app.users u
         join app.user_roles ur on ur.user_id = u.id and ur.entity_id = $1
         join app.roles r on r.id = ur.role_id
        where ur.expires_at is null or ur.expires_at > now()
        group by u.id, u.email, u.full_name, u.job_title, u.is_active
        order by u.full_name`,
      [context.entityId],
    ),
  );
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    jobTitle: row.job_title,
    isActive: row.is_active,
    roleCodes: row.role_codes,
    roleNames: row.role_names,
  }));
}

export async function lookupAuthUserId(
  context: RequestContext,
  email: string,
): Promise<string | null> {
  return withReadOnlyTransaction(context, (tx) =>
    tx.scalar<string | null>(`select app.auth_user_id_for_email($1, $2)`, [
      context.entityId,
      email,
    ]),
  );
}

export async function provisionEntityUser(
  context: RequestContext,
  input: ProvisionUserInput & { userId: string },
) {
  return withTransaction(context, async (tx) => {
    const userId = await tx.scalar<string>(
      `select app.provision_entity_user($1, $2::uuid, $3, $4, $5)`,
      [context.entityId, input.userId, input.email, input.fullName, input.roleCode],
    );
    return { userId };
  });
}

export async function setEntityUserRole(
  context: RequestContext,
  input: SetUserRoleInput & { email: string; fullName: string },
) {
  return provisionEntityUser(context, {
    userId: input.userId,
    email: input.email,
    fullName: input.fullName,
    roleCode: input.roleCode,
  });
}

export async function setEntityUserActive(context: RequestContext, input: SetUserActiveInput) {
  return withTransaction(context, async (tx) => {
    const userId = await tx.scalar<string>(`select app.set_entity_user_active($1, $2::uuid, $3)`, [
      context.entityId,
      input.userId,
      input.isActive,
    ]);
    return { userId };
  });
}

export interface OwnProfile {
  email: string;
  fullName: string;
  jobTitle: string | null;
  phone: string | null;
}

export async function getOwnProfile(context: RequestContext): Promise<OwnProfile> {
  return withReadOnlyTransaction(context, (tx) => queryOwnProfile(tx, context.userId));
}

export async function queryOwnProfile(tx: Transaction, userId: string): Promise<OwnProfile> {
  const row = await tx.one<{
    email: string;
    full_name: string;
    job_title: string | null;
    phone: string | null;
  }>(
    `select email, full_name, job_title, phone
       from app.users
      where id = $1`,
    [userId],
  );
  return {
    email: row.email,
    fullName: row.full_name,
    jobTitle: row.job_title,
    phone: row.phone,
  };
}

export async function updateOwnProfile(context: RequestContext, input: UpdateOwnProfileInput) {
  return withTransaction(context, async (tx) => {
    const userId = await tx.scalar<string>(`select app.update_own_profile($1, $2, $3)`, [
      input.fullName,
      input.jobTitle ?? '',
      input.phone ?? '',
    ]);
    return { userId };
  });
}
