'use client';

import { useEffect, useState } from 'react';
import { isPreviewable } from '@/server/modules/library/types';

export function LibraryFilePreview({
  documentId,
  mimeType,
  title,
}: {
  documentId: string;
  mimeType: string;
  title: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isPreviewable(mimeType)) return;
    const href = `/library/documents/${documentId}/file`;
    let cancelled = false;
    let created: string | null = null;
    fetch(href)
      .then((response) => {
        if (!response.ok) throw new Error('preview failed');
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [documentId, mimeType]);

  if (!isPreviewable(mimeType)) {
    return (
      <p className="cell-muted">
        Preview is available for PDFs and images. Use download for this file type.
      </p>
    );
  }

  if (failed) {
    return <p className="cell-muted">The file could not be previewed. Try downloading it.</p>;
  }

  if (!objectUrl) {
    return <p className="cell-muted">Loading preview…</p>;
  }

  if (mimeType.startsWith('image/')) {
    return (
      // Blob preview URLs are session-scoped and not in the image optimiser.
      // eslint-disable-next-line @next/next/no-img-element
      <img className="library-preview__image" src={objectUrl} alt={title} />
    );
  }

  return (
    <object className="library-preview__frame" data={objectUrl} type={mimeType} aria-label={title}>
      <a href={`/library/documents/${documentId}/file?download=1`}>Download {title}</a>
    </object>
  );
}
