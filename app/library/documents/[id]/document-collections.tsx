'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addLibraryDocumentToCollectionAction,
  removeLibraryDocumentFromCollectionAction,
} from '@/server/actions/library-organize';
import { Alert } from '@/components/ui';
import { DotsLoader } from '@/components/loading/dots-loader';
import type { LibraryCollectionSummary } from '@/server/modules/library/types';
import Link from 'next/link';

export function LibraryDocumentCollections({
  documentId,
  memberships,
  collections,
  mayManage,
}: {
  documentId: string;
  memberships: readonly LibraryCollectionSummary[];
  collections: readonly LibraryCollectionSummary[];
  mayManage: boolean;
}) {
  const router = useRouter();
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const memberIds = new Set(memberships.map((row) => row.id));
  const available = collections.filter((row) => !memberIds.has(row.id));
  const selectedId = available.some((row) => row.id === collectionId)
    ? collectionId
    : (available[0]?.id ?? '');

  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {memberships.length === 0 ? (
        <p className="cell-muted">Not in a collection.</p>
      ) : (
        <ul className="library-recent__list">
          {memberships.map((row) => (
            <li key={row.id}>
              <Link href={`/library/collections/${row.id}`}>{row.name}</Link>
              {mayManage ? (
                <button
                  type="button"
                  className="button button--small"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await removeLibraryDocumentFromCollectionAction(
                        row.id,
                        documentId,
                      );
                      if (!result.ok) setError(result.error);
                      router.refresh();
                    });
                  }}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {mayManage && available.length > 0 ? (
        <div className="library-link-row">
          <label>
            Add to collection
            <select
              value={selectedId}
              disabled={pending}
              onChange={(event) => setCollectionId(event.target.value)}
            >
              {available.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button"
            disabled={pending || !selectedId}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await addLibraryDocumentToCollectionAction(selectedId, documentId);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.refresh();
              });
            }}
          >
            {pending ? <DotsLoader label="Adding" /> : 'Add'}
          </button>
        </div>
      ) : null}
    </>
  );
}
