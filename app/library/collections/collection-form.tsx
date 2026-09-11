'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveLibraryCollectionAction } from '@/server/actions/library-organize';
import { Alert, Field } from '@/components/ui';
import { DotsLoader } from '@/components/loading/dots-loader';

export function LibraryCollectionForm({
  collectionId,
  name,
  description,
}: {
  collectionId?: string;
  name?: string;
  description?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="library-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await saveLibraryCollectionAction({
            collectionId,
            name: String(form.get('name') ?? ''),
            description: String(form.get('description') ?? ''),
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(`/library/collections/${result.data.collectionId}`);
          router.refresh();
        });
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Name" htmlFor="collection-name" required>
        <input
          id="collection-name"
          name="name"
          required
          maxLength={80}
          defaultValue={name ?? ''}
          disabled={pending}
        />
      </Field>
      <Field
        label="Description"
        htmlFor="collection-description"
        hint="Use this when the files are not all the same category — an AOG pack, a bid set, a training folder."
      >
        <textarea
          id="collection-description"
          name="description"
          rows={3}
          maxLength={400}
          defaultValue={description ?? ''}
          disabled={pending}
        />
      </Field>
      <div className="button-row">
        <button type="submit" className="button button--primary" disabled={pending}>
          {pending ? <DotsLoader label="Saving" /> : collectionId ? 'Save' : 'Create collection'}
        </button>
      </div>
    </form>
  );
}
