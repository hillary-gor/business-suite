'use client';

import { useCallback, useEffect, useState } from 'react';
import { documentPdfPath } from '@/lib/documents/href';
import type { DocumentKind } from '@/lib/documents/kinds';
import type { DocumentDraft } from '@/lib/documents/model';

async function pdfBlob(input: {
  kind: DocumentKind;
  savedId?: string | null;
  draft?: DocumentDraft | null;
  query?: Record<string, string | undefined>;
}): Promise<Blob> {
  if (input.draft) {
    const response = await fetch('/documents/preview/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.draft),
    });
    if (!response.ok) throw new Error('The PDF could not be generated.');
    return response.blob();
  }
  if (!input.savedId) throw new Error('Save the document before printing.');
  const response = await fetch(documentPdfPath(input.kind, input.savedId, input.query));
  if (!response.ok) throw new Error('The PDF could not be generated.');
  return response.blob();
}

export async function openDocumentPdf(input: {
  kind: DocumentKind;
  savedId?: string | null;
  draft?: DocumentDraft | null;
  query?: Record<string, string | undefined>;
}): Promise<void> {
  if (input.savedId && !input.draft) {
    window.open(
      documentPdfPath(input.kind, input.savedId, input.query),
      '_blank',
      'noopener,noreferrer',
    );
    return;
  }
  const blob = await pdfBlob(input);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function PrintDocumentButton({
  kind,
  savedId,
  draft,
  query,
  children = 'Print',
  className = 'button button--ghost',
}: {
  kind: DocumentKind;
  savedId?: string | null;
  draft?: DocumentDraft | null;
  query?: Record<string, string | undefined>;
  children?: string;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onClick() {
    setError(null);
    setPending(true);
    try {
      await openDocumentPdf({ kind, savedId, draft, query });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The PDF could not be generated.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={pending} onClick={onClick}>
        {pending ? 'Preparing' : children}
      </button>
      {error ? <span className="cell-muted">{error}</span> : null}
    </>
  );
}

export function DocumentPdfPreview({
  kind,
  savedId,
  draft,
  query,
}: {
  kind: DocumentKind;
  savedId?: string | null;
  draft?: DocumentDraft | null;
  query?: Record<string, string | undefined>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);

  const serialized = JSON.stringify({
    kind,
    savedId: savedId ?? null,
    draft: draft ?? null,
    query: query ?? null,
  });

  const load = useCallback(async () => {
    const payload = JSON.parse(serialized) as {
      kind: DocumentKind;
      savedId: string | null;
      draft: DocumentDraft | null;
      query: Record<string, string | undefined> | null;
    };
    setPending(true);
    setError(null);
    try {
      const blob = await pdfBlob({
        kind: payload.kind,
        savedId: payload.savedId,
        draft: payload.draft,
        query: payload.query ?? undefined,
      });
      const next = URL.createObjectURL(blob);
      setUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The PDF could not be generated.');
    } finally {
      setPending(false);
    }
  }, [serialized]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void load();
    }, 400);
    return () => window.clearTimeout(handle);
  }, [load]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  return (
    <div className="doc-pdf">
      <div className="button-row doc-pdf__actions">
        <PrintDocumentButton kind={kind} savedId={savedId} draft={draft} query={query}>
          Print / download PDF
        </PrintDocumentButton>
      </div>
      {pending ? <p className="cell-muted">Preparing PDF…</p> : null}
      {error ? <p className="cell-muted">{error}</p> : null}
      {url ? <iframe className="doc-pdf__frame" title="Document PDF" src={url} /> : null}
    </div>
  );
}

export function DocumentPdfLink({
  kind,
  id,
  query,
  children = 'Print',
  className,
}: {
  kind: DocumentKind;
  id: string;
  query?: Record<string, string | undefined>;
  children?: string;
  className?: string;
}) {
  return (
    <a
      href={documentPdfPath(kind, id, query)}
      target="_blank"
      rel="noreferrer"
      className={className ?? 'row-action__link'}
    >
      {children}
    </a>
  );
}
