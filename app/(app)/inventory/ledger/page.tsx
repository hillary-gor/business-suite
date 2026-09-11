import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listItems, listWarehouses } from '@/server/modules/inventory/masters';
import { listStockLedger } from '@/server/modules/inventory/ops';
import { Amount, Card, DataTable, EmptyState, PageHeader } from '@/components/ui';

export const metadata = { title: 'Stock ledger · SkyJet' };

export default async function StockLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; item?: string; warehouse?: string }>;
}) {
  const { from, to, item, warehouse } = await searchParams;
  const { context, session, entity } = await authorise(Permission.InvRead);
  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const fromDate = from ?? defaultFrom;
  const toDate = to ?? defaultTo;

  const [rows, items, warehouses] = await Promise.all([
    listStockLedger(context, {
      fromDate,
      toDate,
      itemId: item || undefined,
      warehouseId: warehouse || undefined,
    }),
    listItems(context),
    listWarehouses(context),
  ]);

  const mayAdjust = can(session, entity.entityId, Permission.InvAdjustStock);
  const mayTransfer = can(session, entity.entityId, Permission.InvManageStock);

  return (
    <>
      <PageHeader
        title="Stock ledger"
        description="Append-only quantity and value movements. Every adjustment, transfer, receipt and issue lands here."
        actions={
          <div className="button-row">
            {mayAdjust ? (
              <Link href="/inventory/adjustments/new" className="button button--primary">
                Adjust stock
              </Link>
            ) : null}
            {mayTransfer ? (
              <Link href="/inventory/transfers/new" className="button">
                Transfer
              </Link>
            ) : null}
          </div>
        }
      />

      <Card>
        <form className="filter-bar" method="get">
          <div className="field">
            <label htmlFor="from">From</label>
            <input id="from" name="from" type="date" defaultValue={fromDate} />
          </div>
          <div className="field">
            <label htmlFor="to">To</label>
            <input id="to" name="to" type="date" defaultValue={toDate} />
          </div>
          <div className="field">
            <label htmlFor="item">Product</label>
            <select id="item" name="item" defaultValue={item ?? ''}>
              <option value="">All products</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.part_number} — {i.description}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="warehouse">Warehouse</label>
            <select id="warehouse" name="warehouse" defaultValue={warehouse ?? ''}>
              <option value="">All warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="button--primary">
            Show
          </button>
        </form>
      </Card>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="No movements in range"
            description="Widen the dates or post an adjustment / transfer to populate the ledger."
          />
        ) : (
          <DataTable dense>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Part no.</th>
                <th>Warehouse</th>
                <th>Serial / lot</th>
                <th className="numeric">Qty</th>
                <th className="numeric">Unit cost</th>
                <th className="numeric">Value</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="cell-muted">{row.movement_date}</td>
                  <td className="cell-code">{row.movement_type}</td>
                  <td>
                    <div className="cell-code">{row.part_number}</div>
                    <div className="cell-muted">{row.description}</div>
                  </td>
                  <td>{row.warehouse_code}</td>
                  <td className="cell-muted">
                    {row.serial_number ?? row.lot_number ?? '—'}
                  </td>
                  <td className="numeric">{row.quantity}</td>
                  <td className="numeric">
                    <Amount value={row.unit_cost_base} dash />
                  </td>
                  <td className="numeric">
                    <Amount value={row.value_base} dash />
                  </td>
                  <td className="cell-muted">{row.source_type}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
