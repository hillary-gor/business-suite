import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { getCustomerStatement, listCustomersForSelect } from '@/server/modules/sales/documents';
import { documentPdfPath } from '@/lib/documents/href';
import {
  Amount,
  Card,
  DataTable,
  EmptyState,
  Field,
  PageHeader,
  StatusBadge,
} from '@/components/ui';

export const metadata = { title: 'Customer statement · SkyJet' };

export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; asOf?: string }>;
}) {
  const { context } = await authorise(Permission.SalesInvoiceCreate);
  const params = await searchParams;
  const customers = await listCustomersForSelect(context);
  const customerId = params.customerId ?? customers[0]?.id ?? '';
  const asOf = params.asOf ?? new Date().toISOString().slice(0, 10);

  const statement =
    customerId.length > 0 ? await getCustomerStatement(context, customerId, asOf) : null;

  const customer = customers.find((c) => c.id === customerId);

  return (
    <>
      <PageHeader
        title="Customer statement"
        description="Open invoices and recent activity as of a date."
        actions={
          customerId ? (
            <a
              href={documentPdfPath('customer-statement', customerId, { asOf })}
              className="button"
              target="_blank"
              rel="noreferrer"
            >
              Download PDF
            </a>
          ) : null
        }
      />

      <Card>
        <form className="form-grid" method="get">
          <Field label="Customer" htmlFor="customerId" required>
            <select id="customerId" name="customerId" defaultValue={customerId}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.legal_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="As of" htmlFor="asOf" required>
            <input id="asOf" name="asOf" type="date" defaultValue={asOf} />
          </Field>
          <div className="button-row" style={{ alignSelf: 'end' }}>
            <button type="submit" className="button button--primary">
              Show statement
            </button>
          </div>
        </form>
      </Card>

      {customers.length === 0 ? (
        <EmptyState
          title="No customers yet"
          action={
            <Link href="/sales/customers/new" className="button button--primary">
              Add customer
            </Link>
          }
        />
      ) : null}

      {statement && customer ? (
        <>
          <Card title={`Open invoices · ${customer.legal_name}`}>
            {statement.open_invoices.length === 0 ? (
              <p className="cell-muted">No open invoices as of {statement.as_of}.</p>
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Due</th>
                    <th className="numeric">Total</th>
                    <th className="numeric">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.open_invoices.map((inv) => (
                    <tr key={inv.invoice_id}>
                      <td>
                        <Link href={`/sales/invoices/${inv.invoice_id}`} className="cell-code">
                          {inv.invoice_no}
                        </Link>
                      </td>
                      <td>{inv.invoice_date}</td>
                      <td>{inv.due_date}</td>
                      <td className="numeric">
                        <Amount
                          value={String(inv.total)}
                          currency={inv.currency_code}
                          showCurrency
                        />
                      </td>
                      <td className="numeric">
                        <Amount
                          value={String(inv.outstanding)}
                          currency={inv.currency_code}
                          showCurrency
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Card>

          <Card title="Recent activity">
            {statement.recent_activity.length === 0 ? (
              <p className="cell-muted">No activity as of {statement.as_of}.</p>
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Number</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th className="numeric">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.recent_activity.map((row) => (
                    <tr key={`${row.type}-${row.id}`}>
                      <td>{row.type.replace('_', ' ')}</td>
                      <td className="cell-code">{row.doc_no ?? '—'}</td>
                      <td>{row.doc_date}</td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="numeric">
                        <Amount
                          value={String(row.amount)}
                          currency={customer.currency_code}
                          showCurrency
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}
