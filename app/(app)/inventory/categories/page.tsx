import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listItemCategories } from '@/server/modules/inventory/masters';
import { Card, DataTable, EmptyState, PageHeader } from '@/components/ui';
import { CategoryForm } from './category-form';

export const metadata = { title: 'Categories · SkyJet' };

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { context, session, entity } = await authorise(Permission.MastersManageItems);
  const params = await searchParams;
  const showForm = params.new === '1';
  const categories = await listItemCategories(context);
  const manage = can(session, entity.entityId, Permission.MastersManageItems);

  return (
    <>
      <PageHeader
        title="Product categories"
        description="Organise the catalogue. Account defaults can hang off a category later."
        actions={
          manage && !showForm ? (
            <Link href="/inventory/categories?new=1" className="button button--primary">
              Add category
            </Link>
          ) : null
        }
      />
      {showForm ? (
        <Card>
          <CategoryForm
            parents={categories.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))}
          />
        </Card>
      ) : null}
      <Card>
        {categories.length === 0 && !showForm ? (
          <EmptyState
            title="No categories yet"
            action={
              <Link href="/inventory/categories?new=1" className="button button--primary">
                Add category
              </Link>
            }
          />
        ) : categories.length === 0 ? null : (
          <DataTable>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Parent</th>
                <th>ATA</th>
                <th className="numeric">Items</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td className="cell-code">{c.code}</td>
                  <td>{c.name}</td>
                  <td className="cell-muted">{c.parent_name ?? '—'}</td>
                  <td className="cell-muted">{c.ata_chapter ?? '—'}</td>
                  <td className="numeric">{c.item_count}</td>
                  <td className="cell-muted">{c.is_active ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
