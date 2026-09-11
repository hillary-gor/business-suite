'use client';

import { useState, type ReactNode } from 'react';
import { moveColumn, ROWS_PER_PAGE_CHOICES, type ListColumn, type ListView } from '@/lib/list-view';

export function CustomiseDrawer({
  open,
  onClose,
  title = 'Customize',
  columns,
  view,
  onChange,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  columns: readonly ListColumn[];
  view: ListView;
  onChange: (next: ListView) => void;
  children?: ReactNode;
}) {
  const [dragId, setDragId] = useState<string | null>(null);

  if (!open) return null;

  const sortable = columns.filter((column) => !column.fixed);
  const byId = new Map(columns.map((column) => [column.id, column]));

  function reorder(id: string, toIndex: number) {
    onChange({ ...view, order: moveColumn(view.order, id, toIndex) });
  }

  function toggle(id: string) {
    const hidden = view.hidden.includes(id)
      ? view.hidden.filter((entry) => entry !== id)
      : [...view.hidden, id];
    onChange({ ...view, hidden });
  }

  return (
    <>
      <button type="button" className="drawer-backdrop" aria-label="Close" onClick={onClose} />
      <aside className="drawer customise" role="dialog" aria-label={title}>
        <div className="drawer__header">
          <h2 className="drawer__title">{title}</h2>
          <button
            type="button"
            className="customise__close"
            aria-label="Close customise panel"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="drawer__body">
          <section className="customise__section">
            <h3 className="customise__heading">Sort</h3>
            <div className="customise__sort">
              <span className="customise__grip" aria-hidden="true" />
              <div className="customise__sort-fields">
                <label className="customise__field">
                  <span>Sort by</span>
                  <select
                    value={view.sortBy}
                    onChange={(event) => onChange({ ...view, sortBy: event.target.value })}
                  >
                    {sortable.map((column) => (
                      <option key={column.id} value={column.id}>
                        {column.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="customise__field">
                  <span className="sr-only">Sort direction</span>
                  <select
                    value={view.sortDir}
                    onChange={(event) =>
                      onChange({ ...view, sortDir: event.target.value === 'desc' ? 'desc' : 'asc' })
                    }
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </label>
              </div>
              <button
                type="button"
                className="customise__trash"
                aria-label="Reset sort"
                onClick={() =>
                  onChange({
                    ...view,
                    sortBy: sortable[0]?.id ?? view.sortBy,
                    sortDir: 'asc',
                  })
                }
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10 11v5M14 11v5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            <button type="button" className="customise__add-sort" disabled>
              + Add sort
            </button>
          </section>

          <section className="customise__section">
            <h3 className="customise__heading">Rows</h3>
            <label className="customise__field">
              <span>Rows per page</span>
              <select
                value={view.rowsPerPage}
                onChange={(event) => onChange({ ...view, rowsPerPage: Number(event.target.value) })}
              >
                {ROWS_PER_PAGE_CHOICES.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            </label>
            <label className="customise__field">
              <span>Row height</span>
              <select
                value={view.rowHeight}
                onChange={(event) =>
                  onChange({
                    ...view,
                    rowHeight: event.target.value === 'compact' ? 'compact' : 'comfortable',
                  })
                }
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <label className="customise__check">
              <input
                type="checkbox"
                checked={view.alternateRows}
                onChange={(event) => onChange({ ...view, alternateRows: event.target.checked })}
              />
              Alternate row color
            </label>
          </section>

          <section className="customise__section">
            <h3 className="customise__heading">Columns</h3>
            <p className="customise__hint">Drag to change the order of columns</p>
            <ul className="customise__columns">
              {view.order.map((id, index) => {
                const column = byId.get(id);
                if (!column) return null;
                return (
                  <li
                    key={id}
                    className={`customise__column${dragId === id ? ' is-dragging' : ''}`}
                    draggable
                    onDragStart={() => setDragId(id)}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragId) reorder(dragId, index);
                      setDragId(null);
                    }}
                  >
                    <button
                      type="button"
                      className="customise__grip customise__grip--button"
                      aria-label={`Move ${column.label}`}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowUp') {
                          event.preventDefault();
                          reorder(id, index - 1);
                        }
                        if (event.key === 'ArrowDown') {
                          event.preventDefault();
                          reorder(id, index + 1);
                        }
                      }}
                    />
                    <label className="customise__check">
                      <input
                        type="checkbox"
                        checked={!view.hidden.includes(id)}
                        onChange={() => toggle(id)}
                      />
                      {column.label}
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          {children ? <section className="customise__section">{children}</section> : null}
        </div>
      </aside>
    </>
  );
}
