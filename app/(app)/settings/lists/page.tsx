import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { Card, PageHeader } from '@/components/ui';

export const metadata = { title: 'All lists · SkyJet' };

export default async function AllListsPage() {
  await authorise(Permission.MastersRead);

  const lists = [
    {
      href: '/sales/customers',
      title: 'Customers & leads',
      description: 'People and companies you invoice.',
    },
    {
      href: '/purchasing/vendors',
      title: 'Suppliers',
      description: 'Vendors for bills, expenses and purchase orders.',
    },
    {
      href: '/inventory/products',
      title: 'Products and services',
      description: 'Sellable and stocked items.',
    },
    {
      href: '/inventory/categories',
      title: 'Product categories',
      description: 'How the catalogue is grouped.',
    },
    {
      href: '/inventory/warehouses',
      title: 'Warehouses',
      description: 'Stock locations and bins.',
    },
    {
      href: '/inventory/manufacturers',
      title: 'Manufacturers',
      description: 'OEM identity for parts.',
    },
    {
      href: '/accounting/accounts',
      title: 'Chart of accounts',
      description: 'The ledger structure.',
    },
  ];

  return (
    <>
      <PageHeader
        title="All lists"
        description="Master records used across sales, purchasing and inventory."
      />
      <div className="card-grid">
        {lists.map((item) => (
          <Card key={item.href}>
            <h2 className="card-title">{item.title}</h2>
            <p className="cell-muted">{item.description}</p>
            <div className="button-row">
              <Link href={item.href} className="button">
                Open
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
