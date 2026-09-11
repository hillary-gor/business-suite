import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { listWarehouses } from '@/server/modules/inventory/masters';
import { listStockUnits } from '@/server/modules/inventory/ops';
import { Amount, Card, DataTable, EmptyState, PageHeader } from '@/components/ui';

export const metadata = { title: 'Serial units · SkyJet' };

export default async function StockUnitsPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouse?: string }>;
}) {
  const { warehouse } = await searchParams;
  const { context } = await authorise(Permission.InvRead);
  const [units, warehouses] = await Promise.all([
    listStockUnits(context, warehouse || undefined),
    listWarehouses(context),
  ]);

  return (
    <>
      <PageHeader
        title="Serial units on hand"
        description="Physical serialised parts currently available. Each row is one unit with its condition and cost."
        actions={
          <Link href="/inventory/stock" className="button">
            Stock on hand
          </Link>
        }
      />

      <Card>
        <form className="filter-bar" method="get">
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
        {units.length === 0 ? (
          <EmptyState
            title="No serial units on hand"
            description="Receive serialised stock or load opening balances to see units here."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Part no.</th>
                <th>Serial</th>
                <th>Condition</th>
                <th>Warehouse</th>
                <th>Bin</th>
                <th className="numeric">Cost</th>
                <th>Expiry</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="cell-code">{u.part_number}</div>
                    <div className="cell-muted">{u.description}</div>
                  </td>
                  <td className="cell-code">{u.serial_number}</td>
                  <td>{u.condition_code}</td>
                  <td>{u.warehouse_code ?? '—'}</td>
                  <td className="cell-muted">{u.bin_code ?? '—'}</td>
                  <td className="numeric">
                    <Amount value={u.unit_cost_base} dash />
                  </td>
                  <td className="cell-muted">{u.expiry_date ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
