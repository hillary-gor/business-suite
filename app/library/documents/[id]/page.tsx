import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PlatformModule } from '@/lib/platform/modules';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { NotFoundError } from '@/server/db/errors';
import {
  loadLibraryDocumentWorkspace,
  recordLibraryAccess,
} from '@/server/modules/library/queries';
import {
  LIBRARY_DOCUMENT_TYPE_LABELS,
  LIBRARY_CLASSIFICATION_HINTS,
} from '@/server/modules/library/types';
import { Badge, Card, PageHeader } from '@/components/ui';
import { ClassificationBadge } from '@/app/library/classification-badge';
import { assignableClassifications } from '@/app/library/access';
import { LibraryEditMetadataButton } from '@/app/library/documents/[id]/edit-metadata-button';
import { LibraryAccessTable } from '@/app/library/access-table';
import { LibraryDocumentComments } from './document-comments';
import { LibraryDocumentFacts } from './document-facts';
import { LibraryDocumentShare, LibraryShareTrail } from './document-share';
import { LibraryDocumentCollections } from './document-collections';
import { LibraryDocumentLinks } from './document-links';
import { LibraryDocumentOcr } from './document-ocr';
import { LibraryDocumentRevisions } from './document-revisions';
import { LibraryFilePreview } from './file-preview';
import { LibraryDownloadButton } from '@/app/library/library-download-button';
import { LibraryVisitBeacon } from '@/app/library/recent';
import { LibraryAccessRequestQueue, LibraryRequestAccessForm } from './document-access';

export const metadata = { title: 'Document · Skyjet Library' };

export default async function LibraryDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, session, entity } = await authorise(Permission.LibraryDocumentRead, {
    module: PlatformModule.Library,
  });

  const mayManage = can(session, entity.entityId, Permission.LibraryDocumentManage);
  const mayUpload = can(session, entity.entityId, Permission.LibraryDocumentUpload);
  const mayReadAccess = can(session, entity.entityId, Permission.LibraryAccessRead);

  let workspace;
  try {
    workspace = await loadLibraryDocumentWorkspace(context, id, {
      includeAccessEvents: mayReadAccess,
      includeAccessRequests: mayManage,
    });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const {
    document,
    ownRequest,
    accessRequests,
    revisions,
    ocrJob,
    links,
    memberships,
    collections,
    accessEvents,
    comments,
    shares,
    uploader,
  } = workspace;

  if (!document.canOpen) {
    return (
      <>
        <PageHeader
          title={document.title}
          description={LIBRARY_DOCUMENT_TYPE_LABELS[document.documentType]}
        />

        <p className="library-crumb">
          <Link href="/library/documents">All documents</Link>
          {' · '}
          <ClassificationBadge level={document.classification} />{' '}
          <Badge tone="neutral">Locked</Badge>
        </p>

        <Card title="This file is locked">
          <p>
            {LIBRARY_CLASSIFICATION_HINTS[document.classification]} Requesting access does not
            change your role — a manager can grant this one file.
          </p>
          <LibraryRequestAccessForm documentId={document.id} existing={ownRequest} />
        </Card>

        {mayManage ? (
          <Card title="Access requests">
            <LibraryAccessRequestQueue documentId={document.id} requests={accessRequests} />
          </Card>
        ) : null}
      </>
    );
  }

  await recordLibraryAccess(context, document.id, 'VIEW');
  return (
    <>
      <LibraryVisitBeacon id={document.id} title={document.title} />
      <PageHeader
        title={document.title}
        description={LIBRARY_DOCUMENT_TYPE_LABELS[document.documentType]}
        actions={
          <div className="button-row">
            <LibraryDownloadButton
              documentId={document.id}
              classification={document.classification}
            />
            <LibraryDocumentComments documentId={document.id} initial={comments} />
            <LibraryDocumentShare
              documentId={document.id}
              title={document.title}
              initial={shares}
            />
            {mayManage ? (
              <LibraryEditMetadataButton
                document={document}
                allowedClassifications={assignableClassifications(session, entity.entityId)}
              />
            ) : null}
          </div>
        }
      />

      <p className="library-crumb">
        <Link href="/library/documents">All documents</Link>
        {' · '}
        <ClassificationBadge level={document.classification} />
        {document.status === 'ARCHIVED' ? (
          <>
            {' '}
            <Badge tone="neutral">Archived</Badge>
          </>
        ) : null}
      </p>

      <LibraryDocumentOcr
        documentId={document.id}
        mimeType={document.mimeType}
        hasExtractedText={document.hasExtractedText}
        job={ocrJob}
        mayRetry={mayManage || mayUpload}
      />

      <div className="library-detail">
        <Card title="Preview">
          <LibraryFilePreview
            documentId={document.id}
            mimeType={document.mimeType}
            title={document.title}
          />
        </Card>

        <Card title="Details">
          <LibraryDocumentFacts document={document} uploader={uploader} mayManage={mayManage} />
        </Card>
      </div>

      {mayManage ? (
        <Card title="Access requests">
          <LibraryAccessRequestQueue documentId={document.id} requests={accessRequests} />
        </Card>
      ) : null}

      <Card title="File revisions">
        <LibraryDocumentRevisions
          documentId={document.id}
          classification={document.classification}
          revisions={revisions}
          mayManage={mayManage}
        />
      </Card>

      <Card title="Linked to">
        <LibraryDocumentLinks documentId={document.id} links={links} mayManage={mayManage} />
      </Card>

      <Card title="Collections">
        <LibraryDocumentCollections
          documentId={document.id}
          memberships={memberships}
          collections={collections}
          mayManage={mayManage}
        />
      </Card>

      <Card title="Share trail">
        <LibraryShareTrail documentId={document.id} shares={shares} />
      </Card>

      {mayReadAccess ? (
        <Card title="Who opened this, and when">
          <LibraryAccessTable events={accessEvents} />
        </Card>
      ) : null}
    </>
  );
}
