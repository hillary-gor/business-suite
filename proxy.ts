/**
 * Session refresh and the sign-in wall.
 *
 * Supabase access tokens are short lived. Without a refresh on each request a
 * user gets signed out halfway through entering a document, which in a system
 * where a half-finished document is a real document is worse than an
 * inconvenience.
 *
 * This is emphatically **not** the authorisation boundary. A proxy runs before
 * the request reaches the application and has been bypassable in the past
 * (CVE-2025-29927), so treating it as the thing that keeps people out would be
 * a mistake. It performs one optimistic check — is anyone signed in at all —
 * and every page and every server action independently calls `authorise()`,
 * which resolves the caller's roles from the database and refuses if they lack
 * the permission. The database then refuses again through RLS and the
 * privileges on the application role. Removing this file would cost users a
 * redirect; it would not grant anybody access to anything.
 *
 * The list of public paths is an allowlist, so a page added tomorrow is
 * private until someone deliberately makes it public.
 *
 * Named `proxy.ts` because Next.js 16 renamed the convention. A leftover
 * `middleware.ts` is silently ignored rather than erroring, so the old file is
 * deleted rather than left in place.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_PATHS = [
  '/sign-in',
  '/auth/callback',
  '/auth/set-password',
  '/auth/forgot-password',
  '/auth/error',
  '/entity-logo',
];

export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Misconfiguration must fail closed. An unconfigured deployment that
    // served pages anyway would be serving them without authentication.
    const path = request.nextUrl.pathname;
    if (path === '/auth/error') return response;
    return NextResponse.redirect(new URL('/auth/error?reason=configuration', request.url));
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        for (const { name, value } of toSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser verifies the token with the auth server and refreshes it if it has
  // expired, rather than trusting whatever the cookie claims.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const signIn = new URL('/sign-in', request.url);
    // Remember where they were going so they land there after signing in.
    signIn.searchParams.set('next', `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(signIn);
  }

  if (user && path === '/sign-in') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and the image optimiser.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
