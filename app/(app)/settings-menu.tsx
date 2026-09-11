'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useFeedback } from '@/components/feedback/feedback-host';
import type { CreateMenuColumn } from './create-menu';

export function SettingsMenu({
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
  const feedback = useFeedback();

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
      className={`settings-menu${variant === 'rail' ? ' settings-menu--rail' : ''}`}
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
            : `settings-menu__trigger${open ? ' is-open' : ''}`
        }
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Settings"
        title="Settings"
        onClick={() => setOpen((value) => !value)}
        onFocus={() => setOpen(true)}
      >
        {variant === 'rail' ? (
          <>
            <span className="rail__icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                  stroke="currentColor"
                  strokeWidth="1.75"
                />
                <path
                  d="M19.4 13.5a7.8 7.8 0 0 0 .1-1.5 7.8 7.8 0 0 0-.1-1.5l2-1.5-2-3.5-2.4 1a7.4 7.4 0 0 0-2.6-1.5L14 2h-4l-.4 2.5A7.4 7.4 0 0 0 7 6l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0-.1 1.5c0 .5 0 1 .1 1.5l-2 1.5 2 3.5 2.4-1a7.4 7.4 0 0 0 2.6 1.5L10 22h4l.4-2.5a7.4 7.4 0 0 0 2.6-1.5l2.4 1 2-3.5-2-1.5Z"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            Settings
          </>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
              stroke="currentColor"
              strokeWidth="1.75"
            />
            <path
              d="M19.4 13.5a7.8 7.8 0 0 0 .1-1.5 7.8 7.8 0 0 0-.1-1.5l2-1.5-2-3.5-2.4 1a7.4 7.4 0 0 0-2.6-1.5L14 2h-4l-.4 2.5A7.4 7.4 0 0 0 7 6l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0-.1 1.5c0 .5 0 1 .1 1.5l-2 1.5 2 3.5 2.4-1a7.4 7.4 0 0 0 2.6 1.5L10 22h4l.4-2.5a7.4 7.4 0 0 0 2.6-1.5l2.4 1 2-3.5-2-1.5Z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {open ? (
        <div className="settings-menu__panel" id={menuId} role="dialog" aria-label="Settings">
          <div className="settings-menu__grid">
            {columns.map((column) => (
              <div key={column.title} className="create-menu__column">
                <div className="create-menu__heading">{column.title}</div>
                <ul>
                  {column.items.map((item) => {
                    const allowed = item.permission !== false;
                    const isAction = item.action === 'feedback';
                    const disabled = item.disabled || (!item.href && !isAction) || !allowed;
                    return (
                      <li key={item.label}>
                        {disabled ? (
                          <span
                            className="create-menu__item create-menu__item--disabled"
                            title="Not yet built"
                          >
                            {item.label}
                          </span>
                        ) : isAction ? (
                          <button
                            type="button"
                            className="create-menu__item"
                            onClick={() => {
                              setOpen(false);
                              feedback.open();
                            }}
                          >
                            {item.label}
                          </button>
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
          <div className="settings-menu__footer">
            <span className="create-menu__item create-menu__item--disabled" title="Not yet built">
              Video tutorials
            </span>
            <span className="create-menu__item create-menu__item--disabled" title="Not yet built">
              Switch from Accountant view to Business view
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
