'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { matchesCustomerQuery } from '@/lib/customer-search';

export type CustomerPickerOption = {
  id: string;
  label: string;
  code?: string;
  email?: string | null;
  phone?: string | null;
};

const RESULT_LIMIT = 50;
const ADD_ID = '__add_new__';

export function CustomerPicker({
  customers,
  value,
  onChange,
  onAddNew,
  mayAdd = false,
  id,
  placeholder = 'Search customer name or code',
}: {
  customers: ReadonlyArray<CustomerPickerOption>;
  value: string;
  onChange: (id: string) => void;
  onAddNew: (typedName: string) => void;
  mayAdd?: boolean;
  id?: string;
  placeholder?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const selected = customers.find((customer) => customer.id === value) ?? null;

  const filtered = useMemo(() => {
    const hits = query.trim()
      ? customers.filter((customer) => matchesCustomerQuery(customer, query))
      : customers;
    return hits.slice(0, RESULT_LIMIT);
  }, [customers, query]);

  const matchCount = useMemo(() => {
    if (!query.trim()) return customers.length;
    return customers.reduce(
      (count, customer) => count + (matchesCustomerQuery(customer, query) ? 1 : 0),
      0,
    );
  }, [customers, query]);

  const rows = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      subtitle: string | null;
      add?: boolean;
      disabled?: boolean;
    }> = [
      {
        id: ADD_ID,
        title: 'Add new',
        subtitle: mayAdd
          ? 'Create a customer without leaving this invoice'
          : 'You do not have permission',
        add: true,
        disabled: !mayAdd,
      },
    ];
    for (const customer of filtered) {
      list.push({
        id: customer.id,
        title: customer.label,
        subtitle: customer.email || customer.phone || null,
      });
    }
    return list;
  }, [filtered, mayAdd]);

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

  function choose(id: string, disabled?: boolean) {
    if (id === ADD_ID) {
      if (disabled) return;
      const typed = query.trim();
      close();
      onAddNew(typed);
      return;
    }
    onChange(id);
    close();
    inputRef.current?.blur();
  }

  function defaultActive(nextQuery: string) {
    if (!mayAdd) return 0;
    const hits = nextQuery.trim()
      ? customers.filter((customer) => matchesCustomerQuery(customer, nextQuery)).length
      : customers.length;
    return hits === 0 ? 0 : 1;
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
      if (row) choose(row.id, row.disabled);
    }
  }

  const display = open ? query : (selected?.label ?? '');
  const panelWidth = rect ? Math.max(rect.width, 360) : 360;
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
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          setActive(defaultActive(next));
        }}
        onFocus={() => {
          setQuery('');
          setOpen(true);
          setActive(defaultActive(''));
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
              aria-label="Customers"
              style={{ top, left, width: panelWidth }}
            >
              <div className="item-picker__hint">
                {query.trim()
                  ? matchCount > RESULT_LIMIT
                    ? `Showing ${RESULT_LIMIT} of ${matchCount} matches`
                    : `${matchCount} match${matchCount === 1 ? '' : 'es'}`
                  : `Type a name or code · ${customers.length} customers`}
              </div>
              {matchCount === 0 && query.trim() ? (
                <div className="item-picker__empty">No customers match that search.</div>
              ) : null}
              <ul>
                {rows.map((row, index) => (
                  <li key={`${row.id}-${index}`} role="presentation">
                    <button
                      type="button"
                      role="option"
                      id={`${listId}-${index}`}
                      aria-selected={row.id === value}
                      aria-disabled={row.disabled || undefined}
                      disabled={row.disabled}
                      title={row.disabled ? (row.subtitle ?? undefined) : undefined}
                      className={`item-picker__option${row.add ? ' is-add' : ''}${
                        index === active ? ' is-active' : ''
                      }${row.id === value ? ' is-selected' : ''}`}
                      onMouseEnter={() => setActive(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(row.id, row.disabled)}
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
