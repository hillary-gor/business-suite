import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listManufacturers } from '@/server/modules/inventory/masters';
import { Card, DataTable, EmptyState, PageHeader } from '@/components/ui';
import { ManufacturerForm } from './manufacturer-form';

export const metadata = { title: 'Manufacturers · SkyJet' };

export default async function ManufacturersPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { context, session, entity } = await authorise(Permission.MastersManageItems);
  const params = await searchParams;
  const showForm = params.new === '1';
  const manufacturers = await listManufacturers(context);
  const manage = can(session, entity.entityId, Permission.MastersManageItems);

  return (
    <>
      <PageHeader
        title="Manufacturers"
        description="OEM identity for parts. CAGE codes keep manufacturer lookups unambiguous."
        actions={
          manage && !showForm ? (
            <Link href="/inventory/manufacturers?new=1" className="button button--primary">
              Add manufacturer
            </Link>
          ) : null
        }
      />
      {showForm ? (
        <Card>
          <ManufacturerForm />
        </Card>
      ) : null}
      <Card>
        {manufacturers.length === 0 && !showForm ? (
          <EmptyState
            title="No manufacturers yet"
            action={
              <Link href="/inventory/manufacturers?new=1" className="button button--primary">
                Add manufacturer
              </Link>
            }
          />
        ) : manufacturers.length === 0 ? null : (
          <DataTable>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>CAGE</th>
              </tr>
            </thead>
            <tbody>
              {manufacturers.map((m) => (
                <tr key={m.id}>
                  <td className="cell-code">{m.code}</td>
                  <td>{m.name}</td>
                  <td className="cell-muted">{m.cage_code ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
