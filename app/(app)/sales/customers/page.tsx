import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listCustomerDirectory, listCustomerGlance } from '@/server/modules/sales/hub';
import { Amount, Card, DataTable, EmptyState, PageHeader } from '@/components/ui';
import { toCsv } from '@/lib/payables';
import {
  openBalanceCaption,
  overdueCaption,
  parseCustomerTab,
  recentlyPaidCaption,
  registerPagerLabel,
} from '@/lib/customer-hub';
import { ColumnTable } from '../../purchasing/column-table';
import { PageFeedback, RowAction, SplitMenu } from '@/components/lists/list-chrome';

export const metadata = { title: 'Customers & leads · SkyJet' };

const COLUMNS = [
  { id: 'name', label: 'Name' },
  { id: 'company', label: 'Company name' },
  { id: 'address', label: 'Address' },
  { id: 'phone', label: 'Phone' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'email', label: 'Email' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'balance', label: 'Open balance' },
  { id: 'action', label: 'Action' },
];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const { context, session, entity } = await authorise(Permission.MastersManageCustomers);
  const params = await searchParams;
  const tab = parseCustomerTab(params.tab);
  const q = params.q;
  const [customers, glance] = await Promise.all([
    listCustomerDirectory(context, q),
    listCustomerGlance(context),
  ]);
  const mayCreate = can(session, entity.entityId, Permission.MastersManageCustomers);
  const mayPay = can(session, entity.entityId, Permission.SalesPaymentCreate);
  const mayInvoice = can(session, entity.entityId, Permission.SalesInvoiceCreate);

  const csv = toCsv([
    ['Name', 'Company name', 'Address', 'Phone', 'Mobile', 'Email', 'Attachments', 'Open balance'],
    ...customers.map((customer) => [
      customer.legal_name,
      customer.trading_name ?? '',
      customer.address ?? '',
      customer.phone ?? '',
      customer.mobile ?? '',
      customer.email ?? '',
      customer.attachments === '0' ? '' : customer.attachments,
      customer.open_balance,
    ]),
  ]);

  return (
    <>
      <PageHeader
        title="Customers & leads"
        actions={
          <>
            <PageFeedback />
            {mayCreate ? (
              <SplitMenu
                label="New customer"
                href="/sales/customers/new"
                primary
                items={[
                  { label: 'New customer', href: '/sales/customers/new' },
                  {
                    label: 'Create estimate',
                    href: mayInvoice ? '/sales/estimates/new' : undefined,
                    disabled: !mayInvoice,
                  },
                  { label: 'Import customers', disabled: true },
                ]}
              />
            ) : null}
          </>
        }
      />

      <nav className="tabs" aria-label="Customers and leads">
        <Link href="/sales/customers" aria-current={tab === 'customers' ? 'page' : undefined}>
          Customers
        </Link>
        <Link href="/sales/customers?tab=leads" aria-current={tab === 'leads' ? 'page' : undefined}>
          Leads
        </Link>
      </nav>

      {tab === 'leads' ? (
        <Card>
          <EmptyState
            title="No leads yet"
            description="A lead is someone you have not sold to yet. This version keeps people as customers once you are ready to quote or invoice. Add a customer, then send an estimate from Customer Hub."
            action={
              mayCreate ? (
                <Link href="/sales/customers/new" className="button button--primary">
                  New customer
                </Link>
              ) : null
            }
          />
        </Card>
      ) : (
        <>
          <section className="hub-strip" aria-label="Customer balances">
            <div className="hub-strip__cell hub-strip__cell--estimates">
              <p className="hub-strip__line">
                <Amount
                  value={glance.estimates.amount}
                  currency={entity.baseCurrency}
                  showCurrency
                />{' '}
                estimates
              </p>
            </div>
            <div className="hub-strip__cell hub-strip__cell--unbilled">
              <p className="hub-strip__line">
                <Amount
                  value={glance.unbilled.amount}
                  currency={entity.baseCurrency}
                  showCurrency
                />{' '}
                unbilled income
              </p>
            </div>
            <div className="hub-strip__cell hub-strip__cell--overdue">
              <p className="hub-strip__line">
                <Amount value={glance.overdue.amount} currency={entity.baseCurrency} showCurrency />{' '}
                {overdueCaption(glance.overdue.count)}
              </p>
            </div>
            <div className="hub-strip__cell hub-strip__cell--open">
              <p className="hub-strip__line">
                <Amount value={glance.open.amount} currency={entity.baseCurrency} showCurrency />{' '}
                {openBalanceCaption(glance.open.count)}
              </p>
            </div>
            <div className="hub-strip__cell hub-strip__cell--paid">
              <p className="hub-strip__line">
                <Amount value={glance.paid.amount} currency={entity.baseCurrency} showCurrency />{' '}
                {recentlyPaidCaption(glance.paid.count)}
              </p>
            </div>
          </section>

          <Card>
            <ColumnTable
              tableId="customers"
              filename="customers.csv"
              csv={csv}
              columns={COLUMNS}
              leading={
                <form method="get" className="list-search">
                  <input
                    type="search"
                    name="q"
                    defaultValue={q ?? ''}
                    placeholder="Search"
                    aria-label="Search customers"
                  />
                </form>
              }
            >
              {customers.length === 0 ? (
                <EmptyState
                  title={q ? 'No results found' : 'No customers yet'}
                  description={
                    q
                      ? 'Try a different search.'
                      : 'Add the people and companies you invoice. Open balances come from issued invoices that are still unpaid.'
                  }
                  action={
                    !q && mayCreate ? (
                      <Link href="/sales/customers/new" className="button button--primary">
                        New customer
                      </Link>
                    ) : null
                  }
                />
              ) : (
                <DataTable>
                  <thead>
                    <tr>
                      <th className="row-check">
                        <input type="checkbox" disabled aria-label="Select all" />
                      </th>
                      <th data-col="name">Name</th>
                      <th data-col="company">Company name</th>
                      <th data-col="address">Address</th>
                      <th data-col="phone">Phone</th>
                      <th data-col="mobile">Mobile</th>
                      <th data-col="email">Email</th>
                      <th data-col="attachments">Attachments</th>
                      <th className="numeric" data-col="balance">
                        Open balance
                      </th>
                      <th data-col="action">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((customer) => (
                      <tr key={customer.id}>
                        <td className="row-check">
                          <input
                            type="checkbox"
                            disabled
                            aria-label={`Select ${customer.legal_name}`}
                          />
                        </td>
                        <td data-col="name">{customer.legal_name}</td>
                        <td data-col="company">{customer.trading_name ?? '—'}</td>
                        <td data-col="address">{customer.address ?? '—'}</td>
                        <td data-col="phone">{customer.phone ?? '—'}</td>
                        <td data-col="mobile">{customer.mobile ?? '—'}</td>
                        <td data-col="email">
                          {customer.email ? (
                            <a className="mail-link" href={`mailto:${customer.email}`}>
                              {customer.email}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td data-col="attachments">
                          {customer.attachments === '0' ? '—' : customer.attachments}
                        </td>
                        <td className="numeric" data-col="balance">
                          <Amount
                            value={customer.open_balance}
                            currency={customer.currency_code}
                            showCurrency
                          />
                        </td>
                        <td data-col="action">
                          <RowAction
                            label="Receive payment"
                            href={
                              mayPay ? `/sales/payments/new?customerId=${customer.id}` : undefined
                            }
                            items={[
                              ...(mayPay
                                ? [
                                    {
                                      label: 'Receive payment',
                                      href: `/sales/payments/new?customerId=${customer.id}`,
                                    },
                                  ]
                                : []),
                              ...(mayInvoice
                                ? [
                                    {
                                      label: 'Create estimate',
                                      href: `/sales/estimates/new`,
                                    },
                                    {
                                      label: 'Create invoice',
                                      href: `/sales/invoices/new`,
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </ColumnTable>
            <p className="list-pager">{registerPagerLabel(customers.length)}</p>
          </Card>
        </>
      )}
    </>
  );
}
