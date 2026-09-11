import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listQuotations } from '@/server/modules/sales/documents';
import { Amount, Card, DataTable, EmptyState, PageHeader } from '@/components/ui';
import { formatDisplayDate, toCsv } from '@/lib/payables';
import {
  estimateDateBounds,
  estimateStatusCaption,
  estimateStatusLabel,
  parseEstimateRange,
  parseEstimateStatus,
  quotationStatusSql,
  registerPagerLabel,
} from '@/lib/customer-hub';
import { ColumnTable } from '../../purchasing/column-table';
import { PageFeedback } from '@/components/lists/list-chrome';
import { EstimateFilters } from './estimate-filters';
import { EstimateRowActions } from './estimate-row-actions';

export const metadata = { title: 'Estimates · SkyJet' };

const COLUMNS = [
  { id: 'date', label: 'Date' },
  { id: 'no', label: 'No.' },
  { id: 'customer', label: 'Customer' },
  { id: 'amount', label: 'Amount' },
  { id: 'status', label: 'Status' },
  { id: 'action', label: 'Action' },
];

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; range?: string }>;
}) {
  const { context, session, entity } = await authorise(Permission.SalesInvoiceCreate);
  const params = await searchParams;
  const status = parseEstimateStatus(params.status);
  const range = parseEstimateRange(params.range);
  const bounds = estimateDateBounds(range);
  const { rows, hasAny } = await listQuotations(context, {
    status: quotationStatusSql(status),
    from: bounds.from,
    to: bounds.to,
  });
  const mayCreate = can(session, entity.entityId, Permission.SalesInvoiceCreate);

  const csv = toCsv([
    ['Date', 'No.', 'Customer', 'Amount', 'Status'],
    ...rows.map((row) => [
      formatDisplayDate(row.quotation_date),
      row.quotation_no ?? 'Draft',
      row.customer_name,
      row.total,
      estimateStatusLabel(row.status),
    ]),
  ]);

  const createButton = mayCreate ? (
    <Link href="/sales/estimates/new" className="button button--primary">
      Create estimate
    </Link>
  ) : null;

  return (
    <>
      <PageHeader
        title="Estimates"
        actions={
          <>
            <PageFeedback />
            {createButton}
          </>
        }
      />

      {hasAny ? <EstimateFilters status={status} range={range} /> : null}

      <Card>
        {!hasAny ? (
          <section className="estimate-empty">
            <h2>No estimates yet</h2>
            <p>
              An estimate (quote) is a price you send before you invoice. It does not post to the
              books, so you can show a customer what a job will cost without creating a receivable.
            </p>
            <ul>
              <li>
                Use it when a customer asks “how much?” — a repair, a parts kit, or a job that is
                not sold yet.
              </li>
              <li>
                Send it from Customer Hub. They accept, then you convert it to an invoice in one
                step. Until then, nothing hits receivables.
              </li>
              <li>
                Keep the same line items from quote to invoice so the price you promised is the
                price you bill.
              </li>
            </ul>
            {createButton}
          </section>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No results found"
            description="Remove some filters or try a different date range."
          />
        ) : (
          <ColumnTable tableId="estimates" filename="estimates.csv" csv={csv} columns={COLUMNS}>
            <DataTable>
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
                  <th data-col="status">Status</th>
                  <th data-col="action">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const sentOn = formatDisplayDate(row.updated_on);
                  return (
                    <tr key={row.id}>
                      <td className="row-check">
                        <input
                          type="checkbox"
                          disabled
                          aria-label={`Select estimate ${row.quotation_no ?? 'draft'}`}
                        />
                      </td>
                      <td data-col="date">{formatDisplayDate(row.quotation_date)}</td>
                      <td data-col="no" className="cell-code">
                        {row.quotation_no ?? 'Draft'}
                      </td>
                      <td data-col="customer">{row.customer_name}</td>
                      <td className="numeric" data-col="amount">
                        <Amount value={row.total} currency={row.currency_code} showCurrency />
                      </td>
                      <td data-col="status">
                        <div className="estimate-status">
                          <strong>{estimateStatusLabel(row.status)}</strong>
                          {estimateStatusCaption(row.status, sentOn) ? (
                            <span>{estimateStatusCaption(row.status, sentOn)}</span>
                          ) : null}
                        </div>
                      </td>
                      <td data-col="action">
                        <EstimateRowActions
                          quotationId={row.id}
                          status={row.status}
                          convertedInvoiceId={row.converted_invoice_id}
                          canAct={mayCreate}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </ColumnTable>
        )}
        {hasAny ? (
          <p className="list-pager list-pager--nav">
            <span className="list-pager__links">
              <span className="is-disabled">First</span>
              <span className="is-disabled">Previous</span>
              <span className="is-disabled">Next</span>
              <span className="is-disabled">Last</span>
            </span>
            <span>{registerPagerLabel(rows.length)}</span>
          </p>
        ) : null}
      </Card>
    </>
  );
}
