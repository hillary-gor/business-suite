import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listSupplierDirectory, listSupplierGlance } from '@/server/modules/purchasing/lists';
import { Amount, Card, DataTable, EmptyState, PageHeader } from '@/components/ui';
import { toCsv } from '@/lib/payables';
import { ColumnTable } from '../column-table';
import { PageFeedback, RowAction, SplitMenu } from '@/components/lists/list-chrome';

export const metadata = { title: 'Suppliers · SkyJet' };

const COLUMNS = [
  { id: 'supplier', label: 'Supplier' },
  { id: 'company', label: 'Company name' },
  { id: 'phone', label: 'Phone' },
  { id: 'email', label: 'Email' },
  { id: 'balance', label: 'Open balance' },
  { id: 'action', label: 'Action' },
];

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { context, session, entity } = await authorise(Permission.MastersManageSuppliers);
  const { q } = await searchParams;
  const [vendors, glance] = await Promise.all([
    listSupplierDirectory(context, q),
    listSupplierGlance(context),
  ]);
  const mayCreate = can(session, entity.entityId, Permission.MastersManageSuppliers);
  const mayBill = can(session, entity.entityId, Permission.FinancePaymentCreate);

  const csv = toCsv([
    ['Supplier', 'Company name', 'Phone', 'Email', 'Open balance'],
    ...vendors.map((vendor) => [
      vendor.legal_name,
      vendor.trading_name ?? vendor.legal_name,
      vendor.phone ?? '',
      vendor.email ?? '',
      vendor.open_balance,
    ]),
  ]);

  return (
    <>
      <PageHeader
        title="Suppliers"
        actions={
          <>
            <PageFeedback />
            {mayCreate ? (
              <SplitMenu
                label="New supplier"
                href="/purchasing/vendors/new"
                primary
                items={[
                  { label: 'New supplier', href: '/purchasing/vendors/new' },
                  { label: 'Import suppliers', disabled: true },
                ]}
              />
            ) : null}
          </>
        }
      />

      <section className="payables-strip" aria-label="Supplier balances last 365 days">
        <div className="payables-strip__cell payables-strip__cell--unbilled">
          <span className="payables-strip__label">Unbilled last 365 days</span>
          <Amount value={glance.unbilled.amount} currency={entity.baseCurrency} showCurrency />
          <span className="payables-strip__hint">
            {glance.unbilled.count} purchase order{glance.unbilled.count === '1' ? '' : 's'}
          </span>
        </div>
        <div className="payables-strip__cell payables-strip__cell--overdue">
          <span className="payables-strip__label">Overdue</span>
          <Amount value={glance.overdue.amount} currency={entity.baseCurrency} showCurrency />
          <span className="payables-strip__hint">{glance.overdue.count} overdue</span>
        </div>
        <div className="payables-strip__cell payables-strip__cell--open">
          <span className="payables-strip__label">Open bills</span>
          <Amount value={glance.open.amount} currency={entity.baseCurrency} showCurrency />
          <span className="payables-strip__hint">{glance.open.count} open bills</span>
        </div>
        <div className="payables-strip__cell payables-strip__cell--paid">
          <span className="payables-strip__label">Paid last 30 days</span>
          <Amount value={glance.paid.amount} currency={entity.baseCurrency} showCurrency />
          <span className="payables-strip__hint">{glance.paid.count} paid last 30 days</span>
        </div>
      </section>

      <Card>
        <ColumnTable
          tableId="suppliers"
          filename="suppliers.csv"
          csv={csv}
          columns={COLUMNS}
          leading={
            <form method="get" className="list-search">
              <input
                type="search"
                name="q"
                defaultValue={q ?? ''}
                placeholder="Search"
                aria-label="Search suppliers"
              />
            </form>
          }
        >
          {vendors.length === 0 ? (
            <EmptyState
              title={q ? 'No results found' : 'No suppliers yet'}
              description={q ? 'Try a different search.' : undefined}
              action={
                !q && mayCreate ? (
                  <Link href="/purchasing/vendors/new" className="button button--primary">
                    New supplier
                  </Link>
                ) : null
              }
            />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th data-col="supplier">Supplier</th>
                  <th data-col="company">Company name</th>
                  <th data-col="phone">Phone</th>
                  <th data-col="email">Email</th>
                  <th className="numeric" data-col="balance">
                    Open balance
                  </th>
                  <th data-col="action">Action</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr key={vendor.id}>
                    <td data-col="supplier">
                      <Link href={`/purchasing/vendors/${vendor.id}`}>{vendor.legal_name}</Link>
                    </td>
                    <td data-col="company">{vendor.trading_name ?? vendor.legal_name}</td>
                    <td data-col="phone">{vendor.phone ?? '—'}</td>
                    <td data-col="email">
                      {vendor.email ? (
                        <a className="mail-link" href={`mailto:${vendor.email}`}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                              d="M4 7.5 12 13l8-5.5M5 18h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1Z"
                              stroke="currentColor"
                              strokeWidth="1.75"
                              strokeLinejoin="round"
                            />
                          </svg>
                          {vendor.email}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="numeric" data-col="balance">
                      <Amount value={vendor.open_balance} currency={vendor.currency_code} showCurrency />
                    </td>
                    <td data-col="action">
                      <RowAction
                        label="Create bill"
                        href={
                          mayBill
                            ? `/purchasing/bills/new?supplierId=${vendor.id}`
                            : undefined
                        }
                        items={
                          mayBill
                            ? [
                                {
                                  label: 'Create bill',
                                  href: `/purchasing/bills/new?supplierId=${vendor.id}`,
                                },
                                {
                                  label: 'Create expense',
                                  href: `/purchasing/expenses/new?supplierId=${vendor.id}`,
                                },
                                {
                                  label: 'Create purchase order',
                                  href: `/purchasing/orders/new?supplierId=${vendor.id}`,
                                },
                              ]
                            : undefined
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </ColumnTable>
        <p className="list-pager">
          {vendors.length === 0 ? '0 - 0 of 0' : `1 - ${vendors.length} of ${vendors.length}`}
        </p>
      </Card>
    </>
  );
}
