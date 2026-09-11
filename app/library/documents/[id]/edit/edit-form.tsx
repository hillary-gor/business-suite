'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveLibraryMetadataAction } from '@/server/actions/library';
import { Alert, Field } from '@/components/ui';
import { DotsLoader } from '@/components/loading/dots-loader';
import type { LibraryClassification, LibraryDocument } from '@/server/modules/library/types';
import {
  LIBRARY_DOCUMENT_TYPE_LABELS,
  LIBRARY_DOCUMENT_TYPES,
} from '@/server/modules/library/types';
import { ClassificationField } from '@/app/library/classification-field';

export function LibraryEditForm({
  document,
  allowedClassifications,
  onSaved,
}: {
  document: LibraryDocument;
  allowedClassifications: readonly LibraryClassification[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    setFields({});
    startTransition(async () => {
      const result = await saveLibraryMetadataAction({
        documentId: document.id,
        title: String(data.get('title') ?? ''),
        description: String(data.get('description') ?? ''),
        documentType: String(data.get('documentType') ?? document.documentType),
        classification: String(data.get('classification') ?? document.classification),
        aircraftType: String(data.get('aircraftType') ?? ''),
        aircraftModel: String(data.get('aircraftModel') ?? ''),
        partNumber: String(data.get('partNumber') ?? ''),
        manufacturer: String(data.get('manufacturer') ?? ''),
        revision: String(data.get('revision') ?? ''),
        version: String(data.get('version') ?? ''),
        effectiveDate: String(data.get('effectiveDate') ?? ''),
        tags: String(data.get('tags') ?? ''),
      });
      if (!result.ok) {
        setError(result.error);
        setFields(result.fields ?? {});
        return;
      }
      if (onSaved) {
        onSaved();
        router.refresh();
        return;
      }
      router.replace(`/library/documents/${document.id}`);
      router.refresh();
    });
  }

  return (
    <form className="library-form" onSubmit={onSubmit}>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Field label="Title" htmlFor="title" required error={fields.title}>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={240}
          defaultValue={document.title}
          disabled={pending}
        />
      </Field>

      <Field label="Category" htmlFor="documentType" required>
        <select
          id="documentType"
          name="documentType"
          defaultValue={document.documentType}
          disabled={pending}
        >
          {LIBRARY_DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {LIBRARY_DOCUMENT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </Field>

      <ClassificationField
        allowed={allowedClassifications}
        defaultValue={document.classification}
        disabled={pending}
      />

      <Field label="Description" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={document.description ?? ''}
          disabled={pending}
        />
      </Field>

      <div className="form-grid">
        <Field label="Aircraft type" htmlFor="aircraftType">
          <input
            id="aircraftType"
            name="aircraftType"
            type="text"
            defaultValue={document.aircraftType ?? ''}
            disabled={pending}
          />
        </Field>
        <Field label="Aircraft model" htmlFor="aircraftModel">
          <input
            id="aircraftModel"
            name="aircraftModel"
            type="text"
            defaultValue={document.aircraftModel ?? ''}
            disabled={pending}
          />
        </Field>
        <Field label="Part number" htmlFor="partNumber">
          <input
            id="partNumber"
            name="partNumber"
            type="text"
            defaultValue={document.partNumber ?? ''}
            disabled={pending}
          />
        </Field>
        <Field label="Manufacturer" htmlFor="manufacturer">
          <input
            id="manufacturer"
            name="manufacturer"
            type="text"
            defaultValue={document.manufacturer ?? ''}
            disabled={pending}
          />
        </Field>
        <Field label="Revision" htmlFor="revision">
          <input
            id="revision"
            name="revision"
            type="text"
            defaultValue={document.revision ?? ''}
            disabled={pending}
          />
        </Field>
        <Field label="Version" htmlFor="version">
          <input
            id="version"
            name="version"
            type="text"
            defaultValue={document.version ?? ''}
            disabled={pending}
          />
        </Field>
        <Field label="Effective date" htmlFor="effectiveDate">
          <input
            id="effectiveDate"
            name="effectiveDate"
            type="date"
            defaultValue={document.effectiveDate ?? ''}
            disabled={pending}
          />
        </Field>
        <Field label="Tags" htmlFor="tags" hint="Comma-separated.">
          <input
            id="tags"
            name="tags"
            type="text"
            defaultValue={document.tags.join(', ')}
            disabled={pending}
          />
        </Field>
      </div>

      <div className="button-row">
        <button type="submit" className="button button--primary" disabled={pending}>
          {pending ? <DotsLoader label="Saving" tone="inverse" /> : 'Save'}
        </button>
      </div>
    </form>
  );
}
