import Link from 'next/link';
import { AuthShell } from '@/components/platform/auth-shell';
import { PlatformAuthBrand } from '@/components/platform/auth-brand';

export const metadata = { title: 'Problem signing in' };

const REASONS: Record<string, string> = {
  configuration:
    'The application is not configured correctly, so it refused to serve the page rather than risk serving it without authentication. An administrator needs to check the environment configuration.',
  link: 'That invite or password link is missing, already used, or has expired. Ask an administrator to email a new one, or request a link from Forgot password.',
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <AuthShell>
      <PlatformAuthBrand title="Cannot sign you in" description={null} />
      <p className="signin__sub">
        {REASONS[reason ?? ''] ??
          'Something went wrong while establishing your session. Try again, and tell an administrator if it keeps happening.'}
      </p>
      <div className="button-row" style={{ marginTop: 20 }}>
        <Link href="/sign-in" className="button button--primary">
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}
