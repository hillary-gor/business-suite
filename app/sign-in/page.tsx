import { redirect } from 'next/navigation';
import { getSession } from '@/server/auth/session';
import { safeNextPath } from '@/server/auth/access-link';
import { postSignInPath } from '@/lib/platform/entry';
import { SignInForm } from './sign-in-form';
import { AuthShell } from '@/components/platform/auth-shell';
import { PlatformAuthBrand } from '@/components/platform/auth-brand';

export const metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const { next, reason } = await searchParams;
  const nextPath = postSignInPath(safeNextPath(next, '/workspace'));

  const session = await getSession();
  if (session) redirect(nextPath);

  return (
    <AuthShell>
      <PlatformAuthBrand />
      <SignInForm nextPath={nextPath} reason={reason} />
    </AuthShell>
  );
}
