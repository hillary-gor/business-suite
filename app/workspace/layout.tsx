import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/server/auth/session';
import { SignOutButton } from '@/components/platform/sign-out-button';
import { SkyjetMark } from '@/components/platform/skyjet-mark';
import { ColorModeToggle } from '@/components/platform/color-mode-toggle';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/sign-in?next=/workspace');

  const initials = session.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="workspace-shell">
      <header className="workspace-shell__bar">
        <Link href="/workspace" className="workspace-shell__home">
          <SkyjetMark className="workspace-shell__mark" size={32} />
          <span className="workspace-shell__identity">
            <span className="workspace-shell__brand">Skyjet</span>
            <span className="workspace-shell__product">ERP portal</span>
          </span>
        </Link>
        <div className="workspace-shell__user">
          <ColorModeToggle />
          <span className="user-chip">
            <span className="user-chip__avatar" aria-hidden="true">
              {initials || '•'}
            </span>
            <span className="user-chip__name">{session.fullName}</span>
          </span>
          <SignOutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
