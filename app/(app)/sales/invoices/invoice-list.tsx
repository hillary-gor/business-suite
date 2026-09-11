'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Amount, Card, DataTable, EmptyState } from '@/components/ui';
import { formatDisplayDate } from '@/lib/payables';
import {
  invoiceListHideClass,
  invoiceListQueryString,
  invoiceListStatusSortHref,
  type InvoiceListQuery,
} from '@/lib/sales-invoices';
import {
  salesTxnPagerRange,
  salesTxnStatusLabel,
  salesTxnStatusTone,
} from '@/lib/sales-transactions';
import {
  InvoiceDetailPanel,
  type InvoicePanelInvoice,
  type InvoicePanelLine,
} from './invoice-panel';
import { InvoiceRowActions } from './row-actions';
import { InvoiceTableTools } from './toolbar';

export type InvoiceListRow = {
  id: string;
  invoice_no: string | null;
  status: string;
  invoice_date: string;
  due_date: string;
  customer_id: string;
  customer_name: string;
  currency_code: string;
  total: string;
  outstanding: string;
};

export function InvoiceListWorkspace({
  query,
  rows,
  total,
  page,
  lastPage,
  today,
  mayPay,
  mayVoid,
  selectedInvoice,
  selectedLines,
}: {
  query: InvoiceListQuery;
  rows: InvoiceListRow[];
  total: number;
  page: number;
  lastPage: number;
  today: string;
  mayPay: boolean;
  mayVoid: boolean;
  selectedInvoice: InvoicePanelInvoice | null;
  selectedLines: InvoicePanelLine[];
}) {
  const router = useRouter();
  const hideClass = invoiceListHideClass(query.hidden);
  const statusSortHref = invoiceListStatusSortHref(query);
  const selectedId = query.invoice;
  const panelOpen = Boolean(selectedId);

  function hrefFor(patch: Partial<InvoiceListQuery>) {
    return `/sales/invoices${invoiceListQueryString({ ...query, ...patch })}`;
  }

  function openInvoice(id: string) {
    if (selectedId === id) return;
    router.push(hrefFor({ invoice: id }));
  }

  function closePanel() {
    if (!selectedId) return;
    router.push(hrefFor({ invoice: undefined }));
  }

  function toggleInvoice(id: string) {
    if (selectedId === id) closePanel();
    else openInvoice(id);
  }

  return (
    <div className={`invoice-workspace${panelOpen ? ' is-open' : ''}`}>
      <Card>
        <div className={`col-table ${hideClass}`}>
          <DataTable dense>
            <thead>
              <tr>
                <th className="row-check">
                  <input type="checkbox" disabled aria-label="Select all" />
                </th>
                <th data-col="date">Date</th>
                <th data-col="no">No.</th>
                <th data-col="customer">Customer</th>
                <th className="numeric" data-col="amount">
                  Amount
                </th>
                <th className="numeric" data-col="balance">
                  Balance
                </th>
                <th data-col="due">Due date</th>
                <th
                  data-col="status"
                  aria-sort={
                    query.sort === 'status'
                      ? query.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <Link href={statusSortHref} className="th-sort">
                    Status
                    {query.sort === 'status' ? (
                      <span aria-hidden="true">{query.dir === 'asc' ? ' ↑' : ' ↓'}</span>
                    ) : null}
                  </Link>
                </th>
                <th data-col="action">
                  <span className="txn-action-head">
                    Action
                    <InvoiceTableTools query={query} />
                  </span>
                </th>
              </tr>
            </thead>
            {rows.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      title={emptyTitle(query.status)}
                      description={emptyDescription(query.status)}
                    />
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {rows.map((invoice) => {
                  const status = salesTxnStatusLabel({
                    kind: 'invoice',
                    docStatus: invoice.status,
                    balance: invoice.outstanding,
                    dueDate: invoice.due_date,
                    convertedInvoiceId: null,
                    today,
                  });
                  const selected = selectedId === invoice.id;
                  return (
                    <tr
                      key={invoice.id}
                      className={selected ? 'invoice-row is-selected' : 'invoice-row'}
                      aria-selected={selected}
                      onClick={(event) => {
                        if (isRowActionTarget(event.target)) return;
                        toggleInvoice(invoice.id);
                      }}
                    >
                      <td className="row-check" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected}
                          aria-label={`Select ${invoice.invoice_no ?? 'draft invoice'}`}
                          onChange={(event) => {
                            if (event.target.checked) openInvoice(invoice.id);
                            else if (selected) closePanel();
                          }}
                        />
                      </td>
                      <td data-col="date">{formatDisplayDate(invoice.invoice_date)}</td>
                      <td className="cell-code" data-col="no">
                        <Link href={`/sales/invoices/${invoice.id}`}>
                          {invoice.invoice_no ?? 'Draft'}
                        </Link>
                      </td>
                      <td data-col="customer">{invoice.customer_name}</td>
                      <td className="numeric" data-col="amount">
                        <Amount
                          value={invoice.total}
                          currency={invoice.currency_code}
                          showCurrency
                        />
                      </td>
                      <td className="numeric" data-col="balance">
                        <Amount
                          value={invoice.outstanding}
                          currency={invoice.currency_code}
                          showCurrency
                        />
                      </td>
                      <td data-col="due">{formatDisplayDate(invoice.due_date)}</td>
                      <td data-col="status">
                        <span className={`txn-status txn-status--${salesTxnStatusTone(status)}`}>
                          {status}
                        </span>
                      </td>
                      <td data-col="action">
                        <InvoiceRowActions
                          id={invoice.id}
                          customerId={invoice.customer_id}
                          docStatus={invoice.status}
                          balance={invoice.outstanding}
                          mayPay={mayPay}
                          mayVoid={mayVoid}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </DataTable>
        </div>
        <p className="list-pager list-pager--end">
          <span className="list-pager__links">
            <PagerLink label="First" href={hrefFor({ page: 1 })} enabled={page > 1} />
            <PagerLink label="Previous" href={hrefFor({ page: page - 1 })} enabled={page > 1} />
            <span>{salesTxnPagerRange(total, page, query.rows)}</span>
            <PagerLink label="Next" href={hrefFor({ page: page + 1 })} enabled={page < lastPage} />
            <PagerLink label="Last" href={hrefFor({ page: lastPage })} enabled={page < lastPage} />
          </span>
        </p>
      </Card>
      {selectedId ? (
        <InvoiceDetailPanel
          invoice={selectedInvoice}
          lines={selectedLines}
          today={today}
          mayPay={mayPay}
          mayVoid={mayVoid}
          onClose={closePanel}
        />
      ) : null}
    </div>
  );
}

function isRowActionTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('a, button, input, textarea, select, label, .row-action'));
}

function emptyTitle(status: string): string {
  if (status === 'unpaid' || status === 'overdue' || status === 'not_due') {
    return 'No unpaid invoices';
  }
  if (status === 'not_deposited') return 'No undeposited payments';
  if (status === 'needs_attention') return 'Nothing needs attention';
  if (status === 'paid' || status === 'deposited') return 'No paid invoices';
  return 'No invoices yet';
}

function emptyDescription(status: string): string {
  if (status === 'unpaid' || status === 'overdue' || status === 'not_due') {
    return 'Issued invoices with an outstanding balance in this date range will show here.';
  }
  if (status === 'not_deposited') {
    return 'There is no undeposited-funds step yet, so this filter stays empty.';
  }
  if (status === 'needs_attention') {
    return 'Invoices do not carry a send-failed or error flag in this version.';
  }
  if (status === 'paid' || status === 'deposited') {
    return 'Issued invoices with a zero balance in this date range will show here.';
  }
  return 'Create an invoice from this page when you are ready to bill a customer.';
}

function PagerLink({ label, href, enabled }: { label: string; href: string; enabled: boolean }) {
  if (!enabled) return <span className="is-disabled">{label}</span>;
  return <Link href={href}>{label}</Link>;
}
