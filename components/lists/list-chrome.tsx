'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FeedbackButton } from '@/components/feedback/feedback-host';

export function PageFeedback({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return <FeedbackButton className={className}>{children}</FeedbackButton>;
}

export function SplitMenu({
  label,
  href,
  onClick,
  items,
  primary = false,
  disabled = false,
  title,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  items: ReadonlyArray<{
    label: string;
    href?: string;
    onSelect?: () => void;
    disabled?: boolean;
    title?: string;
    shortcut?: string;
  }>;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

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

  const primaryClass = `button${primary ? ' button--primary' : ''}`;

  return (
    <div className="split-menu" ref={rootRef}>
      {onClick ? (
        <button
          type="button"
          className={primaryClass}
          onClick={onClick}
          disabled={disabled}
          title={title}
        >
          {label}
        </button>
      ) : (
        <Link className={primaryClass} href={href ?? '#'} title={title} aria-disabled={disabled}>
          {label}
        </Link>
      )}
      <button
        type="button"
        className={`button split-menu__chevron${primary ? ' button--primary' : ''}${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${label} more actions`}
        disabled={disabled}
        title={title}
        onClick={() => setOpen((value) => !value)}
      >
        ▾
      </button>
      {open ? (
        <div className="split-menu__panel" id={menuId} role="menu">
          {items.map((item) => {
            const content = (
              <>
                <span>{item.label}</span>
                {item.shortcut ? <kbd className="split-menu__shortcut">{item.shortcut}</kbd> : null}
              </>
            );
            if (item.disabled) {
              return (
                <span
                  key={item.label}
                  className="split-menu__item split-menu__item--disabled"
                  title={item.title}
                >
                  {content}
                </span>
              );
            }
            if (item.onSelect) {
              return (
                <button
                  key={item.label}
                  type="button"
                  className="split-menu__item"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onSelect?.();
                  }}
                >
                  {content}
                </button>
              );
            }
            if (!item.href) {
              return (
                <span
                  key={item.label}
                  className="split-menu__item split-menu__item--disabled"
                  title={item.title}
                >
                  {content}
                </span>
              );
            }
            return (
              <Link
                key={item.label}
                href={item.href}
                className="split-menu__item"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                {content}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** A single button that drops a menu. The split menu's quieter sibling. */
export function MenuButton({
  label,
  items,
}: {
  label: string;
  items: ReadonlyArray<{
    label: string;
    href?: string;
    onSelect?: () => void;
    disabled?: boolean;
    title?: string;
  }>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

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
    <div className="split-menu" ref={rootRef}>
      <button
        type="button"
        className={`button split-menu__solo${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="split-menu__panel" id={menuId} role="menu">
          {items.map((item) => {
            if (item.disabled) {
              return (
                <span
                  key={item.label}
                  className="split-menu__item split-menu__item--disabled"
                  title={item.title}
                >
                  {item.label}
                </span>
              );
            }
            if (item.onSelect) {
              return (
                <button
                  key={item.label}
                  type="button"
                  className="split-menu__item"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onSelect?.();
                  }}
                >
                  {item.label}
                </button>
              );
            }
            if (!item.href) {
              return (
                <span
                  key={item.label}
                  className="split-menu__item split-menu__item--disabled"
                  title={item.title}
                >
                  {item.label}
                </span>
              );
            }
            return (
              <Link
                key={item.label}
                href={item.href}
                className="split-menu__item"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function RowAction({
  label,
  href,
  items,
}: {
  label: string;
  href?: string;
  items?: ReadonlyArray<{ label: string; href: string }>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  return (
    <div className="row-action" ref={rootRef}>
      {href ? (
        <Link href={href} className="row-action__link">
          {label}
        </Link>
      ) : (
        <span className="row-action__link">{label}</span>
      )}
      {items && items.length > 0 ? (
        <>
          <button
            type="button"
            className="row-action__chevron"
            aria-label="More actions"
            onClick={() => setOpen((value) => !value)}
          >
            ▾
          </button>
          {open ? (
            <div className="row-action__panel">
              {items.map((item) =>
                item.href.startsWith('/documents/') ? (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                    {item.label}
                  </Link>
                ),
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function ListTools({
  filename,
  csv,
  children,
}: {
  filename: string;
  csv: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  function download() {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="list-tools">
      <button
        type="button"
        className="list-tools__icon"
        title="Print"
        onClick={() => window.print()}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7v-6Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button type="button" className="list-tools__icon" title="Export" onClick={download}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 4v11M8 11l4 4 4-4M5 19h14"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {children ? (
        <div className="list-tools__customise">
          <button
            type="button"
            className="list-tools__customise-btn"
            onClick={() => setOpen((value) => !value)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 7h16M4 12h16M4 17h16M8 7V4M14 12V9M11 17v-3"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
            Customise
          </button>
          {open ? <div className="list-tools__panel">{children}</div> : null}
        </div>
      ) : (
        <button type="button" className="list-tools__icon" title="Customise" aria-label="Customise">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
            <path
              d="M19.4 13.5a7.8 7.8 0 0 0 .1-1.5 7.8 7.8 0 0 0-.1-1.5l2-1.5-2-3.5-2.4 1a7.4 7.4 0 0 0-2.6-1.5L14 2h-4l-.4 2.5A7.4 7.4 0 0 0 7 6l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0-.1 1.5c0 .5 0 1 .1 1.5l-2 1.5 2 3.5 2.4-1a7.4 7.4 0 0 0 2.6 1.5L10 22h4l.4-2.5a7.4 7.4 0 0 0 2.6-1.5l2.4 1 2-3.5-2-1.5Z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

export function BoxedPager({
  label,
  page,
  lastPage,
  pathname,
  params,
}: {
  label: string;
  page: number;
  lastPage: number;
  pathname: string;
  params: Record<string, string>;
}) {
  const router = useRouter();

  function href(nextPage: number) {
    const search = new URLSearchParams(params);
    if (nextPage > 1) search.set('page', String(nextPage));
    else search.delete('page');
    const encoded = search.toString();
    return encoded ? `${pathname}?${encoded}` : pathname;
  }

  function go(nextPage: number) {
    if (!Number.isInteger(nextPage)) return;
    const bounded = Math.min(Math.max(1, nextPage), lastPage);
    router.push(href(bounded));
  }

  return (
    <div className="boxed-pager">
      <span>{label}</span>
      <Link
        href={href(page - 1)}
        className={`boxed-pager__arrow${page <= 1 ? ' is-disabled' : ''}`}
        aria-label="Previous page"
        aria-disabled={page <= 1}
        onClick={(event) => {
          if (page <= 1) event.preventDefault();
        }}
      >
        ‹
      </Link>
      <label className="boxed-pager__page">
        Page
        <input
          type="text"
          inputMode="numeric"
          defaultValue={String(page)}
          key={page}
          aria-label="Page number"
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            go(Number((event.target as HTMLInputElement).value));
          }}
          onBlur={(event) => go(Number(event.target.value))}
        />
        of {lastPage}
      </label>
      <Link
        href={href(page + 1)}
        className={`boxed-pager__arrow${page >= lastPage ? ' is-disabled' : ''}`}
        aria-label="Next page"
        aria-disabled={page >= lastPage}
        onClick={(event) => {
          if (page >= lastPage) event.preventDefault();
        }}
      >
        ›
      </Link>
    </div>
  );
}

export function ColumnToggles({
  columns,
  hidden,
  onToggle,
}: {
  columns: ReadonlyArray<{ id: string; label: string }>;
  hidden: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="column-toggles">
      {columns.map((column) => (
        <li key={column.id}>
          <label>
            <input
              type="checkbox"
              checked={!hidden.has(column.id)}
              onChange={() => onToggle(column.id)}
            />
            {column.label}
          </label>
        </li>
      ))}
    </ul>
  );
}
