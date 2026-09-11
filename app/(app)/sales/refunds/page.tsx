import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listRefunds } from '@/server/modules/sales/documents';
import { documentPdfPath } from '@/lib/documents/href';
import { Amount, Card, DataTable, EmptyState, PageHeader } from '@/components/ui';

export const metadata = { title: 'Refunds · SkyJet' };

export default async function RefundsPage() {
  const { context, session, entity } = await authorise(Permission.SalesPaymentCreate);
  const rows = await listRefunds(context);

  return (
    <>
      <PageHeader
        title="Refunds"
        actions={
          can(session, entity.entityId, Permission.SalesPaymentCreate) ? (
            <Link href="/sales/refunds/new" className="button button--primary">
              New refund
            </Link>
          ) : null
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No refunds yet" />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Number</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Status</th>
                <th className="numeric">Amount</th>
                <th>Print</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="cell-code">{r.refund_no ?? '—'}</td>
                  <td>{r.refund_date}</td>
                  <td>{r.customer_name}</td>
                  <td>{r.status}</td>
                  <td className="numeric">
                    <Amount value={r.amount} currency={r.currency_code} showCurrency />
                  </td>
                  <td>
                    <a href={documentPdfPath('refund', r.id)} target="_blank" rel="noreferrer">
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
