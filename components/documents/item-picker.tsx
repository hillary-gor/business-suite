'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export type ItemPickerOption = {
  id: string;
  label: string;
  description?: string;
  partNumber?: string;
};

const RESULT_LIMIT = 50;

function searchHaystack(item: ItemPickerOption): string {
  return `${item.partNumber ?? ''} ${item.description ?? ''} ${item.label}`.toLowerCase();
}

function matchesQuery(item: ItemPickerOption, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = searchHaystack(item);
  return tokens.every((token) => hay.includes(token));
}

function optionTitle(item: ItemPickerOption): string {
  return item.partNumber || item.label;
}

function optionSubtitle(item: ItemPickerOption): string | null {
  if (item.partNumber && item.description) return item.description;
  if (item.partNumber && item.label !== item.partNumber) {
    const cut = item.label.replace(`${item.partNumber} — `, '').replace(`${item.partNumber} - `, '');
    return cut === item.label ? null : cut;
  }
  return null;
}

/**
 * Type-to-find product picker.
 *
 * A native select with 1,700 options is unusable. This keeps the catalogue in
 * memory, shows a short list on open, and filters by part number or name as
 * the user types. Only the visible slice is rendered.
 */
export function ItemPicker({
  items,
  value,
  onChange,
  allowEmpty = true,
  emptyLabel = 'Free text',
  placeholder = 'Search name or part number',
  id,
}: {
  items: ReadonlyArray<ItemPickerOption>;
  value: string;
  onChange: (id: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  placeholder?: string;
  id?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const selected = items.find((item) => item.id === value) ?? null;

  const filtered = useMemo(() => {
    const hits = query.trim() ? items.filter((item) => matchesQuery(item, query)) : items;
    return hits.slice(0, RESULT_LIMIT);
  }, [items, query]);

  const matchCount = useMemo(() => {
    if (!query.trim()) return items.length;
    return items.reduce((n, item) => n + (matchesQuery(item, query) ? 1 : 0), 0);
  }, [items, query]);

  const rows = useMemo(() => {
    const list: Array<{ id: string; title: string; subtitle: string | null }> = [];
    if (allowEmpty) list.push({ id: '', title: emptyLabel, subtitle: 'No catalogue item' });
    for (const item of filtered) {
      list.push({
        id: item.id,
        title: optionTitle(item),
        subtitle: optionSubtitle(item),
      });
    }
    return list;
  }, [allowEmpty, emptyLabel, filtered]);

  function syncRect() {
    const node = rootRef.current;
    if (!node) return;
    setRect(node.getBoundingClientRect());
  }

  useEffect(() => {
    if (!open) return;
    syncRect();
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        const panel = document.getElementById(listId);
        if (panel?.contains(event.target as Node)) return;
        close();
      }
    }
    function onScrollOrResize() {
      syncRect();
    }
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('resize', onScrollOrResize);
    document.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('resize', onScrollOrResize);
      document.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, listId]);

  function close() {
    setOpen(false);
    setQuery('');
    setActive(0);
  }

  function choose(id: string) {
    onChange(id);
    close();
    inputRef.current?.blur();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, rows.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[active];
      if (row) choose(row.id);
    }
  }

  const display = open ? query : selected?.label ?? '';
  const panelWidth = rect ? Math.max(rect.width, 340) : 340;
  const maxLeft = typeof window === 'undefined' ? 0 : window.innerWidth - panelWidth - 8;
  const left = rect ? Math.max(8, Math.min(rect.left, maxLeft)) : 0;
  const top = rect ? rect.bottom + 4 : 0;

  return (
    <div className="item-picker" ref={rootRef}>
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && rows[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={display}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          setQuery('');
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          window.setTimeout(() => close(), 120);
        }}
      />
      {open && rect && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="item-picker__panel"
              id={listId}
              role="listbox"
              style={{ top, left, width: panelWidth }}
            >
              <div className="item-picker__hint">
                {query.trim()
                  ? matchCount > RESULT_LIMIT
                    ? `Showing ${RESULT_LIMIT} of ${matchCount} matches`
                    : `${matchCount} match${matchCount === 1 ? '' : 'es'}`
                  : `Type a name or part number · ${items.length} products`}
              </div>
              {matchCount === 0 && query.trim() ? (
                <div className="item-picker__empty">No products match that search.</div>
              ) : null}
              <ul>
                {rows.map((row, index) => (
                  <li key={`${row.id || 'empty'}-${index}`} role="presentation">
                    <button
                      type="button"
                      role="option"
                      id={`${listId}-${index}`}
                      aria-selected={row.id === value}
                      className={`item-picker__option${index === active ? ' is-active' : ''}${
                        row.id === value ? ' is-selected' : ''
                      }`}
                      onMouseEnter={() => setActive(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(row.id)}
                    >
                      <span className="item-picker__title">{row.title}</span>
                      {row.subtitle ? (
                        <span className="item-picker__sub">{row.subtitle}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
