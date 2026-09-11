import { createServerClient } from '@supabase/ssr';
import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath, SET_PASSWORD_COOKIE, setPasswordCookieOptions } from '@/server/auth/access-link';

const OTP_TYPES = new Set<string>(['invite', 'recovery', 'magiclink', 'signup', 'email']);

/**
 * Completes invite and recovery links issued by generateLink().
 *
 * The emailed URL is this route with token_hash, not GoTrue's /verify
 * action_link. verifyOtp runs here so the session is written onto the
 * redirect response cookies, then the person can set a password.
 */
export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const next = safeNextPath(request.nextUrl.searchParams.get('next'));
  const destination = new URL(next, request.url);

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.redirect(new URL('/auth/error?reason=configuration', request.url));
  }

  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const typeParam = request.nextUrl.searchParams.get('type');
  const code = request.nextUrl.searchParams.get('code');
  const type = typeParam && OTP_TYPES.has(typeParam) ? (typeParam as EmailOtpType) : null;

  if ((!tokenHash || !type) && !code) {
    return NextResponse.redirect(new URL('/auth/error?reason=link', request.url));
  }

  let response = NextResponse.redirect(destination);
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        for (const { name, value } of toSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.redirect(destination);
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { error } =
    tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : await supabase.auth.exchangeCodeForSession(code as string);

  if (error) {
    return NextResponse.redirect(new URL('/auth/error?reason=link', request.url));
  }

  response.cookies.set(
    SET_PASSWORD_COOKIE,
    '1',
    setPasswordCookieOptions(request.nextUrl.protocol === 'https:'),
  );
  return response;
}
