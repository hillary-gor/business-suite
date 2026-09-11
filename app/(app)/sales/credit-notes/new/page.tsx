import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { listUnitsOfMeasure } from '@/server/modules/inventory/masters';
import {
  getEntityDocumentContext,
  listCustomersForSelect,
  listOpenInvoicesForCustomer,
  listSellableItems,
  listTaxCodes,
} from '@/server/modules/sales/documents';
import { Alert, Card, PageHeader } from '@/components/ui';
import { entityLogoSrc } from '@/lib/brand';
import { CreditNoteForm } from './credit-note-form';

export const metadata = { title: 'New credit note · SkyJet' };

export default async function NewCreditNotePage() {
  const { context, entity } = await authorise([
    Permission.SalesInvoiceCreate,
    Permission.SalesInvoiceIssue,
  ]);
  const [customers, taxCodes, items, units, entityCtx] = await Promise.all([
    listCustomersForSelect(context),
    listTaxCodes(context),
    listSellableItems(context),
    listUnitsOfMeasure(context),
    getEntityDocumentContext(context),
  ]);

  if (customers.length === 0) {
    return (
      <>
        <PageHeader title="New credit note" />
        <Alert tone="warning" title="No customers yet">
          <Link href="/sales/customers/new">Add a customer</Link> first.
        </Alert>
      </>
    );
  }

  const defaultTax = taxCodes.find((t) => t.code === 'VAT16')?.id ?? taxCodes[0]?.id ?? null;

  async function loadOpenInvoices(customerId: string) {
    'use server';
    const { context: ctx } = await authorise(Permission.SalesInvoiceCreate);
    const rows = await listOpenInvoicesForCustomer(ctx, customerId);
    return rows.map((row) => ({
      id: row.id,
      invoiceNo: row.invoice_no,
      outstanding: row.outstanding,
      currencyCode: row.currency_code,
    }));
  }

  return (
    <>
      <PageHeader
        title="New credit note"
        description="Posts DR revenue / DR output tax / CR AR. Allocations reduce invoice outstanding."
      />
      <Card>
        <CreditNoteForm
          customers={customers.map((c) => ({
            id: c.id,
            label: `${c.code} — ${c.legal_name}`,
            currencyCode: c.currency_code,
          }))}
          taxCodes={taxCodes.map((t) => ({
            id: t.id,
            label: `${t.code} (${Number(t.rate) * 100}%)`,
            rate: t.rate,
          }))}
          items={items.map((i) => ({
            id: i.id,
            label: `${i.part_number} — ${i.description}`,
            description: i.description,
            partNumber: i.part_number,
          }))}
          units={units}
          defaultTaxCodeId={defaultTax}
          baseCurrency={entity.baseCurrency}
          loadOpenInvoices={loadOpenInvoices}
          entity={{
            name: entityCtx.name,
            tradingName: entityCtx.trading_name,
            registrationNumber: entityCtx.registration_number,
            logoSrc: entityLogoSrc(entityCtx.has_logo, entityCtx.updated_at),
          }}
        />
      </Card>
    </>
  );
}
