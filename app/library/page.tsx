import Link from 'next/link';
import { PlatformModule } from '@/lib/platform/modules';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { getLibraryAccessPulse, getLibraryDashboard } from '@/server/modules/library/queries';
import { formatLibraryFileSize } from '@/server/modules/library/format';
import {
  LIBRARY_CLASSIFICATION_LABELS,
  LIBRARY_DOCUMENT_TYPE_LABELS,
} from '@/server/modules/library/types';
import { Badge, Card, EmptyState, PageHeader, Statistic } from '@/components/ui';
import { ClassificationBadge } from '@/app/library/classification-badge';
import { LibraryBarList, LibraryColumnChart } from '@/app/library/dashboard-charts';
import { LibraryUploadButton } from '@/app/library/library-upload-button';
import { LibraryStamp } from '@/app/library/library-stamp';
import { LibraryGuideLinks } from '@/app/library/library-guide-links';

export const metadata = { title: 'Skyjet Library' };

export default async function LibraryDashboardPage() {
  const { context, session, entity } = await authorise(Permission.LibraryDocumentRead, {
    module: PlatformModule.Library,
  });
  const mayUpload = can(session, entity.entityId, Permission.LibraryDocumentUpload);
  const mayAccess = can(session, entity.entityId, Permission.LibraryAccessRead);
  const dashboard = await getLibraryDashboard(context);
  const pulse = mayAccess ? await getLibraryAccessPulse(context) : null;
  const categories = dashboard.categories;

  return (
    <>
      <PageHeader
        title="Document library"
        description="Manuals, certificates, technical documents and aircraft records. Files above your clearance still appear as locked cards — you can request access to a specific file."
        actions={mayUpload ? <LibraryUploadButton /> : null}
      />

      <LibraryGuideLinks />

      <div className="library-stats">
        <Statistic
          label="Active documents"
          value={String(dashboard.totalActive)}
          hint="Visible in the current organisation"
        />
        <Statistic
          label="Stored files"
          value={formatLibraryFileSize(dashboard.storageBytes)}
          hint="Size of files you can open"
        />
        <Statistic
          label="Need OCR"
          value={String(dashboard.needsOcr)}
          hint="Scans with no text layer"
          tone={dashboard.needsOcr > 0 ? 'warning' : 'neutral'}
        />
        <Statistic
          label="Collections"
          value={String(dashboard.collectionCount)}
          hint="Mixed piles across categories"
        />
      </div>

      {dashboard.totalActive > 0 ? (
        <div className="library-analytics">
          <Card
            title="By category"
            description="What is on the shelf. Click a bar to open that list."
          >
            <LibraryBarList
              items={dashboard.byType.map((row) => ({
                label: LIBRARY_DOCUMENT_TYPE_LABELS[row.documentType],
                count: row.count,
                href: `/library/documents?documentType=${row.documentType}`,
              }))}
            />
          </Card>
          <Card
            title="Access levels"
            description="Clearance of files on the shelf, including locked cards you cannot open yet."
          >
            <LibraryBarList
              items={dashboard.byClassification.map((row) => ({
                label: LIBRARY_CLASSIFICATION_LABELS[row.classification],
                count: row.count,
                href: `/library/documents?classification=${row.classification}`,
              }))}
            />
          </Card>
          <Card title="Uploads" description="New catalogue rows, last 12 weeks.">
            <LibraryColumnChart
              points={dashboard.uploadsByWeek}
              ariaLabel="Documents uploaded per week for the last 12 weeks"
            />
          </Card>
          {pulse ? (
            <Card
              title="Opens"
              description={`${pulse.opensLast28Days} times someone opened or downloaded a file in the last 28 days.`}
            >
              <LibraryColumnChart
                points={pulse.byDay}
                dense
                ariaLabel="Library file opens per day for the last 28 days"
              />
              {pulse.topDocuments.length > 0 ? (
                <ul className="library-recent__list library-recent__list--tight">
                  {pulse.topDocuments.map((doc) => (
                    <li key={doc.id}>
                      <Link href={`/library/documents/${doc.id}`}>{doc.title}</Link>
                      <span>{String(doc.count)} opens</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="cell-muted">No opens in the last 30 days.</p>
              )}
            </Card>
          ) : null}
        </div>
      ) : null}

      <section className="library-section">
        <h2>Browse by category</h2>
        <div className="library-tiles">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/library/documents?documentType=${category.code}`}
              className="library-tile"
            >
              <span className="library-tile__count">{String(category.documentCount)}</span>
              <span className="library-tile__name">{category.name}</span>
              <span className="library-tile__desc">{category.description}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="library-section">
        <div className="library-section__head">
          <h2>Recent uploads</h2>
          <Link href="/library/documents">View all</Link>
        </div>
        {dashboard.recent.length === 0 ? (
          <EmptyState
            title="No documents yet"
            description="Upload a manual, certificate or other technical file to start the library."
            action={mayUpload ? <LibraryUploadButton /> : undefined}
          />
        ) : (
          <ul className="library-recent__list">
            {dashboard.recent.map((doc) => (
              <li key={doc.id}>
                <Link href={`/library/documents/${doc.id}`}>{doc.title}</Link>
                <span>
                  <Badge tone="info">{LIBRARY_DOCUMENT_TYPE_LABELS[doc.documentType]}</Badge>
                  <ClassificationBadge level={doc.classification} />
                  {doc.canOpen ? null : <Badge tone="neutral">Locked</Badge>}
                  {doc.partNumber ? ` · ${doc.partNumber}` : ''}
                  {doc.createdAt ? (
                    <>
                      {' · '}
                      <LibraryStamp value={doc.createdAt} />
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
