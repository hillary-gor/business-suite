'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconGrip } from './nav-icons';
import type { AppNavGroup, AppNavGroupId } from './nav-model';
import type { NavPrefs } from './nav-prefs';

export function CustomiseNavDialog({
  groups,
  icons,
  initial,
  onSave,
  onClose,
}: {
  groups: readonly AppNavGroup[];
  icons: Record<AppNavGroupId, ReactNode>;
  initial: NavPrefs;
  onSave: (prefs: NavPrefs) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [labels, setLabels] = useState(initial.labels);
  const [order, setOrder] = useState<AppNavGroupId[]>(() => orderedIds(groups, initial.pinned));
  const [pinned, setPinned] = useState<AppNavGroupId[]>(() =>
    orderPinned(groups, initial.pinned),
  );
  const [dragging, setDragging] = useState<AppNavGroupId | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  function toggle(id: AppNavGroupId) {
    setPinned((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function moveBefore(source: AppNavGroupId, target: AppNavGroupId) {
    if (source === target) return;
    setOrder((current) => {
      const next = current.filter((id) => id !== source);
      const index = next.indexOf(target);
      next.splice(index, 0, source);
      return next;
    });
  }

  function save() {
    const selected = new Set(pinned);
    onSave({ ...initial, labels, pinned: order.filter((id) => selected.has(id)) });
    onClose();
  }

  const byId = new Map(groups.map((group) => [group.id, group]));

  return createPortal(
    <div className="prefs-dialog-root">
      <button type="button" className="prefs-dialog__backdrop" aria-label="Close" onClick={onClose} />
      <div className="prefs-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="prefs-dialog__title">
          Customise preferences
        </h2>
        <div className="prefs-dialog__body">
          <aside className="prefs-dialog__tabs">
            <span className="prefs-dialog__tab is-active">Navigation</span>
            <span className="prefs-dialog__tab" title="Not yet available">
              Bookmarks
            </span>
          </aside>
          <div className="prefs-dialog__main">
            <section className="prefs-dialog__section">
              <div className="prefs-dialog__row">
                <div>
                  <h3>Left navigation labels</h3>
                  <p>Turning off labels in the left rail makes room to see more of your apps.</p>
                </div>
                <button
                  type="button"
                  className={`prefs-switch${labels ? ' is-on' : ''}`}
                  role="switch"
                  aria-checked={labels}
                  onClick={() => setLabels((value) => !value)}
                >
                  <span className="prefs-switch__thumb" />
                  <span className="sr-only">{labels ? 'On' : 'Off'}</span>
                </button>
              </div>
            </section>

            <section className="prefs-dialog__section">
              <h3>Left navigation apps</h3>
              <p>
                Choose which apps to pin in the left rail. Hidden apps stay available under Apps.
              </p>
              <ul className="prefs-dialog__apps">
                {order.map((id) => {
                  const group = byId.get(id);
                  if (!group) return null;
                  const checked = pinned.includes(group.id);
                  return (
                    <li
                      key={group.id}
                      className={`prefs-dialog__app-row${dragging === group.id ? ' is-dragging' : ''}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (dragging) moveBefore(dragging, group.id);
                      }}
                    >
                      <span
                        className="prefs-dialog__grip"
                        title="Drag to reorder"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', group.id);
                          setDragging(group.id);
                        }}
                        onDragEnd={() => setDragging(null)}
                      >
                        <IconGrip />
                      </span>
                      <label className="prefs-dialog__app">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(group.id)}
                        />
                        <span className={`nav-pane__glyph nav-pane__glyph--${group.id}`}>
                          {icons[group.id]}
                        </span>
                        {group.label}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </div>
        <div className="prefs-dialog__footer">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button button--primary" onClick={save}>
            Save and close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function orderPinned(groups: readonly AppNavGroup[], pinned: readonly AppNavGroupId[]): AppNavGroupId[] {
  const allowed = new Set(groups.map((group) => group.id));
  return pinned.filter((id) => allowed.has(id));
}

function orderedIds(
  groups: readonly AppNavGroup[],
  pinned: readonly AppNavGroupId[],
): AppNavGroupId[] {
  const allowed = groups.map((group) => group.id);
  const selected = pinned.filter((id) => allowed.includes(id));
  const rest = allowed.filter((id) => !selected.includes(id));
  return [...selected, ...rest];
}
