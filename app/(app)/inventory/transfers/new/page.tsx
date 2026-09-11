import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { listItems, listWarehouses } from '@/server/modules/inventory/masters';
import { listStockLots, listStockUnits } from '@/server/modules/inventory/ops';
import { Alert, Card, PageHeader } from '@/components/ui';
import { TransferForm } from './transfer-form';

export const metadata = { title: 'Stock transfer · SkyJet' };

export default async function NewTransferPage() {
  const { context } = await authorise(Permission.InvManageStock);
  const [items, warehouses, stockUnits, stockLots] = await Promise.all([
    listItems(context),
    listWarehouses(context),
    listStockUnits(context),
    listStockLots(context),
  ]);

  const stocked = items.filter((i) => i.is_stocked && i.is_active);
  const activeWarehouses = warehouses.filter((w) => w.is_active);

  if (stocked.length === 0 || activeWarehouses.length < 2) {
    return (
      <>
        <PageHeader title="Stock transfer" />
        <Alert tone="warning" title="Need two warehouses">
          Transfers move stock between locations. Add at least two active warehouses and a stocked
          product first.{' '}
          <Link href="/inventory/warehouses">Warehouses</Link>
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Stock transfer"
        description="Posts TRANSFER_OUT then TRANSFER_IN, carrying the outbound unit cost onto the inbound leg."
        actions={
          <Link href="/inventory/ledger" className="button">
            Stock ledger
          </Link>
        }
      />
      <Card>
        <TransferForm
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
        />
      </Card>
    </>
  );
}
