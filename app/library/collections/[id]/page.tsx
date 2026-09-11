import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PlatformModule } from '@/lib/platform/modules';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import {
  getLibraryCollection,
  listLibraryCollectionDocuments,
} from '@/server/modules/library/queries';
import { formatLibraryFileSize } from '@/server/modules/library/format';
import { LIBRARY_DOCUMENT_TYPE_LABELS } from '@/server/modules/library/types';
import { Badge, DataTable, EmptyState, PageHeader } from '@/components/ui';
import { ClassificationBadge } from '@/app/library/classification-badge';
import { LibraryCollectionForm } from '../collection-form';
import {
  LibraryCollectionAdd,
  LibraryCollectionDelete,
  LibraryCollectionRemove,
} from '../collection-actions';

export const metadata = { title: 'Collection · Skyjet Library' };

export default async function LibraryCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { context, session, entity } = await authorise(Permission.LibraryDocumentRead, {
    module: PlatformModule.Library,
  });

  let collection;
  try {
    collection = await getLibraryCollection(context, id);
  } catch {
    notFound();
  }

  const documents = await listLibraryCollectionDocuments(context, id);
  const mayManage = can(session, entity.entityId, Permission.LibraryDocumentManage);

  return (
    <>
      <PageHeader
        title={collection.name}
        description={collection.description || 'Mixed documents in one pile.'}
        actions={
          mayManage ? (
            <div className="button-row">
              <LibraryCollectionDelete collectionId={collection.id} />
            </div>
          ) : null
        }
      />

      <p className="library-crumb">
        <Link href="/library/collections">All collections</Link>
        {' · '}
        {String(collection.documentCount)} visible
      </p>

      {mayManage ? (
        <>
          <LibraryCollectionAdd collectionId={collection.id} />
          <LibraryCollectionForm
            collectionId={collection.id}
            name={collection.name}
            description={collection.description}
          />
        </>
      ) : null}

      {documents.length === 0 ? (
        <EmptyState
          title="Nothing you can open here"
          description="The collection is empty, or every file in it is above your access level."
        />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>Title</th>
              <th>Access</th>
              <th>Category</th>
              <th>File</th>
              {mayManage ? <th></th> : null}
            </tr>
          </thead>
          <tbody>
            {documents.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/library/documents/${row.id}`}>{row.title}</Link>
                </td>
                <td>
                  <ClassificationBadge level={row.classification} />
                </td>
                <td>
                  <Badge tone="info">{LIBRARY_DOCUMENT_TYPE_LABELS[row.documentType]}</Badge>
                </td>
                <td>
                  {row.fileName}
                  <span className="cell-muted"> · {formatLibraryFileSize(row.fileSize)}</span>
                </td>
                {mayManage ? (
                  <td>
                    <LibraryCollectionRemove collectionId={collection.id} documentId={row.id} />
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
