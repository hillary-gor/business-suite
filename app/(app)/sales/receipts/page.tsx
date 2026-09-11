import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { listSalesReceipts } from '@/server/modules/sales/documents';
import { documentPdfPath } from '@/lib/documents/href';
import { Amount, Card, DataTable, EmptyState, PageHeader, StatusBadge } from '@/components/ui';

export const metadata = { title: 'Sales receipts · SkyJet' };

export default async function SalesReceiptsPage() {
  const { context, session, entity } = await authorise(Permission.SalesInvoiceCreate);
  const receipts = await listSalesReceipts(context);
  const mayCreate = session.permissionsByEntity
    .get(entity.entityId)
    ?.has(Permission.SalesInvoiceCreate);

  return (
    <>
      <PageHeader
        title="Sales receipts"
        description="Cash / card sales deposited immediately. Posting credits revenue and tax and debits the bank — no open receivable."
        actions={
          mayCreate ? (
            <Link href="/sales/receipts/new" className="button button--primary">
              New sales receipt
            </Link>
          ) : null
        }
      />

      <Card>
        {receipts.length === 0 ? (
          <EmptyState
            title="No sales receipts yet"
            description="Create a cash sale from Create → Sales receipt."
            action={
              <Link href="/sales/receipts/new" className="button button--primary">
                New sales receipt
              </Link>
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
              {receipts.map((receipt) => (
                <tr key={receipt.id}>
                  <td className="cell-code">{receipt.receipt_no ?? 'Draft'}</td>
                  <td>{receipt.receipt_date}</td>
                  <td>{receipt.customer_name}</td>
                  <td>
                    <StatusBadge status={receipt.status} />
                  </td>
                  <td className="numeric">
                    <Amount value={receipt.total} currency={receipt.currency_code} showCurrency />
                  </td>
                  <td>
                    <a
                      href={documentPdfPath('sales-receipt', receipt.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
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
