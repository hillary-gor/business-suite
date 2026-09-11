'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SkyjetMark } from '@/components/platform/skyjet-mark';
import type {
  LibraryClassification,
  LibraryDocumentType,
  LibraryNotification,
} from '@/server/modules/library/types';
import type { OwnProfile } from '@/server/modules/settings/users';
import {
  IconBuilding,
  IconChevron,
  IconCollapse,
  IconFile,
  IconFolder,
  IconGear,
  IconHelp,
  IconHome,
  IconMenu,
  IconClose,
  IconPeople,
  IconShield,
  IconStack,
  IconUpload,
  IconUser,
} from '@/app/library/library-icons';
import { libraryPathIsCurrent, LIBRARY_DRAWER_MEDIA } from '@/app/library/nav';
import { LibrarySearchProvider, LibrarySearchTrigger } from '@/app/library/library-search';
import { LibraryDialog } from '@/app/library/library-dialog';
import { LibraryUploadForm } from '@/app/library/documents/new/upload-form';
import { LibraryNotifications } from '@/app/library/library-notifications';
import { LibraryAccountMenu } from '@/app/library/library-account-menu';
import { ColorModeToggle } from '@/components/platform/color-mode-toggle';
import { WorkspaceSwitch } from '@/components/platform/workspace-switch';

const COLLAPSE_KEY = 'skyjet.library.sidebarCollapsed';

const LibraryChromeContext = createContext<{
  mayUpload: boolean;
  openUpload: () => void;
} | null>(null);

export function useLibraryUpload() {
  const value = useContext(LibraryChromeContext);
  if (!value) throw new Error('useLibraryUpload must be used inside LibraryChrome');
  return value;
}

type CategoryLink = {
  code: LibraryDocumentType | string;
  name: string;
  count: number;
};

type CollectionLink = {
  id: string;
  name: string;
  count: number;
};

type EntityOption = { entityId: string; code: string; name: string };

export function LibraryChrome({
  productName,
  entityName,
  entities,
  currentEntityId,
  fullName,
  initials,
  email,
  profile,
  categories,
  collections,
  mayUpload,
  allowedClassifications,
  mayCompany,
  mayUsers,
  mayAccess,
  userId,
  notifications,
  children,
}: {
  productName: string;
  entityName: string;
  entities: readonly EntityOption[];
  currentEntityId: string;
  fullName: string;
  initials: string;
  email: string;
  profile: OwnProfile;
  categories: readonly CategoryLink[];
  collections: readonly CollectionLink[];
  mayUpload: boolean;
  allowedClassifications: readonly LibraryClassification[];
  mayCompany: boolean;
  mayUsers: boolean;
  mayAccess: boolean;
  userId: string;
  notifications: readonly LibraryNotification[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(true);
  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const chrome = useMemo(
    () => ({
      mayUpload,
      openUpload: () => setUploadOpen(true),
    }),
    [mayUpload],
  );

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia(LIBRARY_DRAWER_MEDIA);
    const closeOnDesktop = () => {
      if (!media.matches) setNavOpen(false);
    };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      // private mode
    }
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // private mode
      }
      return next;
    });
  }

  const shellClass = [
    'library-shell',
    navOpen ? 'is-nav-open' : '',
    collapsed ? 'is-nav-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <LibraryChromeContext.Provider value={chrome}>
      <LibrarySearchProvider>
        <div className={shellClass}>
          {navOpen ? (
            <button
              type="button"
              className="library-shell__nav-backdrop"
              aria-label="Close navigation"
              onClick={() => setNavOpen(false)}
            />
          ) : null}
          <aside id="library-sidebar" className="library-sidebar">
            <div className="library-sidebar__brand">
              <SkyjetMark className="library-shell__logo" size={32} />
              <div className="library-sidebar__brand-copy">
                <span className="library-shell__mark">{productName}</span>
                <span className="library-shell__entity">{entityName}</span>
              </div>
              <button
                type="button"
                className="library-sidebar__collapse"
                onClick={toggleCollapsed}
                aria-pressed={collapsed}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <IconCollapse />
                <span className="sr-only">{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
              </button>
              <button
                type="button"
                className="library-sidebar__close"
                onClick={() => setNavOpen(false)}
              >
                <IconClose />
                <span className="sr-only">Close navigation</span>
              </button>
            </div>

            <nav className="library-sidebar__nav" aria-label="Skyjet Library">
              <SideLink href="/library" match="exact" pathname={pathname} icon={<IconHome />}>
                Dashboard
              </SideLink>
              <SideLink
                href="/library/documents"
                match="prefix"
                pathname={pathname}
                icon={<IconFile />}
              >
                Documents
              </SideLink>
              {mayUpload ? (
                <button
                  type="button"
                  className={
                    pathname === '/library/documents/new'
                      ? 'library-sidebar__link is-current'
                      : 'library-sidebar__link'
                  }
                  onClick={() => {
                    setUploadOpen(true);
                    setNavOpen(false);
                  }}
                >
                  <span className="library-sidebar__icon">
                    <IconUpload />
                  </span>
                  <span className="library-sidebar__text">Upload</span>
                </button>
              ) : null}

              <NavGroup
                label="Browse"
                icon={<IconFolder />}
                open={browseOpen}
                onToggle={() => setBrowseOpen((value) => !value)}
                collapsed={collapsed}
              >
                {categories.map((category) => (
                  <SideLink
                    key={category.code}
                    href={`/library/documents?documentType=${category.code}`}
                    match="facet"
                    facet={category.code}
                    pathname={pathname}
                    nested
                  >
                    <span>{category.name}</span>
                    <span className="library-sidebar__count">{String(category.count)}</span>
                  </SideLink>
                ))}
              </NavGroup>

              <NavGroup
                label="Collections"
                icon={<IconStack />}
                href="/library/collections"
                open={collectionsOpen}
                onToggle={() => setCollectionsOpen((value) => !value)}
                collapsed={collapsed}
              >
                {collections.length === 0 ? (
                  <span className="library-sidebar__empty">None yet</span>
                ) : (
                  collections.map((collection) => (
                    <SideLink
                      key={collection.id}
                      href={`/library/collections/${collection.id}`}
                      match="exact"
                      pathname={pathname}
                      nested
                    >
                      <span>{collection.name}</span>
                      <span className="library-sidebar__count">{String(collection.count)}</span>
                    </SideLink>
                  ))
                )}
              </NavGroup>

              <NavGroup
                label="Settings"
                icon={<IconGear />}
                href="/library/settings"
                open={settingsOpen}
                onToggle={() => setSettingsOpen((value) => !value)}
                collapsed={collapsed}
              >
                <SideLink
                  href="/library/settings/profile"
                  match="prefix"
                  pathname={pathname}
                  nested
                  icon={<IconUser />}
                >
                  Profile
                </SideLink>
                {mayCompany ? (
                  <SideLink
                    href="/library/settings/company"
                    match="prefix"
                    pathname={pathname}
                    nested
                    icon={<IconBuilding />}
                  >
                    Organisation
                  </SideLink>
                ) : null}
                {mayUsers ? (
                  <SideLink
                    href="/library/settings/users"
                    match="prefix"
                    pathname={pathname}
                    nested
                    icon={<IconPeople />}
                  >
                    People
                  </SideLink>
                ) : null}
                {mayAccess ? (
                  <SideLink
                    href="/library/settings/access"
                    match="prefix"
                    pathname={pathname}
                    nested
                    icon={<IconShield />}
                  >
                    Access log
                  </SideLink>
                ) : null}
              </NavGroup>
            </nav>

            <div className="library-sidebar__help">
              <Link href="/library/help" className="library-sidebar__help-card">
                <span className="library-sidebar__help-icon">
                  <IconHelp />
                </span>
                <span className="library-sidebar__help-copy">
                  <strong>Need help?</strong>
                  <span>Read how Library works.</span>
                </span>
              </Link>
            </div>
          </aside>

          <header className="library-top">
            <div className="library-top__start">
              <button
                type="button"
                className="library-top__menu"
                aria-expanded={navOpen}
                aria-controls="library-sidebar"
                onClick={() => setNavOpen((value) => !value)}
              >
                <IconMenu />
                <span className="sr-only">Menu</span>
              </button>
            </div>
            <LibrarySearchTrigger />
            <div className="library-top__account">
              <ColorModeToggle />
              <WorkspaceSwitch className="button button--ghost button--small library-top__workspace" />
              <LibraryNotifications
                userId={userId}
                entityId={currentEntityId}
                initial={notifications}
              />
              <LibraryAccountMenu
                fullName={fullName}
                initials={initials}
                email={email}
                entities={entities}
                currentEntityId={currentEntityId}
                profile={profile}
              />
            </div>
          </header>

          <main className="library-shell__content">{children}</main>
        </div>
        {uploadOpen ? (
          <LibraryDialog title="Upload document" wide onClose={() => setUploadOpen(false)}>
            <LibraryUploadForm
              allowedClassifications={allowedClassifications}
              onUploaded={(documentId) => {
                setUploadOpen(false);
                router.push(`/library/documents/${documentId}`);
                router.refresh();
              }}
            />
          </LibraryDialog>
        ) : null}
      </LibrarySearchProvider>
    </LibraryChromeContext.Provider>
  );
}

function NavGroup({
  label,
  icon,
  href,
  open,
  onToggle,
  collapsed,
  children,
}: {
  label: string;
  icon: ReactNode;
  href?: string;
  open: boolean;
  onToggle: () => void;
  collapsed: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const current = href ? libraryPathIsCurrent(pathname, href, 'prefix') : false;

  return (
    <div
      className={open || collapsed ? 'library-sidebar__group is-open' : 'library-sidebar__group'}
    >
      <div className="library-sidebar__group-head">
        {href ? (
          <Link
            href={href}
            className={current ? 'library-sidebar__link is-current' : 'library-sidebar__link'}
            title={label}
          >
            <span className="library-sidebar__icon">{icon}</span>
            <span className="library-sidebar__text">{label}</span>
          </Link>
        ) : (
          <span className="library-sidebar__link library-sidebar__link--static" title={label}>
            <span className="library-sidebar__icon">{icon}</span>
            <span className="library-sidebar__text">{label}</span>
          </span>
        )}
        <button
          type="button"
          className="library-sidebar__chevron"
          aria-expanded={open}
          onClick={onToggle}
        >
          <IconChevron down={open} />
          <span className="sr-only">{open ? `Collapse ${label}` : `Expand ${label}`}</span>
        </button>
      </div>
      <div className="library-sidebar__tree">{children}</div>
    </div>
  );
}

function SideLink({
  href,
  match,
  pathname,
  facet,
  icon,
  nested = false,
  children,
}: {
  href: string;
  match: 'exact' | 'prefix' | 'facet';
  pathname: string;
  facet?: string;
  icon?: ReactNode;
  nested?: boolean;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const current =
    match === 'facet'
      ? pathname === '/library/documents' && searchParams.get('documentType') === facet
      : libraryPathIsCurrent(pathname, href, match);
  return (
    <Link
      href={href}
      className={[
        'library-sidebar__link',
        nested ? 'library-sidebar__link--nested' : '',
        current ? 'is-current' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-current={current ? 'page' : undefined}
      title={typeof children === 'string' ? children : undefined}
    >
      {icon ? <span className="library-sidebar__icon">{icon}</span> : null}
      <span className="library-sidebar__text">{children}</span>
    </Link>
  );
}
