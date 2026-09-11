'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadLibraryDocumentAction, type LibraryDuplicate } from '@/server/actions/library';
import { Alert, Field } from '@/components/ui';
import { DotsLoader } from '@/components/loading/dots-loader';
import { ClassificationField } from '@/app/library/classification-field';
import { LibraryDialog } from '@/app/library/library-dialog';
import {
  LIBRARY_DOCUMENT_TYPE_LABELS,
  LIBRARY_DOCUMENT_TYPES,
  type LibraryClassification,
} from '@/server/modules/library/types';

function titleFromFileName(name: string): string {
  const trimmed = name.trim();
  const cut = trimmed.lastIndexOf('.');
  const base = cut > 0 ? trimmed.slice(0, cut) : trimmed;
  return base.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
}

export function LibraryUploadForm({
  allowedClassifications,
  onUploaded,
}: {
  allowedClassifications: readonly LibraryClassification[];
  onUploaded?: (documentId: string) => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [duplicate, setDuplicate] = useState<LibraryDuplicate | null>(null);
  const [pending, startTransition] = useTransition();

  function applyFileName(next: string) {
    setFileName(next);
    if (!next) return;
    if (!titleTouched || !title.trim()) {
      setTitle(titleFromFileName(next));
    }
  }

  function submit(acknowledgeDuplicate: boolean) {
    const form = formRef.current;
    if (!form) return;
    setError(null);
    const formData = new FormData(form);
    if (acknowledgeDuplicate) formData.set('acknowledgeDuplicate', '1');
    startTransition(async () => {
      const result = await uploadLibraryDocumentAction(formData);
      if (!result.ok) {
        if (result.duplicate) {
          setDuplicate(result.duplicate);
          return;
        }
        setError(result.error);
        return;
      }
      setDuplicate(null);
      if (onUploaded) {
        onUploaded(result.data.documentId);
        return;
      }
      router.replace(`/library/documents/${result.data.documentId}`);
      router.refresh();
    });
  }

  return (
    <>
      <form
        ref={formRef}
        className="library-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit(false);
        }}
      >
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Field label="File" htmlFor="file" required>
          <label className={fileName ? 'library-dropzone is-chosen' : 'library-dropzone'}>
            <input
              id="file"
              name="file"
              type="file"
              required
              disabled={pending}
              onChange={(event) => applyFileName(event.target.files?.[0]?.name ?? '')}
            />
            <span className="library-dropzone__title">
              {fileName || 'Choose a file or drop it here'}
            </span>
            <span className="library-dropzone__hint">
              PDF, image, Office, text or zip · 32 MB max. PDF text and .txt/.csv are indexed for
              search. Scans without a text layer are not.
            </span>
          </label>
        </Field>

        <Field
          label="Title"
          htmlFor="title"
          hint="Filled from the file name. Change it if the name is wrong."
        >
          <input
            id="title"
            name="title"
            type="text"
            maxLength={240}
            value={title}
            disabled={pending}
            onChange={(event) => {
              setTitle(event.target.value);
              setTitleTouched(true);
            }}
          />
        </Field>

        <Field label="Category" htmlFor="documentType" required>
          <select id="documentType" name="documentType" defaultValue="manuals" disabled={pending}>
            {LIBRARY_DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {LIBRARY_DOCUMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>

        <ClassificationField allowed={allowedClassifications} disabled={pending} />

        <Field label="Description" htmlFor="description">
          <textarea id="description" name="description" rows={4} disabled={pending} />
        </Field>

        <div className="form-grid">
          <Field label="Aircraft type" htmlFor="aircraftType">
            <input id="aircraftType" name="aircraftType" type="text" disabled={pending} />
          </Field>
          <Field label="Aircraft model" htmlFor="aircraftModel">
            <input id="aircraftModel" name="aircraftModel" type="text" disabled={pending} />
          </Field>
          <Field label="Part number" htmlFor="partNumber">
            <input id="partNumber" name="partNumber" type="text" disabled={pending} />
          </Field>
          <Field label="Manufacturer" htmlFor="manufacturer">
            <input id="manufacturer" name="manufacturer" type="text" disabled={pending} />
          </Field>
          <Field label="Revision" htmlFor="revision">
            <input id="revision" name="revision" type="text" disabled={pending} />
          </Field>
          <Field label="Version" htmlFor="version">
            <input id="version" name="version" type="text" disabled={pending} />
          </Field>
          <Field label="Effective date" htmlFor="effectiveDate">
            <input id="effectiveDate" name="effectiveDate" type="date" disabled={pending} />
          </Field>
          <Field label="Tags" htmlFor="tags" hint="Comma-separated.">
            <input
              id="tags"
              name="tags"
              type="text"
              disabled={pending}
              placeholder="C of A, rotables"
            />
          </Field>
        </div>

        <div className="button-row">
          <button type="submit" className="button button--primary" disabled={pending}>
            {pending ? <DotsLoader label="Uploading" tone="inverse" /> : 'Upload'}
          </button>
        </div>
      </form>

      {duplicate ? (
        <LibraryDialog
          title="This file is already in the library"
          confirmLabel="Upload anyway"
          danger
          pending={pending}
          onConfirm={() => submit(true)}
          onClose={() => setDuplicate(null)}
        >
          <p>
            The same bytes are already stored as <strong>{duplicate.title}</strong>. Uploading
            anyway creates a second catalogue row with the same hash.
          </p>
        </LibraryDialog>
      ) : null}
    </>
  );
}
