import Link from 'next/link';
import { PlatformModule } from '@/lib/platform/modules';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listLibraryCollections } from '@/server/modules/library/queries';
import { DataTable, EmptyState, PageHeader } from '@/components/ui';
import { LibraryStamp } from '@/app/library/library-stamp';

export const metadata = { title: 'Collections · Skyjet Library' };

export default async function LibraryCollectionsPage() {
  const { context, session, entity } = await authorise(Permission.LibraryDocumentRead, {
    module: PlatformModule.Library,
  });
  const collections = await listLibraryCollections(context);
  const mayManage = can(session, entity.entityId, Permission.LibraryDocumentManage);

  return (
    <>
      <PageHeader
        title="Collections"
        description="Named piles that can mix manuals, certificates and other types. Categories still classify each file."
        actions={
          mayManage ? (
            <Link href="/library/collections/new" className="button button--primary">
              New collection
            </Link>
          ) : null
        }
      />

      {collections.length === 0 ? (
        <EmptyState
          title="No collections yet"
          description="Create one when people actually keep mixed files together. Until then, browse by category."
          action={
            mayManage ? (
              <Link href="/library/collections/new" className="button button--primary">
                New collection
              </Link>
            ) : undefined
          }
        />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>Name</th>
              <th>Documents</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {collections.map((collection) => (
              <tr key={collection.id}>
                <td>
                  <Link href={`/library/collections/${collection.id}`}>{collection.name}</Link>
                  {collection.description ? (
                    <span className="cell-muted"> · {collection.description}</span>
                  ) : null}
                </td>
                <td>{String(collection.documentCount)}</td>
                <td>
                  <LibraryStamp value={collection.createdAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </>
  );
}
