import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { getInvoice } from '@/server/modules/sales/documents';
import { documentPdfPath } from '@/lib/documents/href';
import { Amount, Card, DataTable, PageHeader, StatusBadge } from '@/components/ui';
import { VoidInvoiceForm } from './void-form';

export const metadata = { title: 'Invoice · SkyJet' };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const { context, session, entity } = await authorise(Permission.SalesInvoiceCreate);
  const result = await getInvoice(context, invoiceId);
  if (!result) notFound();

  const { invoice, lines } = result;
  const mayVoid =
    can(session, entity.entityId, Permission.SalesInvoiceVoid) && invoice.status === 'ISSUED';

  return (
    <>
      <PageHeader
        title={invoice.invoice_no ?? 'Draft invoice'}
        description={`${invoice.customer_name} · ${invoice.invoice_date}`}
        actions={
          <>
            <a
              href={documentPdfPath('invoice', invoice.id)}
              className="button button--ghost"
              target="_blank"
              rel="noreferrer"
            >
              Download PDF
            </a>
            <a
              href={documentPdfPath('packing-list', invoice.id)}
              className="button button--ghost"
              target="_blank"
              rel="noreferrer"
            >
              Packing list
            </a>
            <a
              href={documentPdfPath('proof-of-delivery', invoice.id)}
              className="button button--ghost"
              target="_blank"
              rel="noreferrer"
            >
              Proof of delivery
            </a>
            {invoice.journal_entry_id ? (
              <Link
                href={`/accounting/journals/${invoice.journal_entry_id}`}
                className="button button--ghost"
              >
                View journal
              </Link>
            ) : null}
          </>
        }
      />

      <div className="statistic-row">
        <div className="statistic">
          <span className="statistic__label">Status</span>
          <span className="statistic__value">
            <StatusBadge status={invoice.status} />
          </span>
        </div>
        <div className="statistic">
          <span className="statistic__label">Total</span>
          <span className="statistic__value">
            <Amount value={invoice.total} currency={invoice.currency_code} showCurrency />
          </span>
        </div>
        <div className="statistic">
          <span className="statistic__label">Outstanding</span>
          <span className="statistic__value">
            <Amount value={invoice.outstanding} currency={invoice.currency_code} showCurrency />
          </span>
        </div>
      </div>

      <Card title="Lines">
        <DataTable>
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th className="numeric">Qty</th>
              <th className="numeric">Unit price</th>
              <th className="numeric">Net</th>
              <th className="numeric">Tax</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.line_no}>
                <td>{line.line_no}</td>
                <td>{line.description}</td>
                <td className="numeric">
                  <Amount value={line.quantity} />
                </td>
                <td className="numeric">
                  <Amount value={line.unit_price} currency={invoice.currency_code} />
                </td>
                <td className="numeric">
                  <Amount value={line.line_net} currency={invoice.currency_code} />
                </td>
                <td className="numeric">
                  <Amount value={line.tax_amount} currency={invoice.currency_code} />
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>

      {mayVoid ? (
        <Card title="Void">
          <VoidInvoiceForm invoiceId={invoice.id} />
        </Card>
      ) : null}
    </>
  );
}
