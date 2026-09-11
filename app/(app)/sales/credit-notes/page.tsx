import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listCreditNotes } from '@/server/modules/sales/documents';
import { documentPdfPath } from '@/lib/documents/href';
import { Amount, Card, DataTable, EmptyState, PageHeader, StatusBadge } from '@/components/ui';

export const metadata = { title: 'Credit notes · SkyJet' };

export default async function CreditNotesPage() {
  const { context, session, entity } = await authorise(Permission.SalesInvoiceCreate);
  const rows = await listCreditNotes(context);
  const mayCreate = can(session, entity.entityId, Permission.SalesInvoiceCreate);

  return (
    <>
      <PageHeader
        title="Credit notes"
        description="Reverses AR, revenue and output tax. Optionally restocks via CUSTOMER_RETURN."
        actions={
          mayCreate ? (
            <Link href="/sales/credit-notes/new" className="button button--primary">
              New credit note
            </Link>
          ) : null
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="No credit notes yet"
            action={
              mayCreate ? (
                <Link href="/sales/credit-notes/new" className="button button--primary">
                  New credit note
                </Link>
              ) : null
            }
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Number</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Status</th>
                <th className="numeric">Total</th>
                <th>Print</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((cn) => (
                <tr key={cn.id}>
                  <td className="cell-code">{cn.credit_no ?? 'Draft'}</td>
                  <td>{cn.credit_date}</td>
                  <td>{cn.customer_name}</td>
                  <td>
                    <StatusBadge status={cn.status} />
                  </td>
                  <td className="numeric">
                    <Amount value={cn.total} currency={cn.currency_code} showCurrency />
                  </td>
                  <td>
                    <a
                      href={documentPdfPath('credit-note', cn.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Print
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
