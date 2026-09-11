'use client';

import { useState } from 'react';
import type { DocumentLayout, DocumentType } from '@/lib/document-layout';
import { DOCUMENT_TYPES } from '@/lib/document-layout';
import { DocumentLayoutEditor } from '@/components/documents/layout-editor';

export function FormStylesEditor({
  layouts,
}: {
  layouts: Record<DocumentType, DocumentLayout>;
}) {
  const [active, setActive] = useState<DocumentType>('INVOICE');

  return (
    <div className="stack">
      <div className="doc-toolbar__modes" role="tablist" aria-label="Document type">
        {DOCUMENT_TYPES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active === item.id}
            className={`doc-toolbar__tab${active === item.id ? ' is-active' : ''}`}
            onClick={() => setActive(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <DocumentLayoutEditor
        key={active}
        documentType={active}
        initial={layouts[active]}
      />
    </div>
  );
}
