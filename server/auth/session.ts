/**
 * Who is asking, and what they are allowed to do.
 *
 * Identity comes from hosted Supabase Auth (NEXT_PUBLIC_SUPABASE_URL), verified
 * with getUser() against the auth server rather than decoded from the cookie.
 * Local `supabase start` is not involved in the running application.
 *
 * Authorisation is application RBAC in Postgres: permission codes, not role
 * names. A client that says it is an owner is simply a client that says so.
 * SUPER_ADMIN is a role that holds every permission; it is not
 * app.users.is_superuser, and that flag is not a bypass in this layer.
 *
 * The permission set is cached for the life of one request only. Caching it
 * longer would mean a revoked role stays effective until the cache expires,
 * which is exactly the wrong failure mode for a system holding money.
 */
import { cache } from 'react';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { PlatformModule, type PlatformModuleCode } from '@/lib/platform/modules';
import { ModuleNotEntitledError, NotFoundError, PermissionDeniedError } from '@/server/db/errors';
import { withActorRead, type RequestContext } from '@/server/db/transaction';
import type { PermissionCode } from '@/server/auth/permissions';

export interface EntityAccess {
  readonly entityId: string;
  readonly code: string;
  readonly name: string;
  readonly baseCurrency: string;
  readonly roles: readonly string[];
}

export interface Session {
  readonly userId: string;
  readonly email: string;
  readonly fullName: string;
  readonly isSuperAdmin: boolean;
  readonly entities: readonly EntityAccess[];
  readonly permissionsByEntity: ReadonlyMap<string, ReadonlySet<string>>;
  readonly modulesByEntity: ReadonlyMap<string, ReadonlySet<string>>;
  readonly requestId: string;
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase environment variables are not configured; see .env.example.');
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are immutable. The
          // middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * The current session, or null if nobody is signed in.
 *
 * Wrapped in React's `cache` so the several components that need it in one
 * render share a single verification and a single database round trip.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createSupabaseServerClient();

  // getUser, not getSession: this asks the auth server to verify the token
  // rather than trusting what is in the cookie.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  // Must run with app.current_user_id set. RLS on app.users is
  // `id = app.current_user_id()`; a bare pool.query sees zero rows, getSession
  // returns null, the layout redirects to /sign-in, and the proxy — which only
  // checks the Auth cookie — sends them straight back. That is a loop, not a
  // permission decision.
  //
  // app.users.id is the auth.users.id, so there is no separate mapping column
  // and no way for the two to drift apart. A superuser sees every active
  // entity; everyone else sees only those they hold an unexpired role in.
  const rows = await withActorRead(user.id, (query) =>
    query<{
      user_id: string;
      email: string;
      full_name: string;
      is_superuser: boolean;
      entity_id: string | null;
      entity_code: string | null;
      entity_name: string | null;
      base_currency: string | null;
      roles: string[] | null;
      permissions: string[] | null;
      modules: string[] | null;
    }>(
      `select u.id                 as user_id,
              u.email,
              u.full_name,
              u.is_superuser,
              e.id                 as entity_id,
              e.code               as entity_code,
              coalesce(e.trading_name, e.legal_name) as entity_name,
              e.base_currency_code as base_currency,
              (select array_agg(distinct r.code)
                 from app.user_roles ur
                 join app.roles r on r.id = ur.role_id
                where ur.user_id = u.id
                  and ur.entity_id = e.id
                  and (ur.expires_at is null or ur.expires_at > now())) as roles,
              (select array_agg(distinct p.permission_code)
                 from app.user_effective_permissions p
                where p.user_id = u.id
                  and p.entity_id = e.id) as permissions,
              (select coalesce(array_agg(em.module_code order by em.module_code), '{}')
                 from app.entity_modules em
                where em.entity_id = e.id
                  and em.enabled) as modules
         from app.users u
         left join app.entities e
           on e.is_active
          and (
            u.is_superuser
            or exists (
              select 1 from app.user_roles ur
               where ur.user_id = u.id
                 and ur.entity_id = e.id
                 and (ur.expires_at is null or ur.expires_at > now())
            )
          )
        where u.id = $1
          and u.is_active
        order by e.code`,
      [user.id],
    ),
  );

  const first = rows[0];
  if (!first) {
    // Authenticated with Supabase but not provisioned in the application. This
    // is a legitimate state during onboarding, and it grants nothing.
    return null;
  }

  const entities: EntityAccess[] = [];
  const permissionsByEntity = new Map<string, ReadonlySet<string>>();
  const modulesByEntity = new Map<string, ReadonlySet<string>>();

  for (const row of rows) {
    if (!row.entity_id || !row.entity_code || !row.entity_name) continue;
    entities.push({
      entityId: row.entity_id,
      code: row.entity_code,
      name: row.entity_name,
      baseCurrency: row.base_currency ?? 'KES',
      roles: row.roles ?? [],
    });
    permissionsByEntity.set(
      row.entity_id,
      new Set((row.permissions ?? []).filter((p): p is string => p !== null)),
    );
    modulesByEntity.set(
      row.entity_id,
      new Set((row.modules ?? []).filter((code): code is string => code !== null)),
    );
  }

  return {
    userId: first.user_id,
    email: first.email,
    fullName: first.full_name,
    isSuperAdmin: first.is_superuser,
    entities,
    permissionsByEntity,
    modulesByEntity,
    requestId: randomUUID(),
  };
});

/** The session, or a thrown error. For anything behind the sign-in wall. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new PermissionDeniedError('You need to sign in to do that');
  return session;
}

/**
 * The entity the user is working in.
 *
 * Read from a cookie for convenience, but validated against the entities the
 * user actually has a role in. A user who edits the cookie to another entity's
 * id gets an error, not that entity's books.
 */
export async function resolveEntity(session: Session, requested?: string): Promise<EntityAccess> {
  const cookieStore = await cookies();
  const candidate = requested ?? cookieStore.get('skyjet_entity')?.value;

  if (candidate) {
    const match = session.entities.find((e) => e.entityId === candidate);
    if (match) return match;
    throw new PermissionDeniedError('You do not have access to that entity');
  }

  const only = session.entities[0];
  if (!only) {
    throw new NotFoundError('You have not been granted access to any entity yet');
  }
  return only;
}

/**
 * Session, entity and request context in one call, with a permission asserted.
 *
 * This is the intended entry point for every server action and page. Asking
 * for the context and asking whether the caller may proceed is one step, so
 * there is no shape of code where someone obtains a context and forgets the
 * check.
 */
export async function authorise(
  permission: PermissionCode | readonly PermissionCode[],
  options: { entityId?: string; module?: PlatformModuleCode | null } = {},
): Promise<{ session: Session; entity: EntityAccess; context: RequestContext }> {
  const session = await requireSession();
  const entity = await resolveEntity(session, options.entityId);

  const moduleCode = options.module === undefined ? PlatformModule.BusinessSuite : options.module;
  if (moduleCode) {
    assertModuleEntitled(session, entity.entityId, moduleCode);
  }

  const required = typeof permission === 'string' ? [permission] : permission;
  const held = session.permissionsByEntity.get(entity.entityId) ?? new Set<string>();

  const missing = required.filter((p) => !held.has(p));
  if (missing.length > 0) {
    throw new PermissionDeniedError(
      `You do not have permission to do that (${missing.join(', ')} required)`,
    );
  }

  return {
    session,
    entity,
    context: {
      userId: session.userId,
      entityId: entity.entityId,
      requestId: session.requestId,
    },
  };
}

/** Whether the caller holds a permission. For hiding buttons, not for guarding. */
export function can(session: Session, entityId: string, permission: PermissionCode): boolean {
  return session.permissionsByEntity.get(entityId)?.has(permission) ?? false;
}

/** Whether the organisation is entitled to a module. For hiding cards, not for guarding. */
export function canAccessModule(
  session: Session,
  entityId: string,
  module: PlatformModuleCode,
): boolean {
  return session.modulesByEntity.get(entityId)?.has(module) ?? false;
}

export function assertModuleEntitled(
  session: Session,
  entityId: string,
  module: PlatformModuleCode,
): void {
  if (!canAccessModule(session, entityId, module)) {
    throw new ModuleNotEntitledError(module);
  }
}
