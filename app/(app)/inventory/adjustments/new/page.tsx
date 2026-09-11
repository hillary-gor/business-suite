import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { listAccounts } from '@/server/modules/accounting/queries';
import { listItems, listWarehouses } from '@/server/modules/inventory/masters';
import { listStockLots, listStockUnits } from '@/server/modules/inventory/ops';
import { Alert, Card, PageHeader } from '@/components/ui';
import { AdjustmentForm } from './adjustment-form';

export const metadata = { title: 'Inventory adjustment · SkyJet' };

export default async function NewAdjustmentPage({
  searchParams,
}: {
  searchParams: Promise<{ itemId?: string }>;
}) {
  const { context } = await authorise(Permission.InvAdjustStock);
  const [{ itemId }, items, warehouses, stockUnits, stockLots, accounts] = await Promise.all([
    searchParams,
    listItems(context),
    listWarehouses(context),
    listStockUnits(context),
    listStockLots(context),
    listAccounts(context),
  ]);

  const stocked = items.filter((i) => i.is_stocked && i.is_active);
  const activeWarehouses = warehouses.filter((w) => w.is_active);

  if (stocked.length === 0 || activeWarehouses.length === 0) {
    return (
      <>
        <PageHeader title="Inventory adjustment" />
        <Alert tone="warning" title="Catalogue not ready">
          You need at least one active stocked product and warehouse before adjusting stock.{' '}
          <Link href="/inventory/items/new">Add a product</Link>
          {' · '}
          <Link href="/inventory/warehouses">Warehouses</Link>
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Inventory adjustment"
        description="Posts ADJUSTMENT_IN or ADJUSTMENT_OUT through the stock ledger. Inbound adjustments require a unit cost."
        actions={
          <Link href="/inventory/adjustments" className="button">
            All adjustments
          </Link>
        }
      />
      <Card>
        <AdjustmentForm
          items={stocked.map((i) => ({
            id: i.id,
            label: `${i.part_number} — ${i.description}`,
            trackingMode: i.tracking_mode,
            partNumber: i.part_number,
          }))}
          warehouses={activeWarehouses.map((w) => ({
            id: w.id,
            label: `${w.code} — ${w.name}`,
          }))}
          stockUnits={stockUnits
            .filter((u) => u.warehouse_id)
            .map((u) => ({
              id: u.id,
              itemId: u.item_id,
              label: `${u.serial_number} (${u.condition_code})`,
              warehouseId: u.warehouse_id!,
            }))}
          stockLots={stockLots.map((l) => ({
            id: l.id,
            itemId: l.item_id,
            label: `${l.lot_number} · qty ${l.quantity_on_hand}`,
            warehouseId: l.warehouse_id,
          }))}
          accounts={accounts
            .filter((account) => !account.isSummary && account.isActive)
            .map((account) => ({ id: account.id, label: `${account.code} — ${account.name}` }))}
          defaultItemId={itemId}
        />
      </Card>
    </>
  );
}
