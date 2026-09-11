'use client';

import { useState } from 'react';
import type { LibraryClassification, LibraryDocument } from '@/server/modules/library/types';
import { LibraryDialog } from '@/app/library/library-dialog';
import { LibraryEditForm } from '@/app/library/documents/[id]/edit/edit-form';

export function LibraryEditMetadataButton({
  document,
  allowedClassifications,
}: {
  document: LibraryDocument;
  allowedClassifications: readonly LibraryClassification[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="button" onClick={() => setOpen(true)}>
        Edit metadata
      </button>
      {open ? (
        <LibraryDialog title="Edit metadata" wide onClose={() => setOpen(false)}>
          <p className="cell-muted" style={{ marginTop: 0 }}>
            Metadata only. Replace the file from the document page.
          </p>
          <LibraryEditForm
            document={document}
            allowedClassifications={allowedClassifications}
            onSaved={() => setOpen(false)}
          />
        </LibraryDialog>
      ) : null}
    </>
  );
}
