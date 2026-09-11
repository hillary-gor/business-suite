'use client';

import { useState, useTransition } from 'react';
import type { ColumnKey, DocumentLayout, DocumentType } from '@/lib/document-layout';
import { COLUMN_KEYS, HEADER_TOGGLES, mergeLayout } from '@/lib/document-layout';
import { saveDocumentLayoutAction } from '@/server/actions/document-layout';
import { Alert, Field } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';

export function DocumentLayoutEditor({
  documentType,
  initial,
  onChange,
}: {
  documentType: DocumentType;
  initial: DocumentLayout;
  onChange?: (next: DocumentLayout) => void;
}) {
  const [layout, setLayout] = useState(mergeLayout(initial));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function patch(next: DocumentLayout) {
    setLayout(next);
    onChange?.(next);
    setSaved(false);
  }

  function toggleHeader(key: keyof DocumentLayout) {
    if (typeof layout[key] !== 'boolean') return;
    patch({ ...layout, [key]: !layout[key] });
  }

  function toggleColumn(key: ColumnKey) {
    patch({
      ...layout,
      columns: {
        ...layout.columns,
        [key]: { ...layout.columns[key], visible: !layout.columns[key].visible },
      },
    });
  }

  function labelColumn(key: ColumnKey, label: string) {
    patch({
      ...layout,
      columns: {
        ...layout.columns,
        [key]: { ...layout.columns[key], label },
      },
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveDocumentLayoutAction({
        documentType,
        settings: layout,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const merged = mergeLayout(result.data);
      patch(merged);
      setSaved(true);
    });
  }

  return (
    <div className="stack">
      {error ? <Alert title="Could not save">{error}</Alert> : null}
      {saved ? (
        <Alert tone="success" title="Saved">
          Layout preferences updated for this document type.
        </Alert>
      ) : null}

      <p className="cell-muted">
        Toggle fields on or off. Changes apply whenever this document type is created or printed.
      </p>

      <div className="stack">
        <div className="drawer__section-title">Header fields</div>
        {HEADER_TOGGLES.map((item) => (
          <label key={item.key} className="toggle-row">
            <span>{item.label}</span>
            <input
              type="checkbox"
              checked={Boolean(layout[item.key])}
              onChange={() => toggleHeader(item.key)}
            />
          </label>
        ))}
      </div>

      <div className="stack">
        <div className="drawer__section-title">Edit labels</div>
        {COLUMN_KEYS.map((key) => (
          <div key={key} className="label-edit-row">
            <label className="toggle-row">
              <span className="cell-muted">Show</span>
              <input
                type="checkbox"
                checked={layout.columns[key].visible}
                onChange={() => toggleColumn(key)}
              />
            </label>
            <Field label="Label" htmlFor={`col-${documentType}-${key}`}>
              <input
                id={`col-${documentType}-${key}`}
                value={layout.columns[key].label}
                onChange={(e) => labelColumn(key, e.target.value)}
              />
            </Field>
          </div>
        ))}
      </div>

      <div className="button-row">
        <button type="button" className="button button--primary" disabled={pending} onClick={save}>
          <BusyLabel pending={pending} idle="Save layout" tone="inverse" />
        </button>
      </div>
    </div>
  );
}
