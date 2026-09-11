import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listDebitNotes } from '@/server/modules/sales/documents';
import { documentPdfPath } from '@/lib/documents/href';
import { Amount, Card, DataTable, EmptyState, PageHeader } from '@/components/ui';

export const metadata = { title: 'Debit notes · SkyJet' };

export default async function DebitNotesPage() {
  const { context, session, entity } = await authorise(Permission.SalesInvoiceCreate);
  const rows = await listDebitNotes(context);

  return (
    <>
      <PageHeader
        title="Debit notes"
        actions={
          can(session, entity.entityId, Permission.SalesInvoiceCreate) ? (
            <Link href="/sales/debit-notes/new" className="button button--primary">
              New debit note
            </Link>
          ) : null
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No debit notes" />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Number</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Status</th>
                <th className="numeric">Total</th>
                <th>Print</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="cell-code">{r.debit_no ?? '—'}</td>
                  <td>{r.debit_date}</td>
                  <td>{r.customer_name}</td>
                  <td>{r.status}</td>
                  <td className="numeric">
                    <Amount value={r.total} currency={r.currency_code} showCurrency />
                  </td>
                  <td>
                    <a href={documentPdfPath('debit-note', r.id)} target="_blank" rel="noreferrer">
                      Print
                    </a>
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
