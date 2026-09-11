import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listStockOnHand } from '@/server/modules/inventory/masters';
import { listStockAlerts } from '@/server/modules/inventory/overview';
import { Amount, Card, DataTable, EmptyState, PageHeader, Quantity } from '@/components/ui';

export const metadata = { title: 'Stock on hand · SkyJet' };

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ alert?: string }>;
}) {
  const { context, session, entity } = await authorise(Permission.InvRead);
  const params = await searchParams;
  const alert = params.alert === 'low' || params.alert === 'out' ? params.alert : undefined;
  const mayPurchase = can(session, entity.entityId, Permission.ProcurementPurchaseCreate);

  if (alert) {
    const { rows } = await listStockAlerts(context, alert);
    const title = alert === 'low' ? 'Low on stock' : 'Out of stock';
    return (
      <>
        <PageHeader
          title={title}
          description={
            alert === 'low'
              ? 'Stocked items at or below their reorder point.'
              : 'Stocked items with no quantity on hand.'
          }
          actions={
            <>
              <Link href="/inventory" className="button">
                Overview
              </Link>
              <Link href="/inventory/stock" className="button">
                All stock
              </Link>
            </>
          }
        />
        <Card>
          {rows.length === 0 ? (
            <EmptyState
              title={alert === 'low' ? 'Nothing is low on stock' : 'Nothing is out of stock'}
            />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th>Part no.</th>
                  <th>Description</th>
                  <th className="numeric">Qty on hand</th>
                  {mayPurchase ? <th>Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="cell-code">{row.partNumber}</td>
                    <td>{row.description}</td>
                    <td className="numeric">
                      <Quantity value={row.qtyOnHand} />
                    </td>
                    {mayPurchase ? (
                      <td>
                        <Link
                          href={`/purchasing/orders/new?itemId=${row.id}${
                            row.reorderQuantity
                              ? `&qty=${encodeURIComponent(row.reorderQuantity)}`
                              : ''
                          }`}
                        >
                          Reorder
                        </Link>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>
      </>
    );
  }

  const rows = await listStockOnHand(context);

  return (
    <>
      <PageHeader
        title="Stock on hand"
        description="Live quantities from the stock sub-ledger. Adjustments and receipts will move these balances."
        actions={
          <Link href="/inventory/products" className="button">
            Products
          </Link>
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="No stock on hand"
            description="Receive stock or load opening balances to see quantities here."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Part no.</th>
                <th>Description</th>
                <th>Warehouse</th>
                <th className="numeric">Qty on hand</th>
                <th className="numeric">Avg cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.item_id}-${row.warehouse_code}`}>
                  <td className="cell-code">{row.part_number}</td>
                  <td>{row.description}</td>
                  <td>{row.warehouse_code}</td>
                  <td className="numeric">{row.quantity_on_hand}</td>
                  <td className="numeric">
                    <Amount value={row.average_cost} dash />
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
