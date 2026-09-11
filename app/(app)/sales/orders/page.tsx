import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listSalesOrders } from '@/server/modules/sales/documents';
import { documentPdfPath } from '@/lib/documents/href';
import { Amount, Card, DataTable, EmptyState, PageHeader, StatusBadge } from '@/components/ui';

export const metadata = { title: 'Sales orders · SkyJet' };

export default async function SalesOrdersPage() {
  const { context, session, entity } = await authorise(Permission.SalesInvoiceCreate);
  const rows = await listSalesOrders(context);
  const mayCreate = can(session, entity.entityId, Permission.SalesInvoiceCreate);

  return (
    <>
      <PageHeader
        title="Sales orders"
        description="Customer orders. No ledger impact until converted to an invoice."
        actions={
          mayCreate ? (
            <Link href="/sales/orders/new" className="button button--primary">
              New sales order
            </Link>
          ) : null
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="No sales orders yet"
            action={
              mayCreate ? (
                <Link href="/sales/orders/new" className="button button--primary">
                  New sales order
                </Link>
              ) : null
            }
          />
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
              {rows.map((o) => (
                <tr key={o.id}>
                  <td className="cell-code">{o.order_no ?? 'Draft'}</td>
                  <td>{o.order_date}</td>
                  <td>{o.customer_name}</td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="numeric">
                    <Amount value={o.total} currency={o.currency_code} showCurrency />
                  </td>
                  <td>
                    <a href={documentPdfPath('sales-order', o.id)} target="_blank" rel="noreferrer">
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
