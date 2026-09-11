import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { listAuditLog } from '@/server/modules/settings/company';
import { Card, DataTable, EmptyState, PageHeader } from '@/components/ui';

export const metadata = { title: 'Audit log · SkyJet' };

function operationLabel(op: string) {
  if (op === 'I') return 'Insert';
  if (op === 'U') return 'Update';
  if (op === 'D') return 'Delete';
  return op;
}

export default async function AuditLogPage() {
  const { context } = await authorise(Permission.AuditRead);
  const rows = await listAuditLog(context);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Inserts, updates and deletes on audited tables in this entity. The log is append-only."
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No audit rows yet" description="Changes to master data and documents will appear here." />
        ) : (
          <DataTable dense>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Table</th>
                <th>Record</th>
                <th>Fields</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.occurred_at.replace('T', ' ').slice(0, 19)}</td>
                  <td>{row.actor_name ?? '—'}</td>
                  <td>{operationLabel(row.operation)}</td>
                  <td className="cell-code">
                    {row.schema_name}.{row.table_name}
                  </td>
                  <td className="cell-code">{row.record_id ?? '—'}</td>
                  <td className="cell-muted">
                    {(row.changed_fields ?? []).slice(0, 6).join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
