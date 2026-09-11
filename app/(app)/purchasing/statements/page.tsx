import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import {
  getSupplierStatement,
  listSuppliersForSelect,
} from '@/server/modules/purchasing/documents';
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

export const metadata = { title: 'Supplier statement · SkyJet' };

export default async function SupplierStatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string; asOf?: string }>;
}) {
  const { context } = await authorise(Permission.FinancePaymentCreate);
  const params = await searchParams;
  const suppliers = await listSuppliersForSelect(context);
  const supplierId = params.supplierId ?? suppliers[0]?.id ?? '';
  const asOf = params.asOf ?? new Date().toISOString().slice(0, 10);

  const statement =
    supplierId.length > 0 ? await getSupplierStatement(context, supplierId, asOf) : null;

  const supplier = suppliers.find((row) => row.id === supplierId);

  return (
    <>
      <PageHeader
        title="Supplier statement"
        description="Open bills and recent activity as of a date."
        actions={
          supplierId ? (
            <a
              href={documentPdfPath('supplier-statement', supplierId, { asOf })}
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
          <Field label="Supplier" htmlFor="supplierId" required>
            <select id="supplierId" name="supplierId" defaultValue={supplierId}>
              {suppliers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.legal_name}
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

      {suppliers.length === 0 ? (
        <EmptyState
          title="No suppliers yet"
          action={
            <Link href="/purchasing/vendors/new" className="button button--primary">
              Add supplier
            </Link>
          }
        />
      ) : null}

      {statement && supplier ? (
        <>
          <Card title={`Open bills · ${supplier.legal_name}`}>
            {statement.open_bills.length === 0 ? (
              <p className="cell-muted">No open bills as of {statement.as_of}.</p>
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Date</th>
                    <th>Due</th>
                    <th className="numeric">Total</th>
                    <th className="numeric">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.open_bills.map((bill) => (
                    <tr key={bill.bill_id}>
                      <td className="cell-code">{bill.bill_no}</td>
                      <td>{bill.bill_date}</td>
                      <td>{bill.due_date}</td>
                      <td className="numeric">
                        <Amount
                          value={String(bill.total)}
                          currency={bill.currency_code}
                          showCurrency
                        />
                      </td>
                      <td className="numeric">
                        <Amount
                          value={String(bill.outstanding)}
                          currency={bill.currency_code}
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
                          currency={supplier.currency_code}
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
