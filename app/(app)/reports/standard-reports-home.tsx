'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  REPORT_FAVOURITES_KEY,
  STANDARD_REPORT_SECTIONS,
  defaultFavouriteIds,
  type StandardReport,
  type StandardReportSection,
} from '@/lib/standard-reports';

const STUB = 'Not in this version';

function loadFavourites(): string[] {
  if (typeof window === 'undefined') return defaultFavouriteIds();
  try {
    const stored = window.localStorage.getItem(REPORT_FAVOURITES_KEY);
    if (!stored) return defaultFavouriteIds();
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== 'string')) {
      return defaultFavouriteIds();
    }
    return parsed;
  } catch {
    return defaultFavouriteIds();
  }
}

function matchesQuery(report: StandardReport, needle: string): boolean {
  if (!needle) return true;
  return report.title.toLowerCase().includes(needle) || report.help.toLowerCase().includes(needle);
}

export function StandardReportsHome({ byId }: { byId: Record<string, StandardReport> }) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [favourites, setFavourites] = useState<string[]>(defaultFavouriteIds);
  const [hoverHelp, setHoverHelp] = useState<string | null>(null);
  const [pinnedHelp, setPinnedHelp] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const helpAnchors = useRef(new Map<string, HTMLElement>());
  const menuAnchors = useRef(new Map<string, HTMLElement>());
  const hideHelpTimer = useRef<number | null>(null);

  useEffect(() => {
    setFavourites(loadFavourites());
  }, []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('.std-reports__more') && !target.closest('.std-reports__menu')) {
        setMenuId(null);
      }
      if (!target.closest('.std-reports__help-wrap') && !target.closest('.std-reports__tip')) {
        setPinnedHelp(null);
        setHoverHelp(null);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setMenuId(null);
      setPinnedHelp(null);
      setHoverHelp(null);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  function clearHideHelp() {
    if (hideHelpTimer.current != null) {
      window.clearTimeout(hideHelpTimer.current);
      hideHelpTimer.current = null;
    }
  }

  function showHelp(key: string) {
    clearHideHelp();
    setHoverHelp(key);
  }

  function hideHelpSoon() {
    clearHideHelp();
    hideHelpTimer.current = window.setTimeout(() => {
      setHoverHelp(null);
      hideHelpTimer.current = null;
    }, 160);
  }

  function toggleFavourite(id: string) {
    setFavourites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      window.localStorage.setItem(REPORT_FAVOURITES_KEY, JSON.stringify(next));
      return next;
    });
  }

  const needle = query.trim().toLowerCase();
  const favouriteReports = favourites
    .map((id) => byId[id])
    .filter((row): row is StandardReport => Boolean(row));

  const sections = STANDARD_REPORT_SECTIONS.map((section) => ({
    ...section,
    reports: section.reports.filter(
      (report, index, list) =>
        list.findIndex((item) => item.id === report.id) === index && matchesQuery(report, needle),
    ),
  })).filter((section) => section.reports.length > 0);

  const favouriteMatches = favouriteReports.filter((report) => matchesQuery(report, needle));
  const favouriteSection: StandardReportSection | null =
    favouriteMatches.length === 0
      ? null
      : { id: 'favourites', title: 'Favourites', reports: favouriteMatches };

  const visible: StandardReportSection[] = [
    ...(favouriteSection ? [favouriteSection] : []),
    ...sections,
  ];

  const openHelpKey = pinnedHelp ?? hoverHelp;
  const catalogRows = visible.flatMap((section) =>
    section.reports.map((report) => ({ key: `${section.id}-${report.id}`, report })),
  );
  const openHelp = openHelpKey ? catalogRows.find((row) => row.key === openHelpKey) : undefined;
  const openMenu = menuId ? catalogRows.find((row) => row.key === menuId) : undefined;

  return (
    <div className="std-reports">
      <h1 className="sr-only">Standard reports</h1>
      <div className="std-reports__toolbar">
        <label className="std-reports__search">
          <span className="sr-only">Search reports</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type report name here"
          />
        </label>
        <div className="std-reports__actions">
          <button type="button" className="button" disabled title={STUB}>
            Ask a question <span className="std-reports__beta">BETA</span>
          </button>
          <Link href="/reports/custom" className="button button--primary std-reports__create">
            Create new report
            <Chevron open />
          </Link>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="std-reports__empty">No reports match that name.</p>
      ) : (
        visible.map((section) => {
          const open = !collapsed.has(section.id);
          return (
            <section key={section.id} className="std-reports__section">
              <button
                type="button"
                className="std-reports__heading"
                aria-expanded={open}
                onClick={() => {
                  const next = new Set(collapsed);
                  if (next.has(section.id)) next.delete(section.id);
                  else next.add(section.id);
                  setCollapsed(next);
                }}
              >
                <Chevron open={open} />
                {section.title}
                {section.badge ? <span className="std-reports__badge">{section.badge}</span> : null}
              </button>
              {open ? (
                <div className="std-reports__body">
                  {section.intro ? <p className="std-reports__intro">{section.intro}</p> : null}
                  <ul className="std-reports__grid">
                    {section.reports.map((report) => {
                      const rowKey = `${section.id}-${report.id}`;
                      const helpOpen = openHelpKey === rowKey;
                      const starred = favourites.includes(report.id);
                      return (
                        <li key={rowKey} className="std-reports__item">
                          <div className="std-reports__lead">
                            <Link href={report.href} className="std-reports__name">
                              {report.title}
                            </Link>
                            <div
                              className="std-reports__help-wrap"
                              onMouseEnter={() => showHelp(rowKey)}
                              onMouseLeave={() => {
                                if (pinnedHelp !== rowKey) hideHelpSoon();
                              }}
                            >
                              <button
                                type="button"
                                className="std-reports__help"
                                ref={(node) => {
                                  if (node) helpAnchors.current.set(rowKey, node);
                                  else helpAnchors.current.delete(rowKey);
                                }}
                                aria-label={`About ${report.title}`}
                                aria-expanded={helpOpen}
                                onClick={() =>
                                  setPinnedHelp((current) => (current === rowKey ? null : rowKey))
                                }
                              >
                                <span>?</span>
                              </button>
                            </div>
                          </div>
                          <div className="std-reports__icons">
                            <button
                              type="button"
                              className={`std-reports__star${starred ? ' is-on' : ''}`}
                              aria-pressed={starred}
                              aria-label={
                                starred
                                  ? `Remove ${report.title} from favourites`
                                  : `Add ${report.title} to favourites`
                              }
                              onClick={() => toggleFavourite(report.id)}
                            >
                              <Star on={starred} />
                            </button>
                            <div className="std-reports__more">
                              <button
                                type="button"
                                className="std-reports__kebab"
                                ref={(node) => {
                                  if (node) menuAnchors.current.set(rowKey, node);
                                  else menuAnchors.current.delete(rowKey);
                                }}
                                aria-label={`More actions for ${report.title}`}
                                aria-expanded={menuId === rowKey}
                                onClick={() =>
                                  setMenuId((current) => (current === rowKey ? null : rowKey))
                                }
                              >
                                <Kebab />
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </section>
          );
        })
      )}

      {openHelp ? (
        <FloatingPanel
          className="std-reports__tip"
          role="tooltip"
          anchor={helpAnchors.current.get(openHelp.key) ?? null}
          align="left"
          width={300}
          onMouseEnter={clearHideHelp}
          onMouseLeave={() => {
            if (pinnedHelp !== openHelp.key) hideHelpSoon();
          }}
        >
          {openHelp.report.help}
        </FloatingPanel>
      ) : null}

      {openMenu ? (
        <FloatingPanel
          className="std-reports__menu"
          role="menu"
          anchor={menuAnchors.current.get(openMenu.key) ?? null}
          align="right"
          width={168}
        >
          <Link href={openMenu.report.href} role="menuitem" onClick={() => setMenuId(null)}>
            Open
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              toggleFavourite(openMenu.report.id);
              setMenuId(null);
            }}
          >
            {favourites.includes(openMenu.report.id) ? 'Remove favourite' : 'Favourite'}
          </button>
        </FloatingPanel>
      ) : null}
    </div>
  );
}

function FloatingPanel({
  anchor,
  className,
  role,
  align,
  width,
  children,
  onMouseEnter,
  onMouseLeave,
}: {
  anchor: HTMLElement | null;
  className: string;
  role: string;
  align: 'left' | 'right';
  width: number;
  children: ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ top: 0, left: 0, width });

  useLayoutEffect(() => {
    function place() {
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const panel = panelRef.current;
      const panelWidth = Math.min(width, window.innerWidth - 16);
      const panelHeight = panel?.offsetHeight ?? 0;
      let left = align === 'right' ? rect.right - panelWidth : rect.left;
      if (left + panelWidth > window.innerWidth - 8) left = window.innerWidth - panelWidth - 8;
      if (left < 8) left = 8;
      let top = rect.bottom + 6;
      if (top + panelHeight > window.innerHeight - 8 && rect.top - panelHeight - 6 > 8) {
        top = rect.top - panelHeight - 6;
      }
      setBox({ top, left, width: panelWidth });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, align, width, children]);

  if (typeof document === 'undefined' || !anchor) return null;

  return createPortal(
    <div
      ref={panelRef}
      className={className}
      role={role}
      style={{ top: box.top, left: box.left, width: box.width }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>,
    document.body,
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d={open ? 'M2 4.5 6 8.5 10 4.5' : 'M4.5 2 8.5 6 4.5 10'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Star({ on }: { on: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.6 14.6 9l6 .9-4.3 4.2 1 6L12 17.3 6.7 20.1l1-6L3.4 9.9l6-.9L12 3.6Z"
        fill={on ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Kebab() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="3.5" r="1.25" fill="currentColor" />
      <circle cx="8" cy="8" r="1.25" fill="currentColor" />
      <circle cx="8" cy="12.5" r="1.25" fill="currentColor" />
    </svg>
  );
}
