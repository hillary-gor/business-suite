import { DataTable } from '@/components/ui';
import { ClassificationBadge } from '@/app/library/classification-badge';
import { accessActionLabel } from '@/app/library/access';
import { LibraryStamp } from '@/app/library/library-stamp';
import type { LibraryAccessEvent } from '@/server/modules/library/types';

export function LibraryAccessTable({
  events,
  showDocument = false,
}: {
  events: readonly LibraryAccessEvent[];
  showDocument?: boolean;
}) {
  if (events.length === 0) {
    return <p className="cell-muted">No opens or downloads recorded yet.</p>;
  }

  return (
    <DataTable>
      <thead>
        <tr>
          <th>When</th>
          <th>Who</th>
          <th>Action</th>
          {showDocument ? <th>Document</th> : null}
          {showDocument ? <th>Access level</th> : null}
        </tr>
      </thead>
      <tbody>
        {events.map((event) => (
          <tr key={event.id}>
            <td>
              <LibraryStamp value={event.createdAt} />
            </td>
            <td>
              {event.actorName || 'Unknown'}
              {event.actorEmail ? <span className="cell-muted"> · {event.actorEmail}</span> : null}
            </td>
            <td>{accessActionLabel(event.action)}</td>
            {showDocument ? <td>{event.documentTitle}</td> : null}
            {showDocument ? (
              <td>
                <ClassificationBadge level={event.classification} />
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
