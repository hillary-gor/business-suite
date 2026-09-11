'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { searchLibraryAction } from '@/server/actions/library';
import {
  LIBRARY_DOCUMENT_TYPE_LABELS,
  type LibraryDocumentHit,
} from '@/server/modules/library/types';
import { ClassificationBadge } from '@/app/library/classification-badge';
import { IconSearch } from '@/app/library/library-icons';
import { readRecentLibraryDocuments } from '@/app/library/recent';
import type { LibrarySearchPage, LibrarySearchPerson } from '@/server/actions/library';

type LibrarySearchContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const LibrarySearchContext = createContext<LibrarySearchContextValue | null>(null);

export function useLibrarySearch() {
  const value = useContext(LibrarySearchContext);
  if (!value) throw new Error('useLibrarySearch must be used inside LibrarySearchProvider');
  return value;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function LibrarySearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const chord = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      const slash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (chord) {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (slash && !isTypingTarget(event.target)) {
        event.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const value = useMemo(() => ({ open, setOpen }), [open]);

  return (
    <LibrarySearchContext.Provider value={value}>
      {children}
      {open ? <LibrarySearchDialog onClose={() => setOpen(false)} /> : null}
    </LibrarySearchContext.Provider>
  );
}

export function LibrarySearchTrigger({ compact = false }: { compact?: boolean }) {
  const { setOpen } = useLibrarySearch();
  const [shortcut, setShortcut] = useState('Ctrl K');

  useEffect(() => {
    if (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)) {
      setShortcut('⌘K');
    }
  }, []);

  return (
    <button
      type="button"
      className={
        compact
          ? 'library-search-trigger library-search-trigger--compact'
          : 'library-search-trigger'
      }
      onClick={() => setOpen(true)}
    >
      <IconSearch />
      {compact ? (
        <span className="sr-only">Search the library</span>
      ) : (
        <>
          <span>Search the library</span>
          <kbd>{shortcut}</kbd>
        </>
      )}
    </button>
  );
}

type Row =
  | { kind: 'page'; href: string; title: string; hint: string }
  | { kind: 'document'; href: string; title: string; hint: string; hit: LibraryDocumentHit }
  | { kind: 'person'; href: string; title: string; hint: string }
  | { kind: 'recent'; href: string; title: string; hint: string };

function LibrarySearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<LibrarySearchPage[]>([]);
  const [documents, setDocuments] = useState<LibraryDocumentHit[]>([]);
  const [people, setPeople] = useState<LibrarySearchPerson[]>([]);
  const [recent] = useState(readRecentLibraryDocuments);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setPending(true);
      const result = await searchLibraryAction(query);
      if (cancelled) return;
      setPending(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setPages(result.data.pages);
      setDocuments(result.data.documents);
      setPeople(result.data.people);
      setActive(0);
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  const rows: Row[] = useMemo(() => {
    const next: Row[] = pages.map((page) => ({
      kind: 'page' as const,
      href: page.href,
      title: page.title,
      hint: page.hint,
    }));
    for (const hit of documents) {
      next.push({
        kind: 'document',
        href: `/library/documents/${hit.id}`,
        title: hit.title,
        hint: !hit.canOpen
          ? `Locked · ${LIBRARY_DOCUMENT_TYPE_LABELS[hit.documentType]} · request access`
          : hit.snippet?.replace(/<\/?b>/g, '') ||
            [LIBRARY_DOCUMENT_TYPE_LABELS[hit.documentType], hit.partNumber, hit.uploadedByName]
              .filter(Boolean)
              .join(' · '),
        hit,
      });
    }
    for (const person of people) {
      next.push({
        kind: 'person',
        href: '/library/settings/users',
        title: person.fullName,
        hint: `${person.email} · ${person.roleNames.join(', ') || 'No role'}`,
      });
    }
    if (!query.trim()) {
      for (const doc of recent) {
        if (next.some((row) => row.href === `/library/documents/${doc.id}`)) continue;
        next.push({
          kind: 'recent',
          href: `/library/documents/${doc.id}`,
          title: doc.title,
          hint: 'Recently opened in this tab',
        });
      }
    }
    return next;
  }, [pages, documents, people, query, recent]);

  const go = useCallback(
    (href: string) => {
      onClose();
      if (href === pathname) {
        router.refresh();
        return;
      }
      router.push(href);
    },
    [onClose, pathname, router],
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[active];
      if (row) go(row.href);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="library-palette-root">
      <button
        type="button"
        className="library-palette__backdrop"
        aria-label="Close search"
        onClick={onClose}
      />
      <div className="library-palette" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="sr-only">
          Search Skyjet Library
        </h2>
        <div className="library-palette__bar">
          <IconSearch />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search files, pages, people…"
            aria-autocomplete="list"
            aria-controls="library-search-results"
          />
          {pending ? <span className="cell-muted">Searching</span> : <kbd>Esc</kbd>}
        </div>
        <p className="library-palette__hint">
          type:manuals · level:confidential · tag:amm · part:737 · quoted phrases
        </p>
        {error ? <p className="library-palette__error">{error}</p> : null}
        <ul id="library-search-results" className="library-palette__list" role="listbox">
          {rows.length === 0 ? (
            <li className="library-palette__empty">
              {query.trim()
                ? 'Nothing matches. Locked files only match on the title, not the file contents.'
                : 'Type to search the catalogue, or jump to a page.'}
            </li>
          ) : (
            rows.map((row, index) => (
              <li
                key={`${row.kind}-${row.href}-${row.title}`}
                role="option"
                aria-selected={index === active}
              >
                <Link
                  href={row.href}
                  className={
                    index === active ? 'library-palette__row is-active' : 'library-palette__row'
                  }
                  onMouseEnter={() => setActive(index)}
                  onClick={(event) => {
                    event.preventDefault();
                    go(row.href);
                  }}
                >
                  <span className="library-palette__kind">
                    {row.kind === 'page'
                      ? 'Page'
                      : row.kind === 'person'
                        ? 'Person'
                        : row.kind === 'recent'
                          ? 'Recent'
                          : 'File'}
                  </span>
                  <span className="library-palette__copy">
                    <span className="library-palette__title">{row.title}</span>
                    <span className="library-palette__meta">{row.hint}</span>
                  </span>
                  {row.kind === 'document' ? (
                    <ClassificationBadge level={row.hit.classification} />
                  ) : null}
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
