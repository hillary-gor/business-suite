'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CompanyLogo } from '@/components/brand/company-logo';
import { CreateMenu, type CreateMenuColumn } from './create-menu';
import { CustomiseNavDialog } from './customise-nav';
import { NavLink } from './nav-link';
import { SuiteNavClose, useSuiteNav } from './suite-nav';
import {
  IconAccounting,
  IconApps,
  IconChevron,
  IconChevronLeft,
  IconChevronRight,
  IconCompliance,
  IconCustomise,
  IconCustomers,
  IconHome,
  IconInventory,
  IconPurchasing,
  IconReports,
  IconSales,
  IconTeam,
} from './nav-icons';
import {
  isNavSection,
  navItemIsCurrent,
  railFromPath,
  type AppNavGroup,
  type AppNavGroupId,
  type AppNavSection,
  type RailId,
} from './nav-model';
import { defaultNavPrefs, loadNavPrefs, saveNavPrefs, type NavPrefs } from './nav-prefs';

const GROUP_ICONS: Record<AppNavGroupId, ReactNode> = {
  customers: <IconCustomers />,
  sales: <IconSales />,
  purchasing: <IconPurchasing />,
  inventory: <IconInventory />,
  accounting: <IconAccounting />,
  team: <IconTeam />,
  reports: <IconReports />,
  compliance: <IconCompliance />,
};

const PANE_TITLES: Record<RailId, string> = {
  home: 'All apps',
  apps: 'All apps',
  reports: 'Reports & Analytics',
  customers: 'Customer Hub',
  sales: 'Sales',
  purchasing: 'Expenses & Bills',
  inventory: 'Inventory',
  accounting: 'Accounting',
  team: 'Team',
  compliance: 'Compliance',
};

export function AppSidebar({
  entityName,
  logoSrc,
  groups,
  createColumns,
}: {
  entityName: string;
  logoSrc?: string | null;
  groups: readonly AppNavGroup[];
  createColumns: readonly CreateMenuColumn[];
}) {
  const { open: navOpen } = useSuiteNav();
  const pathname = usePathname();
  const suggested = railFromPath(pathname, groups);
  const [override, setOverride] = useState<RailId | null>(null);
  const [prefs, setPrefs] = useState<NavPrefs>(defaultNavPrefs);
  const [customiseOpen, setCustomiseOpen] = useState(false);

  useEffect(() => {
    setPrefs(loadNavPrefs());
  }, []);

  useEffect(() => {
    setOverride(null);
  }, [pathname]);

  const rail = override ?? suggested;
  const available = new Set(groups.map((group) => group.id));
  const pinned = prefs.pinned
    .map((id) => groups.find((group) => group.id === id))
    .filter((group): group is AppNavGroup => Boolean(group));
  const visibleGroups =
    rail === 'apps'
      ? groups
      : groups.filter((group) => group.id === rail && group.items.length > 0);
  const paneEligible = visibleGroups.length > 0;
  const paneOpen = paneEligible && !prefs.paneHidden;

  useEffect(() => {
    if (navOpen && rail === 'home') {
      setOverride('apps');
    }
  }, [navOpen, rail]);

  useEffect(() => {
    const shell = document.querySelector('.shell');
    if (!shell) return;
    shell.classList.toggle('is-pane-open', paneOpen);
    shell.classList.toggle('rail-labels-off', !prefs.labels);
    return () => {
      shell.classList.remove('is-pane-open', 'rail-labels-off');
    };
  }, [paneOpen, prefs.labels]);

  function selectRail(next: RailId) {
    setOverride(next);
    if (next !== 'home') {
      updatePrefs({ ...prefs, paneHidden: false });
    }
  }

  function updatePrefs(next: NavPrefs) {
    setPrefs(next);
    saveNavPrefs(next);
  }

  return (
    <div className="shell__navframe" id="app-nav">
      <nav className={`rail${prefs.labels ? '' : ' rail--compact'}`} aria-label="Primary">
        <Link
          href="/business-suite"
          className="rail__logo"
          title={entityName}
          onClick={() => selectRail('home')}
        >
          <CompanyLogo src={logoSrc} alt={entityName} className="rail__logo-img" />
        </Link>

        <div className="rail__stack">
          <CreateMenu columns={createColumns} variant="rail" />

          <Link
            href="/business-suite"
            className="rail__item"
            aria-current={rail === 'home' ? 'page' : undefined}
            onClick={() => selectRail('home')}
          >
            <span className="rail__icon">
              <IconHome />
            </span>
            {prefs.labels ? 'Home' : null}
          </Link>

          <button
            type="button"
            className="rail__item"
            aria-pressed={rail === 'apps'}
            onClick={() => selectRail('apps')}
          >
            <span className="rail__icon">
              <IconApps />
            </span>
            {prefs.labels ? 'Apps' : null}
          </button>
        </div>

        {pinned.length > 0 ? (
          <div className="rail__pinned">
            {prefs.labels ? <div className="rail__pinned-label">Pinned</div> : null}
            {pinned.map((group) => (
              <button
                key={group.id}
                type="button"
                className="rail__item"
                aria-pressed={rail === group.id}
                title={group.label}
                onClick={() => selectRail(group.id)}
              >
                <span className="rail__icon">{GROUP_ICONS[group.id]}</span>
                {prefs.labels ? group.label : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="rail__pinned" />
        )}

        <div className="rail__end">
          {paneEligible && !paneOpen ? (
            <button
              type="button"
              className="rail__item"
              title="Show menus"
              onClick={() => updatePrefs({ ...prefs, paneHidden: false })}
            >
              <span className="rail__icon">
                <IconChevronRight />
              </span>
              {prefs.labels ? 'Menus' : null}
            </button>
          ) : null}
          <button
            type="button"
            className="rail__item"
            aria-haspopup="dialog"
            aria-expanded={customiseOpen}
            aria-label="Customise navigation"
            title="Customise"
            onClick={() => setCustomiseOpen(true)}
          >
            <span className="rail__icon">
              <IconCustomise />
            </span>
            {prefs.labels ? 'Customise' : null}
          </button>
          <SuiteNavClose showLabel={prefs.labels} />
        </div>
      </nav>

      {paneOpen ? (
        <aside className="nav-pane" aria-label={PANE_TITLES[rail] ?? 'Apps'}>
          <div className="nav-pane__toolbar">
            <div className="nav-pane__heading">{PANE_TITLES[rail] ?? 'All apps'}</div>
            <button
              type="button"
              className="nav-pane__collapse"
              title="Hide menus"
              aria-label="Hide menus"
              onClick={() => updatePrefs({ ...prefs, paneHidden: true })}
            >
              <IconChevronLeft />
            </button>
          </div>

          <div className="nav-pane__body">
            {visibleGroups.map((group) => {
              const childActive = group.items.some((item) => navItemIsCurrent(pathname, item));
              const solo = visibleGroups.length === 1;
              return (
                <NavPaneGroup
                  key={group.id}
                  group={group}
                  defaultOpen={solo || childActive}
                  solo={solo}
                />
              );
            })}
          </div>
        </aside>
      ) : null}

      {customiseOpen ? (
        <CustomiseNavDialog
          groups={groups}
          icons={GROUP_ICONS}
          initial={{
            ...prefs,
            pinned: prefs.pinned.filter((id) => available.has(id)),
          }}
          onSave={updatePrefs}
          onClose={() => setCustomiseOpen(false)}
        />
      ) : null}
    </div>
  );
}

function NavPaneGroup({
  group,
  defaultOpen,
  solo,
}: {
  group: AppNavGroup;
  defaultOpen: boolean;
  solo: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  const links = group.items.map((item) =>
    isNavSection(item) ? (
      <NavPaneNested key={item.label} section={item} />
    ) : (
      <NavLink key={item.href} href={item.href} disabled={item.disabled}>
        {item.label}
      </NavLink>
    ),
  );

  if (solo) {
    return <div className="nav-pane__links">{links}</div>;
  }

  return (
    <div className={`nav-pane__group${open ? ' is-open' : ''}${defaultOpen ? ' is-current' : ''}`}>
      <button
        type="button"
        className="nav-pane__group-btn"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`nav-pane__glyph nav-pane__glyph--${group.id}`}>
          {GROUP_ICONS[group.id]}
        </span>
        <span className="nav-pane__group-label">{group.label}</span>
        <span className="nav-pane__chevron">
          <IconChevron />
        </span>
      </button>
      {open ? <div className="nav-pane__links">{links}</div> : null}
    </div>
  );
}

function NavPaneNested({ section }: { section: AppNavSection }) {
  const pathname = usePathname();
  const childActive = section.children.some((child) => navItemIsCurrent(pathname, child));
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  return (
    <div className={`nav-pane__nested${open ? ' is-open' : ''}${childActive ? ' is-current' : ''}`}>
      <button
        type="button"
        className="nav-pane__nested-btn"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{section.label}</span>
        <span className="nav-pane__chevron">
          <IconChevron />
        </span>
      </button>
      {open
        ? section.children.map((child) => (
            <NavLink key={child.href} href={child.href} disabled={child.disabled}>
              {child.label}
            </NavLink>
          ))
        : null}
    </div>
  );
}
