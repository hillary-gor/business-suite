'use client';

import { useState } from 'react';
import type { LibraryClassification } from '@/server/modules/library/types';
import { LibraryDialog } from '@/app/library/library-dialog';

export function LibraryDownloadButton({
  documentId,
  classification,
  revisionId,
  label = 'Download',
  compact = false,
}: {
  documentId: string;
  classification: LibraryClassification;
  revisionId?: string;
  label?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const params = new URLSearchParams({ download: '1' });
  if (revisionId) params.set('revision', revisionId);
  const href = `/library/documents/${documentId}/file?${params.toString()}`;
  const className = compact ? 'button button--small' : 'button';

  if (classification !== 'restricted') {
    return (
      <a className={className} href={href}>
        {label}
      </a>
    );
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open ? (
        <LibraryDialog
          title="Download a restricted file"
          confirmLabel="Download and log"
          danger
          onConfirm={() => {
            setOpen(false);
            window.location.assign(href);
          }}
          onClose={() => setOpen(false)}
        >
          <p>
            This file is restricted. The download is written to the access log. Need-to-know still
            applies after you take a copy.
          </p>
        </LibraryDialog>
      ) : null}
    </>
  );
}
