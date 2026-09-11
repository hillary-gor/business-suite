'use client';

import type { DocumentLayout, DocumentType } from '@/lib/document-layout';
import { DocumentLayoutEditor } from './layout-editor';

export function DocumentCustomizePanel({
  open,
  onClose,
  documentType,
  initial,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  documentType: DocumentType;
  initial: DocumentLayout;
  onChange: (next: DocumentLayout) => void;
}) {
  if (!open) return null;

  return (
    <>
      <button type="button" className="drawer-backdrop" aria-label="Close" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Customise document">
        <div className="drawer__header">
          <h2 className="drawer__title">Customise</h2>
          <button type="button" className="button button--ghost button--small" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="drawer__body">
          <DocumentLayoutEditor
            key={documentType}
            documentType={documentType}
            initial={initial}
            onChange={onChange}
          />
        </div>
      </aside>
    </>
  );
}
