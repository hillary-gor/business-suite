import Link from 'next/link';
import { PlatformModule } from '@/lib/platform/modules';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listLibraryDocuments } from '@/server/modules/library/queries';
import { formatLibraryFileSize } from '@/server/modules/library/format';
import {
  LIBRARY_CLASSIFICATIONS,
  LIBRARY_CLASSIFICATION_LABELS,
  LIBRARY_DOCUMENT_TYPE_LABELS,
  LIBRARY_DOCUMENT_TYPES,
} from '@/server/modules/library/types';
import { Badge, DataTable, EmptyState, PageHeader } from '@/components/ui';
import { listLibraryInput } from '@/server/modules/library/schemas';
import { ClassificationBadge } from '@/app/library/classification-badge';
import { LibraryUploadButton } from '@/app/library/library-upload-button';
import { LibraryStamp } from '@/app/library/library-stamp';

export const metadata = { title: 'Documents · Skyjet Library' };

export default async function LibraryDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    documentType?: string;
    status?: string;
    tag?: string;
    classification?: string;
  }>;
}) {
  const raw = await searchParams;
  const parsed = listLibraryInput.safeParse({
    q: raw.q ?? '',
    documentType: raw.documentType ?? '',
    status: raw.status ?? 'ACTIVE',
    tag: raw.tag ?? '',
    classification: raw.classification ?? '',
  });
  const filters = parsed.success
    ? parsed.data
    : {
        q: '',
        documentType: '' as const,
        status: 'ACTIVE' as const,
        tag: '',
        classification: '' as const,
      };

  const { context, session, entity } = await authorise(Permission.LibraryDocumentRead, {
    module: PlatformModule.Library,
  });
  const rows = await listLibraryDocuments(context, filters);
  const mayUpload = can(session, entity.entityId, Permission.LibraryDocumentUpload);

  return (
    <>
      <PageHeader
        title="Documents"
        description="Search manuals, certificates and other technical files for this organisation."
        actions={mayUpload ? <LibraryUploadButton /> : null}
      />

      <form className="library-filters" method="get">
        <label>
          Search
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder="Title, part number, manufacturer. type:manuals level:confidential"
          />
        </label>
        <label>
          Category
          <select name="documentType" defaultValue={filters.documentType ?? ''}>
            <option value="">All categories</option>
            {LIBRARY_DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {LIBRARY_DOCUMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={filters.status ?? 'ACTIVE'}>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
        <label>
          Access level
          <select name="classification" defaultValue={filters.classification ?? ''}>
            <option value="">All levels</option>
            {LIBRARY_CLASSIFICATIONS.map((level) => (
              <option key={level} value={level}>
                {LIBRARY_CLASSIFICATION_LABELS[level]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tag
          <input type="text" name="tag" defaultValue={filters.tag ?? ''} placeholder="Tag" />
        </label>
        <button type="submit" className="button button--primary">
          Apply
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="No documents match"
          description="Try a different search, or upload the first file for this organisation."
          action={mayUpload ? <LibraryUploadButton /> : undefined}
        />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>Title</th>
              <th>Access</th>
              <th>Category</th>
              <th>Part</th>
              <th>Aircraft</th>
              <th>Revision</th>
              <th>Uploaded</th>
              <th>File</th>
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/library/documents/${row.id}`}>{row.title}</Link>
                  {row.status === 'ARCHIVED' ? (
                    <>
                      {' '}
                      <Badge tone="neutral">Archived</Badge>
                    </>
                  ) : null}
                  {row.canOpen ? null : (
                    <>
                      {' '}
                      <Badge tone="neutral">Locked</Badge>
                    </>
                  )}
                </td>
                <td>
                  <ClassificationBadge level={row.classification} />
                </td>
                <td>
                  <Badge tone="info">{LIBRARY_DOCUMENT_TYPE_LABELS[row.documentType]}</Badge>
                </td>
                <td>{row.partNumber ?? '—'}</td>
                <td>{[row.aircraftType, row.aircraftModel].filter(Boolean).join(' ') || '—'}</td>
                <td>{row.revision ?? row.version ?? '—'}</td>
                <td>
                  {row.uploadedByName ?? '—'}
                  <span className="cell-muted">
                    {' · '}
                    <LibraryStamp value={row.createdAt} />
                  </span>
                </td>
                <td>
                  {row.canOpen ? (
                    <>
                      {row.fileName}
                      <span className="cell-muted"> · {formatLibraryFileSize(row.fileSize)}</span>
                    </>
                  ) : (
                    <span className="cell-muted">Hidden until access is granted</span>
                  )}
                </td>
                <td>
                  {row.tags.length > 0 ? (
                    <span className="library-tags">
                      {row.tags.map((tag) => (
                        <Badge key={tag} tone="neutral">
                          {tag}
                        </Badge>
                      ))}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </>
  );
}
