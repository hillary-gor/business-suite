'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  archiveLibraryDocumentAction,
  deleteLibraryDocumentAction,
  replaceLibraryFileAction,
} from '@/server/actions/library';
import { Alert } from '@/components/ui';
import { DotsLoader } from '@/components/loading/dots-loader';
import { LibraryDialog } from '@/app/library/library-dialog';
import type { LibraryDuplicate } from '@/server/actions/library';

type Prompt = 'archive' | 'replace' | 'delete' | 'duplicate' | null;

export function LibraryDocumentActions({
  documentId,
  status,
  fileName,
}: {
  documentId: string;
  status: 'ACTIVE' | 'ARCHIVED';
  fileName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [duplicate, setDuplicate] = useState<LibraryDuplicate | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  function closeReplace() {
    if (pending) return;
    setPrompt(null);
    setFile(null);
    setDragging(false);
    setDuplicate(null);
  }

  function archive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveLibraryDocumentAction(documentId);
      if (!result.ok) {
        setError(result.error);
        setPrompt(null);
        return;
      }
      setPrompt(null);
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteLibraryDocumentAction(documentId);
      if (!result.ok) {
        setError(result.error);
        setPrompt(null);
        return;
      }
      setPrompt(null);
      router.replace('/library/documents');
      router.refresh();
    });
  }

  function replaceFile(acknowledgeDuplicate = false) {
    if (!file) {
      setError('Choose a file to replace with.');
      return;
    }
    setError(null);
    const formData = new FormData();
    formData.set('documentId', documentId);
    formData.set('file', file);
    if (acknowledgeDuplicate) formData.set('acknowledgeDuplicate', '1');
    startTransition(async () => {
      const result = await replaceLibraryFileAction(formData);
      if (!result.ok) {
        if (result.duplicate) {
          setDuplicate(result.duplicate);
          setPrompt('duplicate');
          return;
        }
        setError(result.error);
        setPrompt(null);
        return;
      }
      setPrompt(null);
      setDuplicate(null);
      setFile(null);
      router.refresh();
    });
  }

  return (
    <div className="library-actions">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="button-row">
        {status === 'ACTIVE' ? (
          <button
            type="button"
            className="button"
            onClick={() => setPrompt('archive')}
            disabled={pending}
          >
            {pending && prompt === 'archive' ? <DotsLoader label="Archiving" /> : 'Archive'}
          </button>
        ) : null}
        <button
          type="button"
          className="button"
          onClick={() => {
            setError(null);
            setPrompt('replace');
          }}
          disabled={pending}
        >
          Replace file
        </button>
        <button
          type="button"
          className="button button--danger"
          onClick={() => setPrompt('delete')}
          disabled={pending}
        >
          Delete
        </button>
      </div>

      {prompt === 'archive' ? (
        <LibraryDialog
          title="Archive this document"
          confirmLabel="Archive"
          pending={pending}
          onConfirm={archive}
          onClose={() => setPrompt(null)}
        >
          <p>It leaves the active catalogue. The file stays stored until you delete it.</p>
        </LibraryDialog>
      ) : null}

      {prompt === 'replace' ? (
        <LibraryDialog
          title="Replace the stored file"
          confirmLabel="Replace"
          danger
          wide
          pending={pending}
          onConfirm={() => replaceFile(false)}
          onClose={closeReplace}
        >
          <p>
            Replacing <strong>{fileName}</strong> keeps the current bytes as a previous revision.
            Anyone who already downloaded the old file still has that copy.
          </p>
          <label
            className={['library-dropzone', file ? 'is-chosen' : '', dragging ? 'is-dragging' : '']
              .filter(Boolean)
              .join(' ')}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setDragging(false);
              }
            }}
            onDrop={() => setDragging(false)}
          >
            <input
              name="file"
              type="file"
              disabled={pending}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setDragging(false);
              }}
            />
            <span className="library-dropzone__title">
              {file ? file.name : 'Choose a file or drop it here'}
            </span>
            <span className="library-dropzone__hint">
              PDF, image, Office, text or zip · 32 MB max. The new file becomes current.
            </span>
          </label>
        </LibraryDialog>
      ) : null}

      {prompt === 'delete' ? (
        <LibraryDialog
          title="Delete this document"
          confirmLabel="Delete permanently"
          danger
          pending={pending}
          onConfirm={remove}
          onClose={() => setPrompt(null)}
        >
          <p>The catalogue row and every stored revision are removed. This cannot be undone.</p>
        </LibraryDialog>
      ) : null}

      {prompt === 'duplicate' && duplicate ? (
        <LibraryDialog
          title="This file is already in the library"
          confirmLabel="Replace anyway"
          danger
          pending={pending}
          onConfirm={() => replaceFile(true)}
          onClose={closeReplace}
        >
          <p>
            The same bytes are already stored as <strong>{duplicate.title}</strong>. Replacing still
            creates a second catalogue identity with the same hash.
          </p>
        </LibraryDialog>
      ) : null}
    </div>
  );
}
