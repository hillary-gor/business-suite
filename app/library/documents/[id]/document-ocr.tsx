'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { retryLibraryOcrAction } from '@/server/actions/library-organize';
import { Alert } from '@/components/ui';
import { DotsLoader } from '@/components/loading/dots-loader';
import { LIBRARY_OCR_MIME_TYPES, type LibraryOcrJob } from '@/server/modules/library/types';

export function LibraryDocumentOcr({
  documentId,
  mimeType,
  hasExtractedText,
  job,
  mayRetry,
}: {
  documentId: string;
  mimeType: string;
  hasExtractedText: boolean;
  job: LibraryOcrJob | null;
  mayRetry: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ocrable = (LIBRARY_OCR_MIME_TYPES as readonly string[]).includes(mimeType);

  let tone: 'info' | 'warning' | 'success' | 'danger' = 'info';
  let body = '';
  if (hasExtractedText && job?.status === 'done') {
    tone = 'success';
    body = 'Searchable text came from OCR on this scan.';
  } else if (hasExtractedText) {
    tone = 'success';
    body = "Searchable text came from the file's text layer.";
  } else if (job?.status === 'queued' || job?.status === 'running') {
    tone = 'warning';
    body = 'OCR is reading this scan. Search will pick it up when that finishes.';
  } else if (job?.status === 'failed') {
    tone = 'danger';
    body = job.lastError
      ? `OCR failed: ${job.lastError}`
      : 'OCR failed. The catalogue card still searches.';
  } else if (job?.status === 'skipped') {
    tone = 'warning';
    body = 'OCR ran and found no usable text.';
  } else if (ocrable) {
    tone = 'warning';
    body =
      'This file has no text layer. Search will not find words inside the scan until OCR runs.';
  } else {
    return null;
  }

  return (
    <Alert tone={tone}>
      <p>{body}</p>
      {mayRetry && ocrable && job?.status !== 'queued' && job?.status !== 'running' ? (
        <button
          type="button"
          className="button button--small"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              await retryLibraryOcrAction(documentId);
              router.refresh();
            });
          }}
        >
          {pending ? <DotsLoader label="Queueing" /> : 'Run OCR'}
        </button>
      ) : null}
    </Alert>
  );
}
