import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { can, requireSession, resolveEntity } from '@/server/auth/session';
import { PermissionDeniedError } from '@/server/db/errors';
import { listExpenseTransactions } from '@/server/modules/purchasing/lists';
import { Amount, Card, DataTable, EmptyState, PageHeader } from '@/components/ui';
import { Money } from '@/lib/money';
import {
  expenseKindLabel,
  formatDisplayDate,
  last12MonthsRange,
  parseExpenseKind,
  queryString,
  thisYearRange,
  toCsv,
} from '@/lib/payables';
import { ColumnTable } from '../column-table';
import { PageFeedback, RowAction, SplitMenu } from '@/components/lists/list-chrome';

export const metadata = { title: 'Expenses · SkyJet' };

const COLUMNS = [
  { id: 'date', label: 'Date' },
  { id: 'type', label: 'Type' },
  { id: 'no', label: 'No.' },
  { id: 'payee', label: 'Payee' },
  { id: 'category', label: 'Category' },
  { id: 'pretax', label: 'Total before sales tax' },
  { id: 'tax', label: 'Sales tax' },
  { id: 'total', label: 'Total' },
  { id: 'approval', label: 'Bill approval' },
  { id: 'action', label: 'Action' },
];

export default async function ExpenseTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; range?: string }>;
}) {
  const session = await requireSession();
  const entity = await resolveEntity(session);
  const mayPay = can(session, entity.entityId, Permission.FinancePaymentCreate);
  const mayPo = can(session, entity.entityId, Permission.ProcurementPurchaseCreate);
  const mayReceive = can(session, entity.entityId, Permission.ProcurementPurchaseReceive);
  if (!mayPay && !mayPo && !mayReceive) {
    throw new PermissionDeniedError('You do not have permission to view expenses');
  }

  const params = await searchParams;
  const kind = parseExpenseKind(params.kind);
  const range = params.range === 'thisYear' ? 'thisYear' : 'last12';
  const { from, to } = range === 'thisYear' ? thisYearRange() : last12MonthsRange();

  const rows = await listExpenseTransactions(
    { userId: session.userId, entityId: entity.entityId, requestId: session.requestId },
    { from, to, kind, baseCurrency: entity.baseCurrency },
  );

  let pretax = Money.zero();
  let tax = Money.zero();
  let total = Money.zero();
  for (const row of rows) {
    pretax = pretax.plus(row.subtotal);
    tax = tax.plus(row.tax_total);
    total = total.plus(row.total);
  }

  const csv = toCsv([
    COLUMNS.map((column) => column.label),
    ...rows.map((row) => [
      formatDisplayDate(row.doc_date),
      expenseKindLabel(row.kind),
      row.doc_no ?? '',
      row.payee,
      row.category ?? '',
      row.subtotal,
      row.tax_total,
      row.total,
      row.approval ?? '',
    ]),
  ]);

  return (
    <>
      <PageHeader
        title="Expenses"
        actions={
          <>
            <PageFeedback />
            {mayPay ? (
              <Link href="/purchasing/payments/new" className="button">
                Pay bills
              </Link>
            ) : null}
            <SplitMenu
              label="New transaction"
              href={mayPay ? '/purchasing/expenses/new' : '/purchasing/orders/new'}
              primary
              items={[
                { label: 'Expense', href: '/purchasing/expenses/new', disabled: !mayPay },
                { label: 'Bill', href: '/purchasing/bills/new', disabled: !mayPay },
                { label: 'Purchase order', href: '/purchasing/orders/new', disabled: !mayPo },
                { label: 'Item receipt', href: '/purchasing/receipts/new', disabled: !mayReceive },
                { label: 'Supplier credit', href: '/purchasing/credits/new', disabled: !mayPay },
                { label: 'Pay bills', href: '/purchasing/payments/new', disabled: !mayPay },
              ]}
            />
          </>
        }
      />

      <form className="filter-bar" method="get">
        <label className="field">
          Type
          <select name="kind" defaultValue={kind}>
            <option value="all">All transactions</option>
            <option value="expense">Expenses</option>
            <option value="bill">Bills</option>
            <option value="purchase_order">Purchase orders</option>
            <option value="item_receipt">Item receipts</option>
            <option value="payment">Payments</option>
            <option value="credit">Supplier credits</option>
          </select>
        </label>
        <label className="field">
          Dates
          <select name="range" defaultValue={range}>
            <option value="last12">Last 12 months</option>
            <option value="thisYear">This year</option>
          </select>
        </label>
        <button type="submit" className="button">
          Filter
        </button>
      </form>

      <div className="filter-chips">
        <span className="filter-chip">
          Dates: {range === 'last12' ? 'Last 12 months' : 'This year'}
          <Link
            href={`/purchasing/expenses${queryString({ kind: kind === 'all' ? undefined : kind })}`}
            aria-label="Reset dates"
          >
            ×
          </Link>
        </span>
      </div>

      <Card>
        <ColumnTable tableId="expenses" filename="expenses.csv" csv={csv} columns={COLUMNS}>
          {rows.length === 0 ? (
            <EmptyState
              title="No results found"
              description="Remove some filters or try a different search."
            />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th data-col="date">Date</th>
                  <th data-col="type">Type</th>
                  <th data-col="no">No.</th>
                  <th data-col="payee">Payee</th>
                  <th data-col="category">Category</th>
                  <th className="numeric" data-col="pretax">
                    Total before sales tax
                  </th>
                  <th className="numeric" data-col="tax">
                    Sales tax
                  </th>
                  <th className="numeric" data-col="total">
                    Total
                  </th>
                  <th data-col="approval">Bill approval</th>
                  <th data-col="action">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.kind}-${row.id}`}>
                    <td data-col="date">{formatDisplayDate(row.doc_date)}</td>
                    <td data-col="type">{expenseKindLabel(row.kind)}</td>
                    <td className="cell-code" data-col="no">
                      {row.href && row.kind === 'purchase_order' ? (
                        <Link href={row.href}>{row.doc_no ?? 'Draft'}</Link>
                      ) : (
                        (row.doc_no ?? 'Draft')
                      )}
                    </td>
                    <td data-col="payee">{row.payee}</td>
                    <td className="cell-muted" data-col="category">
                      {row.category ?? '—'}
                    </td>
                    <td className="numeric" data-col="pretax">
                      <Amount value={row.subtotal} currency={row.currency_code} showCurrency />
                    </td>
                    <td className="numeric" data-col="tax">
                      <Amount value={row.tax_total} currency={row.currency_code} showCurrency />
                    </td>
                    <td className="numeric" data-col="total">
                      <Amount value={row.total} currency={row.currency_code} showCurrency />
                    </td>
                    <td className="cell-muted" data-col="approval">
                      {row.kind === 'purchase_order' || row.kind === 'bill' ? (row.approval ?? '') : ''}
                    </td>
                    <td data-col="action">
                      <RowAction
                        label="View/Edit"
                        href={row.href ?? undefined}
                        items={
                          row.kind === 'purchase_order'
                            ? [
                                { label: 'View order', href: row.href! },
                                { label: 'Create bill', href: '/purchasing/bills/new' },
                              ]
                            : row.kind === 'bill' || row.kind === 'expense'
                              ? [{ label: 'Pay bills', href: '/purchasing/payments/new' }]
                              : undefined
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td data-col="date" colSpan={5}>
                    Total
                  </td>
                  <td className="numeric" data-col="pretax">
                    <Amount value={pretax} currency={entity.baseCurrency} showCurrency />
                  </td>
                  <td className="numeric" data-col="tax">
                    <Amount value={tax} currency={entity.baseCurrency} showCurrency />
                  </td>
                  <td className="numeric" data-col="total">
                    <Amount value={total} currency={entity.baseCurrency} showCurrency />
                  </td>
                  <td data-col="approval" />
                  <td data-col="action" />
                </tr>
              </tfoot>
            </DataTable>
          )}
        </ColumnTable>
        <p className="list-pager">
          {rows.length === 0 ? '0 - 0 of 0' : `1 - ${rows.length} of ${rows.length}`}
        </p>
      </Card>
    </>
  );
}
