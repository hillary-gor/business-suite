import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SET_PASSWORD_COOKIE } from '@/server/auth/access-link';
import { createSupabaseServerClient } from '@/server/auth/session';
import { SetPasswordForm } from './set-password-form';
import { AuthShell } from '@/components/platform/auth-shell';
import { PlatformAuthBrand } from '@/components/platform/auth-brand';

export const metadata = { title: 'Set your password' };

export default async function SetPasswordPage() {
  const cookieStore = await cookies();
  const fromEmailLink = cookieStore.get(SET_PASSWORD_COOKIE)?.value === '1';
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !fromEmailLink) {
    redirect('/workspace');
  }

  return (
    <AuthShell>
      <PlatformAuthBrand
        title="Set your password"
        description={
          user && fromEmailLink
            ? `Choose a password for ${user.email}. You will use it with that address to sign in.`
            : 'This page only works after you open the link from your invite or password email. The link expires after 24 hours.'
        }
      />
      {user && fromEmailLink ? (
        <SetPasswordForm />
      ) : (
        <p className="signin__back">
          <Link href="/auth/forgot-password">Request a new link</Link>
          {' · '}
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      )}
    </AuthShell>
  );
}
