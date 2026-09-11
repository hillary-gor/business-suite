import { redirect } from 'next/navigation';
import { postSignInPath } from '@/lib/platform/entry';
import { safeNextPath } from '@/server/auth/access-link';

export const metadata = { title: 'Sign in' };

export default async function LoginAliasPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = postSignInPath(safeNextPath(next, '/workspace'));
  redirect(`/sign-in?next=${encodeURIComponent(destination)}`);
}
