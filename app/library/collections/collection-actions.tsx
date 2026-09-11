'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { searchLibraryAction } from '@/server/actions/library';
import {
  addLibraryDocumentToCollectionAction,
  deleteLibraryCollectionAction,
  removeLibraryDocumentFromCollectionAction,
} from '@/server/actions/library-organize';
import { Alert } from '@/components/ui';
import { DotsLoader } from '@/components/loading/dots-loader';
import { LibraryDialog } from '@/app/library/library-dialog';

export function LibraryCollectionAdd({ collectionId }: { collectionId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<{ id: string; title: string }[]>([]);
  const [pending, startTransition] = useTransition();

  function search() {
    setError(null);
    startTransition(async () => {
      const result = await searchLibraryAction(query);
      if (!result.ok) {
        setError(result.error);
        setHits([]);
        return;
      }
      setHits(result.data.documents.map((doc) => ({ id: doc.id, title: doc.title })));
    });
  }

  function add(documentId: string) {
    setError(null);
    startTransition(async () => {
      const result = await addLibraryDocumentToCollectionAction(collectionId, documentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setQuery('');
      setHits([]);
      router.refresh();
    });
  }

  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="library-link-row">
        <label>
          Add a document
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title or part number"
            disabled={pending}
          />
        </label>
        <button
          type="button"
          className="button"
          onClick={search}
          disabled={pending || !query.trim()}
        >
          {pending ? <DotsLoader label="Search" /> : 'Find'}
        </button>
      </div>
      {hits.length > 0 ? (
        <ul className="library-recent__list">
          {hits.map((hit) => (
            <li key={hit.id}>
              <span>{hit.title}</span>
              <button type="button" className="button button--small" onClick={() => add(hit.id)}>
                Add
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export function LibraryCollectionRemove({
  collectionId,
  documentId,
}: {
  collectionId: string;
  documentId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="button button--small"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await removeLibraryDocumentFromCollectionAction(collectionId, documentId);
          router.refresh();
        });
      }}
    >
      {pending ? <DotsLoader label="Removing" /> : 'Remove'}
    </button>
  );
}

export function LibraryCollectionDelete({ collectionId }: { collectionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button type="button" className="button button--danger" onClick={() => setOpen(true)}>
        Delete collection
      </button>
      {open ? (
        <LibraryDialog
          title="Delete this collection"
          confirmLabel="Delete"
          danger
          pending={pending}
          onConfirm={() => {
            setError(null);
            startTransition(async () => {
              const result = await deleteLibraryCollectionAction(collectionId);
              if (!result.ok) {
                setError(result.error);
                setOpen(false);
                return;
              }
              router.replace('/library/collections');
              router.refresh();
            });
          }}
          onClose={() => setOpen(false)}
        >
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <p>The folder goes. Every document stays in the catalogue.</p>
        </LibraryDialog>
      ) : null}
    </>
  );
}
