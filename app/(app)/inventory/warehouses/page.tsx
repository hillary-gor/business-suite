import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listWarehouses } from '@/server/modules/inventory/masters';
import { Card, DataTable, EmptyState, PageHeader } from '@/components/ui';
import { WarehouseForm } from './warehouse-form';

export const metadata = { title: 'Warehouses · SkyJet' };

export default async function WarehousesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { context, session, entity } = await authorise(Permission.MastersManageItems);
  const params = await searchParams;
  const showForm = params.new === '1';
  const warehouses = await listWarehouses(context);
  const manage = can(session, entity.entityId, Permission.MastersManageItems);

  return (
    <>
      <PageHeader
        title="Warehouses"
        description="Stock locations. Creating a warehouse also creates a MAIN bin."
        actions={
          manage && !showForm ? (
            <Link href="/inventory/warehouses?new=1" className="button button--primary">
              Add warehouse
            </Link>
          ) : null
        }
      />
      {showForm ? (
        <Card>
          <WarehouseForm />
        </Card>
      ) : null}
      <Card>
        {warehouses.length === 0 && !showForm ? (
          <EmptyState
            title="No warehouses yet"
            action={
              <Link href="/inventory/warehouses?new=1" className="button button--primary">
                Add warehouse
              </Link>
            }
          />
        ) : warehouses.length === 0 ? null : (
          <DataTable>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th className="numeric">Bins</th>
                <th>Kind</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {warehouses.map((w) => (
                <tr key={w.id}>
                  <td className="cell-code">{w.code}</td>
                  <td>{w.name}</td>
                  <td className="numeric">{w.bin_count}</td>
                  <td className="cell-muted">{w.is_consignment ? 'Consignment' : 'Owned'}</td>
                  <td className="cell-muted">{w.is_active ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
