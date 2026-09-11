import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listSuppliersForSelect } from '@/server/modules/purchasing/documents';
import { listBillsRegister } from '@/server/modules/purchasing/lists';
import { Amount, Card, DataTable, EmptyState, PageHeader, StatusBadge } from '@/components/ui';
import { Money } from '@/lib/money';
import { documentPdfPath } from '@/lib/documents/href';
import {
  formatDisplayDate,
  last12MonthsRange,
  parseBillTab,
  queryString,
  thisYearRange,
  toCsv,
} from '@/lib/payables';
import { ColumnTable } from '../column-table';
import { PageFeedback, RowAction, SplitMenu } from '@/components/lists/list-chrome';

export const metadata = { title: 'Bills · SkyJet' };

const COLUMNS = [
  { id: 'supplier', label: 'Supplier' },
  { id: 'due', label: 'Due date' },
  { id: 'amount', label: 'Bill amount' },
  { id: 'balance', label: 'Open balance' },
  { id: 'status', label: 'Status' },
  { id: 'action', label: 'Action' },
];

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; range?: string; supplier?: string }>;
}) {
  const { context, session, entity } = await authorise(Permission.FinancePaymentCreate);
  const params = await searchParams;
  const tab = parseBillTab(params.tab);
  const range = params.range === 'last12' || params.range === 'all' ? params.range : 'thisYear';
  const { from, to } =
    range === 'last12'
      ? last12MonthsRange()
      : range === 'all'
        ? { from: '2000-01-01', to: '2099-12-31' }
        : thisYearRange();
  const supplierId = params.supplier || undefined;
  const mayCreate = can(session, entity.entityId, Permission.FinancePaymentCreate);

  const [bills, suppliers] = await Promise.all([
    listBillsRegister(context, { tab, from, to, supplierId }),
    listSuppliersForSelect(context),
  ]);

  const csv = toCsv([
    ['Supplier', 'Due date', 'Bill amount', 'Open balance', 'Status'],
    ...bills.map((bill) => [
      bill.supplier_name,
      formatDisplayDate(bill.due_date),
      bill.total,
      bill.outstanding,
      bill.status,
    ]),
  ]);

  const tabHref = (next: string) =>
    `/purchasing/bills${queryString({
      tab: next === 'unpaid' ? undefined : next,
      range: range === 'thisYear' ? undefined : range,
      supplier: supplierId,
    })}`;

  return (
    <>
      <PageHeader
        title="Bills"
        actions={
          <>
            <PageFeedback />
            <SplitMenu
              label="Pay bills"
              href="/purchasing/payments/new"
              items={[{ label: 'Pay bills', href: '/purchasing/payments/new' }]}
            />
            {mayCreate ? (
              <SplitMenu
                label="Add bill"
                href="/purchasing/bills/new"
                primary
                items={[
                  { label: 'Bill', href: '/purchasing/bills/new' },
                  { label: 'Expense', href: '/purchasing/expenses/new' },
                  { label: 'Purchase order', href: '/purchasing/orders/new' },
                ]}
              />
            ) : null}
          </>
        }
      />

      <nav className="pill-tabs" aria-label="Bill status">
        <Link href={tabHref('review')} aria-current={tab === 'review' ? 'page' : undefined}>
          For review
        </Link>
        <Link href={tabHref('unpaid')} aria-current={tab === 'unpaid' ? 'page' : undefined}>
          Unpaid
        </Link>
        <Link href={tabHref('paid')} aria-current={tab === 'paid' ? 'page' : undefined}>
          Paid
        </Link>
      </nav>

      <form className="filter-bar" method="get">
        {tab !== 'unpaid' ? <input type="hidden" name="tab" value={tab} /> : null}
        <label className="field">
          Supplier
          <select name="supplier" defaultValue={supplierId ?? ''}>
            <option value="">All</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.legal_name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Bill date
          <select name="range" defaultValue={range}>
            <option value="thisYear">This year</option>
            <option value="last12">Last 12 months</option>
            <option value="all">All dates</option>
          </select>
        </label>
        <button type="submit" className="button">
          Filters
        </button>
      </form>

      {range !== 'all' || supplierId ? (
        <div className="filter-chips">
          {range !== 'all' ? (
            <span className="filter-chip">
              Bill date: {formatDisplayDate(from)}–{formatDisplayDate(to)}
              <Link
                href={`/purchasing/bills${queryString({ tab: tab === 'unpaid' ? undefined : tab, supplier: supplierId })}`}
                aria-label="Clear date filter"
              >
                ×
              </Link>
            </span>
          ) : null}
        </div>
      ) : null}

      <Card>
        <ColumnTable tableId="bills" filename="bills.csv" csv={csv} columns={COLUMNS}>
          {bills.length === 0 ? (
            <EmptyState
              title="No results found"
              description="Remove some filters or try a different search."
            />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th data-col="supplier">Supplier</th>
                  <th data-col="due">Due date</th>
                  <th className="numeric" data-col="amount">
                    Bill amount
                  </th>
                  <th className="numeric" data-col="balance">
                    Open balance
                  </th>
                  <th data-col="status">Status</th>
                  <th data-col="action">Action</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill.id}>
                    <td data-col="supplier">{bill.supplier_name}</td>
                    <td data-col="due">{formatDisplayDate(bill.due_date)}</td>
                    <td className="numeric" data-col="amount">
                      <Amount value={bill.total} currency={bill.currency_code} showCurrency />
                    </td>
                    <td className="numeric" data-col="balance">
                      <Amount value={bill.outstanding} currency={bill.currency_code} showCurrency />
                    </td>
                    <td data-col="status">
                      <StatusBadge status={bill.status} />
                    </td>
                    <td data-col="action">
                      <RowAction
                        label={Money.from(bill.outstanding).isPositive() ? 'Pay' : 'View'}
                        href="/purchasing/payments/new"
                        items={[
                          { label: 'Pay bills', href: '/purchasing/payments/new' },
                          {
                            label: 'New bill',
                            href: `/purchasing/bills/new?supplierId=${bill.supplier_id}`,
                          },
                          {
                            label: 'Print',
                            href: documentPdfPath('supplier-bill', bill.id),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </ColumnTable>
        <p className="list-pager">
          {bills.length === 0 ? '0 - 0 of 0 items' : `1 - ${bills.length} of ${bills.length} items`}
        </p>
      </Card>
    </>
  );
}
