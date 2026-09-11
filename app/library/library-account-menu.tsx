'use client';

import { useEffect, useRef, useState } from 'react';
import { EntityPicker } from '@/components/platform/entity-picker';
import { SignOutButton } from '@/components/platform/sign-out-button';
import { ColorModeToggle } from '@/components/platform/color-mode-toggle';
import { WorkspaceSwitch } from '@/components/platform/workspace-switch';
import { LibraryDialog } from '@/app/library/library-dialog';
import { LibraryProfileForm } from '@/app/library/library-profile-form';
import { IconLogout, IconSwitch, IconUser } from '@/app/library/library-icons';
import type { OwnProfile } from '@/server/modules/settings/users';

type EntityOption = { entityId: string; code: string; name: string };

export function LibraryAccountMenu({
  fullName,
  initials,
  email,
  entities,
  currentEntityId,
  profile,
}: {
  fullName: string;
  initials: string;
  email: string;
  entities: readonly EntityOption[];
  currentEntityId: string;
  profile: OwnProfile;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="library-account" ref={rootRef}>
      <button
        type="button"
        className="library-account__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="user-chip__avatar" aria-hidden="true">
          {initials || '•'}
        </span>
        <span className="library-account__who">
          <span className="library-account__name">{fullName}</span>
          <span className="library-account__email">{email}</span>
        </span>
      </button>
      {open ? (
        <div className="library-account__menu" role="menu">
          <div className="library-account__compact">
            <span className="library-account__compact-label">Appearance</span>
            <ColorModeToggle />
          </div>
          <WorkspaceSwitch className="library-account__item library-account__item--compact">
            <IconSwitch />
            Switch workspace
          </WorkspaceSwitch>
          <button
            type="button"
            className="library-account__item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setProfileOpen(true);
            }}
          >
            <IconUser />
            Profile settings
          </button>
          {entities.length > 1 ? (
            <div className="library-account__picker">
              <EntityPicker entities={[...entities]} current={currentEntityId} hideLabel />
            </div>
          ) : null}
          <SignOutButton className="library-account__item library-account__item--danger">
            <IconLogout />
            Sign out
          </SignOutButton>
        </div>
      ) : null}
      {profileOpen ? (
        <LibraryDialog title="Profile settings" wide onClose={() => setProfileOpen(false)}>
          <LibraryProfileForm profile={profile} onSaved={() => setProfileOpen(false)} />
        </LibraryDialog>
      ) : null}
    </div>
  );
}
