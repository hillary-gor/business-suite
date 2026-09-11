'use server';

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { issueRecoveryLink, requestOrigin, supabaseSecretKey } from '@/server/auth/admin';
import { SET_PASSWORD_COOKIE, setPasswordCookieOptions } from '@/server/auth/access-link';
import { createSupabaseServerClient, requireSession, resolveEntity } from '@/server/auth/session';
import { userMessage } from '@/server/db/errors';
import { sendAccessEmail } from '@/server/mail/access';
import { getPublicCompanyBrand } from '@/server/modules/settings/company';
import { requestPasswordResetInput, setPasswordInput } from '@/server/modules/settings/schemas';

const RESET_ACK =
  'If that address has an account, we have sent a link to set a password. Check the inbox, including spam.';

export async function requestPasswordResetAction(
  raw: unknown,
): Promise<{ ok: true; message: string }> {
  const parsed = requestPasswordResetInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: true, message: RESET_ACK };
  }

  const email = parsed.data.email.trim().toLowerCase();

  try {
    if (!supabaseSecretKey() || !process.env.RESEND_API_KEY?.trim()) {
      return { ok: true, message: RESET_ACK };
    }

    const origin = await requestOrigin();
    const actionUrl = await issueRecoveryLink({
      email,
      origin,
    });
    if (!actionUrl) {
      return { ok: true, message: RESET_ACK };
    }

    const brand = await getPublicCompanyBrand();
    await sendAccessEmail({
      kind: 'recovery',
      to: email,
      recipientName: email.split('@')[0] ?? 'there',
      companyName: brand?.displayName ?? 'SkyJet Aircraft Spares',
      actionUrl,
    });
  } catch (error) {
    console.error('[action:requestPasswordReset]', error);
  }

  return { ok: true, message: RESET_ACK };
}

export async function setPasswordAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = setPasswordInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the password fields.' };
  }

  const cookieStore = await cookies();
  if (cookieStore.get(SET_PASSWORD_COOKIE)?.value !== '1') {
    return {
      ok: false,
      error: 'This page only works after you open the link from your invite or password email.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: 'This page only works after you open the link from your invite or password email.',
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { ok: false, error: error.message };
  }
  const proto = (await headers()).get('x-forwarded-proto') ?? 'http';
  cookieStore.set(SET_PASSWORD_COOKIE, '', {
    ...setPasswordCookieOptions(proto === 'https'),
    maxAge: 0,
  });
  return { ok: true };
}

export type SwitchEntityResult = { ok: true; data: undefined } | { ok: false; error: string };

/**
 * Sets the entity the user is working in.
 *
 * This is a platform action: it must not require a Business Suite entitlement,
 * or a library-only organisation could not switch entities from the workspace.
 * The cookie is only accepted later if resolveEntity still matches a role.
 */
export async function switchEntityAction(entityId: string): Promise<SwitchEntityResult> {
  try {
    const session = await requireSession();
    await resolveEntity(session, entityId);

    const store = await cookies();
    store.set('skyjet_entity', entityId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });

    revalidatePath('/', 'layout');
    revalidatePath('/workspace');
    revalidatePath('/library', 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
}
