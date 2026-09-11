'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';

export interface CreateMenuItem {
  label: string;
  href?: string;
  disabled?: boolean;
  permission?: boolean;
  action?: 'feedback';
}

export interface CreateMenuColumn {
  title: string;
  items: readonly CreateMenuItem[];
}

/**
 * QuickBooks-style Create menu.
 *
 * Opens on hover (with a short grace period so the pointer can reach the
 * panel) and also on click for keyboard and touch.
 */
export function CreateMenu({
  columns,
  variant = 'toolbar',
}: {
  columns: readonly CreateMenuColumn[];
  variant?: 'toolbar' | 'rail';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const menuId = useId();

  function cancelClose() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  }

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

  useEffect(() => () => cancelClose(), []);

  return (
    <div
      className={`create-menu${variant === 'rail' ? ' create-menu--rail' : ''}`}
      ref={rootRef}
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className={
          variant === 'rail'
            ? `rail__item${open ? ' is-open' : ''}`
            : 'button button--primary create-menu__trigger'
        }
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        onFocus={() => setOpen(true)}
      >
        {variant === 'rail' ? (
          <>
            <span className="rail__icon rail__icon--create">+</span>
            Create
          </>
        ) : (
          <>
            <span aria-hidden="true">+</span>
            Create
          </>
        )}
      </button>

      {open ? (
        <div className="create-menu__panel" id={menuId} role="dialog" aria-label="Create">
          {columns.map((column) => (
            <div key={column.title} className="create-menu__column">
              <div className="create-menu__heading">{column.title}</div>
              <ul>
                {column.items.map((item) => {
                  const allowed = item.permission !== false;
                  const disabled = item.disabled || !item.href || !allowed;
                  return (
                    <li key={item.label}>
                      {disabled ? (
                        <span
                          className="create-menu__item create-menu__item--disabled"
                          title="Not yet built"
                        >
                          {item.label}
                        </span>
                      ) : (
                        <Link
                          href={item.href!}
                          className="create-menu__item"
                          onClick={() => setOpen(false)}
                        >
                          {item.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
