import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listGoodsReceipts } from '@/server/modules/purchasing/documents';
import { documentPdfPath } from '@/lib/documents/href';
import { Card, DataTable, EmptyState, PageHeader, StatusBadge } from '@/components/ui';

export const metadata = { title: 'Item receipts · SkyJet' };

export default async function GoodsReceiptsPage() {
  const { context, session, entity } = await authorise(Permission.ProcurementPurchaseReceive);
  const receipts = await listGoodsReceipts(context);
  const mayCreate = can(session, entity.entityId, Permission.ProcurementPurchaseReceive);

  return (
    <>
      <PageHeader
        title="Item receipts"
        description="Goods received notes. Posting receives stock against GRNI via the inventory movement engine."
        actions={
          mayCreate ? (
            <Link href="/purchasing/receipts/new" className="button button--primary">
              New item receipt
            </Link>
          ) : null
        }
      />
      <Card>
        {receipts.length === 0 ? (
          <EmptyState
            title="No item receipts yet"
            action={
              mayCreate ? (
                <Link href="/purchasing/receipts/new" className="button button--primary">
                  New item receipt
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
                <th>Vendor</th>
                <th>Warehouse</th>
                <th>Status</th>
                <th>Print</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id}>
                  <td className="cell-code">{r.grn_no ?? 'Draft'}</td>
                  <td>{r.receipt_date}</td>
                  <td>{r.supplier_name}</td>
                  <td>{r.warehouse_name}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>
                    <a
                      href={documentPdfPath('goods-receipt', r.id)}
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
