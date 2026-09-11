import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listUnitsOfMeasure } from '@/server/modules/inventory/masters';
import {
  getEntityDocumentContext,
  getQuotation,
  listCustomersForSelect,
  listSellableItems,
  listTaxCodes,
} from '@/server/modules/sales/documents';
import { Alert, Card, PageHeader } from '@/components/ui';
import { entityLogoSrc } from '@/lib/brand';
import { EstimateForm } from './estimate-form';

export const metadata = { title: 'New estimate · SkyJet' };

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<{ quotationId?: string }>;
}) {
  const { context, session, entity } = await authorise(Permission.SalesInvoiceCreate);
  const { quotationId } = await searchParams;
  const [customers, taxCodes, items, units, entityCtx, existing] = await Promise.all([
    listCustomersForSelect(context),
    listTaxCodes(context),
    listSellableItems(context),
    listUnitsOfMeasure(context),
    getEntityDocumentContext(context),
    quotationId ? getQuotation(context, quotationId) : Promise.resolve(null),
  ]);

  if (customers.length === 0) {
    return (
      <>
        <PageHeader title="New estimate" />
        <Alert tone="warning" title="No customers yet">
          <Link href="/sales/customers/new">Add a customer</Link> first.
        </Alert>
      </>
    );
  }

  if (quotationId && !existing) {
    return (
      <>
        <PageHeader title="Estimate" />
        <Alert tone="warning" title="Estimate not found">
          That estimate is not in this company, or it has been removed.{' '}
          <Link href="/sales/estimates">Back to estimates</Link>
        </Alert>
      </>
    );
  }

  const defaultTax = taxCodes.find((t) => t.code === 'VAT16')?.id ?? taxCodes[0]?.id ?? null;

  return (
    <>
      <PageHeader
        title={existing ? 'Edit estimate' : 'New estimate'}
        description="Commercial quote only. Convert to a draft invoice when the customer accepts."
      />
      <Card>
        <EstimateForm
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
          canSend={can(session, entity.entityId, Permission.SalesInvoiceIssue)}
          entity={{
            name: entityCtx.name,
            tradingName: entityCtx.trading_name,
            registrationNumber: entityCtx.registration_number,
            logoSrc: entityLogoSrc(entityCtx.has_logo, entityCtx.updated_at),
          }}
          existing={
            existing
              ? {
                  id: existing.id,
                  customerId: existing.customer_id,
                  quotationDate: existing.quotation_date,
                  notes: existing.notes,
                  lines: existing.lines.map((line) => ({
                    itemId: line.item_id,
                    description: line.description,
                    quantity: line.quantity,
                    unitPrice: line.unit_price,
                    taxCodeId: line.tax_code_id,
                  })),
                }
              : undefined
          }
        />
      </Card>
    </>
  );
}
