import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import {
  listBankAccounts,
  listCustomersForSelect,
  listOpenInvoicesForCustomer,
} from '@/server/modules/sales/documents';
import { Alert } from '@/components/ui';
import Link from 'next/link';
import { ReceiptForm } from './receipt-form';
import { InvoiceDialogRoot } from '@/app/(app)/sales/invoices/new/invoice-dialog-root';

export const metadata = { title: 'Receive payment · SkyJet' };

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const { context } = await authorise(Permission.SalesPaymentCreate);
  const { customerId } = await searchParams;
  const [customers, banks] = await Promise.all([
    listCustomersForSelect(context),
    listBankAccounts(context),
  ]);

  if (customers.length === 0 || banks.length === 0) {
    return (
      <InvoiceDialogRoot>
        <div className="invoice-dialog" role="dialog" aria-modal="true" aria-labelledby="pay-title">
          <header className="invoice-dialog__header">
            <h1 id="pay-title">Receive Payment</h1>
            <Link href="/sales/invoices" className="invoice-dialog__close" aria-label="Close">
              ×
            </Link>
          </header>
          <div className="invoice-dialog__body">
            {customers.length === 0 ? (
              <Alert tone="warning" title="No customers yet">
                <Link href="/sales/customers/new">Add a customer</Link> before recording a receipt.
              </Alert>
            ) : (
              <Alert tone="warning" title="No cash or bank account">
                The chart of accounts needs a postable cash or bank account before receipts can be
                deposited.
              </Alert>
            )}
          </div>
        </div>
      </InvoiceDialogRoot>
    );
  }

  async function loadOpenInvoices(id: string) {
    'use server';
    const { context: ctx } = await authorise(Permission.SalesPaymentCreate);
    const rows = await listOpenInvoicesForCustomer(ctx, id);
    return rows.map((row) => ({
      id: row.id,
      invoiceNo: row.invoice_no,
      invoiceDate: row.invoice_date,
      dueDate: row.due_date,
      total: row.total,
      outstanding: row.outstanding,
      currencyCode: row.currency_code,
    }));
  }

  return (
    <ReceiptForm
      customers={customers.map((c) => ({
        id: c.id,
        label: `${c.code} — ${c.legal_name}`,
        currencyCode: c.currency_code,
        email: c.email,
      }))}
      banks={banks.map((b) => ({
        id: b.id,
        label: `${b.code} — ${b.name}`,
      }))}
      loadOpenInvoices={loadOpenInvoices}
      initialCustomerId={customerId}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
