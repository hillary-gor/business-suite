import { redirect } from 'next/navigation';
import { PLATFORM_HOME, PLATFORM_SIGN_IN } from '@/lib/platform/entry';
import { getSession } from '@/server/auth/session';

export const metadata = { title: 'Skyjet Portal' };

/**
 * Domain front door. `/` is the portal, not Business Suite. Signed-in people
 * choose a module at `/workspace`; everyone else sees the unified login.
 */
export default async function PortalPage() {
  const session = await getSession();
  redirect(session ? PLATFORM_HOME : PLATFORM_SIGN_IN);
}
