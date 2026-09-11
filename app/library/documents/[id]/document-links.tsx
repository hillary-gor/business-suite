'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  linkLibraryDocumentAction,
  searchLibraryLinkTargetsAction,
  unlinkLibraryDocumentAction,
} from '@/server/actions/library-organize';
import { Alert, DataTable } from '@/components/ui';
import { DotsLoader } from '@/components/loading/dots-loader';
import {
  LIBRARY_LINK_KIND_LABELS,
  LIBRARY_LINK_KINDS,
  type LibraryDocumentLink,
  type LibraryLinkKind,
} from '@/server/modules/library/types';
import { LibraryStamp } from '@/app/library/library-stamp';

export function LibraryDocumentLinks({
  documentId,
  links,
  mayManage,
}: {
  documentId: string;
  links: readonly LibraryDocumentLink[];
  mayManage: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<LibraryLinkKind>('item');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<{ recordId: string; label: string; hint: string | null }[]>([]);
  const [pending, startTransition] = useTransition();

  function search() {
    setError(null);
    startTransition(async () => {
      const result = await searchLibraryLinkTargetsAction(kind, query);
      if (!result.ok) {
        setError(result.error);
        setHits([]);
        return;
      }
      setHits(result.data);
    });
  }

  function link(recordId: string) {
    setError(null);
    startTransition(async () => {
      const result = await linkLibraryDocumentAction(documentId, kind, recordId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setHits([]);
      setQuery('');
      router.refresh();
    });
  }

  function unlink(target: LibraryDocumentLink) {
    startTransition(async () => {
      await unlinkLibraryDocumentAction(documentId, target.kind, target.recordId);
      router.refresh();
    });
  }

  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {mayManage ? (
        <div className="library-link-row">
          <label>
            Link to
            <select
              value={kind}
              disabled={pending}
              onChange={(event) => setKind(event.target.value as LibraryLinkKind)}
            >
              {LIBRARY_LINK_KINDS.map((value) => (
                <option key={value} value={value}>
                  {LIBRARY_LINK_KIND_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search
            <input
              value={query}
              disabled={pending}
              placeholder="Name, part number, email"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button type="button" className="button" onClick={search} disabled={pending}>
            {pending ? <DotsLoader label="Search" /> : 'Find'}
          </button>
        </div>
      ) : null}
      {hits.length > 0 ? (
        <ul className="library-recent__list">
          {hits.map((hit) => (
            <li key={hit.recordId}>
              <span>
                {hit.label}
                {hit.hint ? <span className="cell-muted"> · {hit.hint}</span> : null}
              </span>
              <button
                type="button"
                className="button button--small"
                onClick={() => link(hit.recordId)}
              >
                Link
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {links.length === 0 ? (
        <p className="cell-muted">Not linked to an item, person or supplier.</p>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>Type</th>
              <th>Name</th>
              <th>When</th>
              {mayManage ? <th></th> : null}
            </tr>
          </thead>
          <tbody>
            {links.map((linkRow) => (
              <tr key={`${linkRow.kind}:${linkRow.recordId}`}>
                <td>{LIBRARY_LINK_KIND_LABELS[linkRow.kind]}</td>
                <td>
                  {linkRow.label}
                  {linkRow.hint ? <span className="cell-muted"> · {linkRow.hint}</span> : null}
                </td>
                <td>
                  <LibraryStamp value={linkRow.createdAt} />
                </td>
                {mayManage ? (
                  <td>
                    <button
                      type="button"
                      className="button button--small"
                      disabled={pending}
                      onClick={() => unlink(linkRow)}
                    >
                      Remove
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </>
  );
}
