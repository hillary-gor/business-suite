import { Badge } from '@/components/ui';
import { ClassificationBadge } from '@/app/library/classification-badge';
import { LibraryStamp } from '@/app/library/library-stamp';
import { LibraryPersonName } from './document-person';
import { LibraryDocumentActions } from './document-actions';
import { formatLibraryFileSize } from '@/server/modules/library/format';
import {
  LIBRARY_CLASSIFICATION_HINTS,
  type LibraryColleague,
  type LibraryDocument,
} from '@/server/modules/library/types';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function LibraryDocumentFacts({
  document,
  uploader,
  mayManage,
}: {
  document: LibraryDocument;
  uploader: LibraryColleague | null;
  mayManage: boolean;
}) {
  const aircraft = [document.aircraftType, document.aircraftModel].filter(Boolean).join(' ');
  const revision = [document.revision, document.version].filter(Boolean).join(' / ');
  const identifiers = [
    aircraft ? { label: 'Aircraft', value: aircraft } : null,
    document.partNumber ? { label: 'Part number', value: document.partNumber } : null,
    document.manufacturer ? { label: 'Manufacturer', value: document.manufacturer } : null,
    revision ? { label: 'Revision / version', value: revision } : null,
    document.effectiveDate ? { label: 'Effective date', value: document.effectiveDate } : null,
  ].filter((row): row is { label: string; value: string } => row !== null);

  return (
    <div className="library-facts">
      <section className="library-facts__section">
        <h3>Access</h3>
        <p className="library-facts__access">
          <ClassificationBadge level={document.classification} />
          <span>{LIBRARY_CLASSIFICATION_HINTS[document.classification]}</span>
        </p>
      </section>

      <section className="library-facts__section">
        <h3>Description</h3>
        {document.description ? (
          <p className="library-facts__prose">{document.description}</p>
        ) : (
          <p className="library-facts__empty">No description yet.</p>
        )}
      </section>

      <section className="library-facts__section">
        <h3>Aircraft and part</h3>
        {identifiers.length > 0 ? (
          <dl className="library-facts__grid">
            {identifiers.map((row) => (
              <Fact key={row.label} label={row.label} value={row.value} />
            ))}
          </dl>
        ) : (
          <p className="library-facts__empty">None recorded.</p>
        )}
      </section>

      <section className="library-facts__section">
        <h3>File</h3>
        <p className="library-facts__file">{document.fileName}</p>
        <p className="library-facts__muted">
          {formatLibraryFileSize(document.fileSize)} · {document.mimeType}
        </p>
      </section>

      {document.tags.length > 0 ? (
        <section className="library-facts__section">
          <h3>Tags</h3>
          <div className="library-tags">
            {document.tags.map((tag) => (
              <Badge key={tag} tone="neutral">
                {tag}
              </Badge>
            ))}
          </div>
        </section>
      ) : null}

      <section className="library-facts__section">
        <h3>Record</h3>
        <dl className="library-facts__grid">
          <div>
            <dt>Uploaded by</dt>
            <dd>
              <LibraryPersonName
                documentId={document.id}
                personId={uploader?.id ?? null}
                name={uploader?.fullName ?? document.uploadedByName}
                preview={uploader}
              />
              {document.createdAt ? (
                <>
                  {' · '}
                  <LibraryStamp value={document.createdAt} />
                </>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Last changed</dt>
            <dd>
              <LibraryStamp value={document.updatedAt} empty="—" />
            </dd>
          </div>
        </dl>
      </section>

      {mayManage ? (
        <LibraryDocumentActions
          documentId={document.id}
          status={document.status}
          fileName={document.fileName}
        />
      ) : null}
    </div>
  );
}
