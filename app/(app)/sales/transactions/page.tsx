import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { can, requireSession, resolveEntity } from '@/server/auth/session';
import { PermissionDeniedError } from '@/server/db/errors';
import { Amount, Card, DataTable, EmptyState, PageHeader } from '@/components/ui';
import { PageFeedback } from '@/components/lists/list-chrome';
import { formatDisplayDate, nairobiToday, toCsv } from '@/lib/payables';
import {
  estimateRibbonCaption,
  firstQuery,
  parseSalesTxnHidden,
  parseSalesTxnPage,
  parseSalesTxnPageSize,
  parseSalesTxnRange,
  parseSalesTxnSearch,
  parseSalesTxnStatus,
  parseSalesTxnType,
  salesTxnAgeingLabel,
  salesTxnDateBounds,
  salesTxnHideClass,
  salesTxnHref,
  salesTxnPagerRange,
  salesTxnQueryString,
  salesTxnStatusLabel,
  salesTxnStatusTone,
  salesTxnTypeLabel,
  unbilledRibbonCaption,
  type SalesTxnQuery,
} from '@/lib/sales-transactions';
import { overdueCaption, openBalanceCaption, recentlyPaidCaption } from '@/lib/customer-hub';
import {
  getSalesTransactionRibbon,
  listSalesTransactions,
} from '@/server/modules/sales/transactions';
import { TransactionsPrefsSync, TransactionsTableTools, TransactionsToolbar } from './toolbar';
import { TransactionRowActions } from './row-actions';

export const metadata = { title: 'Sales transactions · SkyJet' };

export default async function SalesTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireSession();
  const entity = await resolveEntity(session);
  const mayInvoice = can(session, entity.entityId, Permission.SalesInvoiceCreate);
  const mayPay = can(session, entity.entityId, Permission.SalesPaymentCreate);
  if (!mayInvoice && !mayPay) {
    throw new PermissionDeniedError(
      'You do not have permission to do that (sales.invoice.create or sales.payment.create required)',
    );
  }

  const params = await searchParams;
  const query: SalesTxnQuery = {
    type: parseSalesTxnType(firstQuery(params.type)),
    range: parseSalesTxnRange(firstQuery(params.range)),
    status: parseSalesTxnStatus(firstQuery(params.status)),
    q: parseSalesTxnSearch(firstQuery(params.q)),
    page: parseSalesTxnPage(firstQuery(params.page)),
    rows: parseSalesTxnPageSize(firstQuery(params.rows)),
    hidden: parseSalesTxnHidden(firstQuery(params.hidden)),
  };

  const today = nairobiToday();
  const bounds = salesTxnDateBounds(query.range, today);
  const context = {
    userId: session.userId,
    entityId: entity.entityId,
    requestId: session.requestId,
  };

  const [ribbon, list] = await Promise.all([
    getSalesTransactionRibbon(context),
    listSalesTransactions(context, {
      kind: query.type,
      from: bounds.from,
      to: bounds.to,
      search: query.q ?? null,
      status: query.status,
      today,
      limit: query.rows,
      offset: (query.page - 1) * query.rows,
    }),
  ]);

  const page = list.page;
  const lastPage = Math.max(1, Math.ceil(list.total / query.rows));
  const hrefFor = (pageNo: number) =>
    `/sales/transactions${salesTxnQueryString({ ...query, page: pageNo })}`;

  const mayReports =
    can(session, entity.entityId, Permission.ReportsView) ||
    can(session, entity.entityId, Permission.GlViewReports);
  const mayVoid = can(session, entity.entityId, Permission.SalesInvoiceVoid);
  const currency = entity.baseCurrency;
  const hideClass = salesTxnHideClass(query.hidden);

  const csv = toCsv([
    [
      'Date',
      'Type',
      'No.',
      'Customer',
      'Method',
      'Memo',
      'Due date',
      'Balance',
      'Amount',
      'Status',
    ],
    ...list.rows.map((row) => [
      formatDisplayDate(row.doc_date),
      salesTxnTypeLabel(row.kind),
      row.doc_no ?? '',
      row.customer_name,
      row.method ?? '',
      row.memo ?? '',
      row.due_date ? formatDisplayDate(row.due_date) : '',
      row.balance,
      row.amount,
      salesTxnStatusLabel({
        kind: row.kind,
        docStatus: row.doc_status,
        balance: row.balance,
        dueDate: row.due_date,
        convertedInvoiceId: row.converted_invoice_id,
        today,
      }),
    ]),
  ]);

  return (
    <>
      <PageHeader title="Sales transactions" actions={<PageFeedback />} />
      <TransactionsPrefsSync query={query} />

      <section className="hub-strip hub-strip--ledger" aria-label="Sales balances">
        <div className="hub-strip__cell hub-strip__cell--estimates">
          <p className="hub-strip__amount">
            <Amount value={ribbon.estimates.amount} currency={currency} showCurrency />
          </p>
          <p className="hub-strip__caption">{estimateRibbonCaption(ribbon.estimates.count)}</p>
        </div>
        <div className="hub-strip__cell hub-strip__cell--unbilled">
          <p className="hub-strip__amount">
            <Amount value={ribbon.unbilled.amount} currency={currency} showCurrency />
          </p>
          <p className="hub-strip__caption">{unbilledRibbonCaption()}</p>
        </div>
        <div className="hub-strip__cell hub-strip__cell--overdue">
          <p className="hub-strip__amount">
            <Amount value={ribbon.overdue.amount} currency={currency} showCurrency />
          </p>
          <p className="hub-strip__caption">{overdueCaption(ribbon.overdue.count)}</p>
        </div>
        <div className="hub-strip__cell hub-strip__cell--open">
          <p className="hub-strip__amount">
            <Amount value={ribbon.open.amount} currency={currency} showCurrency />
          </p>
          <p className="hub-strip__caption">{openBalanceCaption(ribbon.open.count)}</p>
        </div>
        <div className="hub-strip__cell hub-strip__cell--paid">
          <p className="hub-strip__amount">
            <Amount value={ribbon.paid.amount} currency={currency} showCurrency />
          </p>
          <p className="hub-strip__caption">{recentlyPaidCaption(ribbon.paid.count)}</p>
        </div>
      </section>

      <TransactionsToolbar query={query} mayInvoice={mayInvoice} mayPay={mayPay} />

      <Card>
        <div className={`col-table ${hideClass}`}>
          <DataTable dense>
            <thead>
              <tr>
                <th className="row-check">
                  <input type="checkbox" disabled aria-label="Select all" />
                </th>
                <th data-col="date">Date</th>
                <th data-col="type">Type</th>
                <th data-col="no">No.</th>
                <th data-col="customer">Customer</th>
                <th data-col="method">Method</th>
                <th data-col="memo">Memo</th>
                <th data-col="due">Due date</th>
                <th className="numeric" data-col="balance">
                  Balance
                </th>
                <th className="numeric" data-col="amount">
                  Amount
                </th>
                <th data-col="status">Status</th>
                <th data-col="email">Email</th>
                <th data-col="ageing">Ageing</th>
                <th data-col="delivered">Last Delivered</th>
                <th data-col="attachments">Attachments</th>
                <th data-col="action">
                  <span className="txn-action-head">
                    Action
                    <TransactionsTableTools
                      query={query}
                      csv={csv}
                      filename="sales-transactions.csv"
                      mayReports={mayReports}
                      mayStatements={mayInvoice}
                    />
                  </span>
                </th>
              </tr>
            </thead>
            {list.rows.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={16}>
                    <EmptyState
                      title={
                        query.q || query.type !== 'all' || query.status !== 'all'
                          ? 'No results found'
                          : 'No sales transactions yet'
                      }
                      description={
                        query.q || query.type !== 'all' || query.status !== 'all'
                          ? 'Remove some filters or try a different date range.'
                          : 'Invoices, estimates, payments, sales receipts, credit notes and refunds will show here once they exist.'
                      }
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {list.rows.map((row) => {
                  const href = salesTxnHref(row.kind, row.id);
                  const status = salesTxnStatusLabel({
                    kind: row.kind,
                    docStatus: row.doc_status,
                    balance: row.balance,
                    dueDate: row.due_date,
                    convertedInvoiceId: row.converted_invoice_id,
                    today,
                  });
                  const ageing = salesTxnAgeingLabel(row.kind, row.due_date, row.balance, today);
                  return (
                    <tr key={`${row.kind}-${row.id}`}>
                      <td className="row-check">
                        <input
                          type="checkbox"
                          disabled
                          aria-label={`Select ${row.doc_no ?? row.kind}`}
                        />
                      </td>
                      <td data-col="date">{formatDisplayDate(row.doc_date)}</td>
                      <td data-col="type">{salesTxnTypeLabel(row.kind)}</td>
                      <td className="cell-code" data-col="no">
                        {href ? (
                          <Link href={href}>{row.doc_no ?? 'Draft'}</Link>
                        ) : (
                          (row.doc_no ?? 'Draft')
                        )}
                      </td>
                      <td data-col="customer">{row.customer_name}</td>
                      <td data-col="method">{row.method ?? ''}</td>
                      <td data-col="memo">{row.memo ?? ''}</td>
                      <td data-col="due">{row.due_date ? formatDisplayDate(row.due_date) : ''}</td>
                      <td className="numeric" data-col="balance">
                        <Amount value={row.balance} currency={row.currency_code} showCurrency />
                      </td>
                      <td className="numeric" data-col="amount">
                        <Amount value={row.amount} currency={row.currency_code} showCurrency />
                      </td>
                      <td data-col="status">
                        <span className={`txn-status txn-status--${salesTxnStatusTone(status)}`}>
                          {status}
                        </span>
                      </td>
                      <td data-col="email">{row.email ?? ''}</td>
                      <td data-col="ageing">{ageing}</td>
                      <td data-col="delivered" />
                      <td data-col="attachments" />
                      <td data-col="action">
                        <TransactionRowActions
                          kind={row.kind}
                          id={row.id}
                          customerId={row.customer_id}
                          href={href}
                          docStatus={row.doc_status}
                          balance={row.balance}
                          convertedInvoiceId={row.converted_invoice_id}
                          mayInvoice={mayInvoice}
                          mayPay={mayPay}
                          mayVoid={mayVoid}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            )}
            <tfoot>
              <tr>
                <td className="row-check" />
                <td data-col="date" />
                <td data-col="type" />
                <td data-col="no" />
                <td data-col="customer">Total</td>
                <td data-col="method" />
                <td data-col="memo" />
                <td data-col="due" />
                <td className="numeric" data-col="balance">
                  <Amount value={list.totals.balance} currency={currency} showCurrency />
                </td>
                <td className="numeric" data-col="amount">
                  <Amount value={list.totals.amount} currency={currency} showCurrency />
                </td>
                <td data-col="status" />
                <td data-col="email" />
                <td data-col="ageing" />
                <td data-col="delivered" />
                <td data-col="attachments" />
                <td data-col="action" />
              </tr>
            </tfoot>
          </DataTable>
        </div>
        <p className="list-pager list-pager--nav">
          <span className="list-pager__links">
            <PagerLink label="First" href={hrefFor(1)} enabled={page > 1} />
            <PagerLink label="Previous" href={hrefFor(page - 1)} enabled={page > 1} />
            <PagerLink label="Next" href={hrefFor(page + 1)} enabled={page < lastPage} />
            <PagerLink label="Last" href={hrefFor(lastPage)} enabled={page < lastPage} />
          </span>
          <span>{salesTxnPagerRange(list.total, page, query.rows)}</span>
        </p>
      </Card>
    </>
  );
}

function PagerLink({ label, href, enabled }: { label: string; href: string; enabled: boolean }) {
  if (!enabled) return <span className="is-disabled">{label}</span>;
  return <Link href={href}>{label}</Link>;
}
