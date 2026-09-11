'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { restoreLibraryRevisionAction } from '@/server/actions/library';
import { Alert, Badge, DataTable } from '@/components/ui';
import { DotsLoader } from '@/components/loading/dots-loader';
import { LibraryDialog } from '@/app/library/library-dialog';
import { LibraryDownloadButton } from '@/app/library/library-download-button';
import { LibraryStamp } from '@/app/library/library-stamp';
import { formatLibraryFileSize } from '@/server/modules/library/format';
import type {
  LibraryClassification,
  LibraryDocumentRevision,
} from '@/server/modules/library/types';

export function LibraryDocumentRevisions({
  documentId,
  classification,
  revisions,
  mayManage,
}: {
  documentId: string;
  classification: LibraryClassification;
  revisions: readonly LibraryDocumentRevision[];
  mayManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function restore() {
    if (!restoreId) return;
    setError(null);
    startTransition(async () => {
      const result = await restoreLibraryRevisionAction(documentId, restoreId);
      if (!result.ok) {
        setError(result.error);
        setRestoreId(null);
        return;
      }
      setRestoreId(null);
      router.refresh();
    });
  }

  if (revisions.length === 0) {
    return <p className="cell-muted">No stored files for this document.</p>;
  }

  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <DataTable>
        <thead>
          <tr>
            <th>Rev</th>
            <th>File</th>
            <th>When</th>
            <th>Who</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {revisions.map((revision) => (
            <tr key={revision.id}>
              <td>
                {revision.revisionNo}
                {revision.isCurrent ? (
                  <>
                    {' '}
                    <Badge tone="success">Current</Badge>
                  </>
                ) : null}
              </td>
              <td>
                {revision.fileName}
                <span className="cell-muted"> · {formatLibraryFileSize(revision.fileSize)}</span>
              </td>
              <td>
                <LibraryStamp value={revision.createdAt} />
              </td>
              <td>{revision.createdByName || '—'}</td>
              <td>
                <div className="library-rev-actions">
                  <LibraryDownloadButton
                    documentId={documentId}
                    classification={classification}
                    revisionId={revision.id}
                    compact
                  />
                  {mayManage && !revision.isCurrent ? (
                    <button
                      type="button"
                      className="button button--small"
                      disabled={pending}
                      onClick={() => setRestoreId(revision.id)}
                    >
                      {pending && restoreId === revision.id ? (
                        <DotsLoader label="Restoring" />
                      ) : (
                        'Restore'
                      )}
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      {restoreId ? (
        <LibraryDialog
          title="Make this the current file"
          confirmLabel="Restore"
          pending={pending}
          onConfirm={restore}
          onClose={() => setRestoreId(null)}
        >
          <p>
            The file you see now stays in the list. This revision becomes the one preview and
            download use. Stored bytes are not copied.
          </p>
        </LibraryDialog>
      ) : null}
    </>
  );
}
