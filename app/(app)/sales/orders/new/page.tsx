import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listUnitsOfMeasure } from '@/server/modules/inventory/masters';
import {
  getEntityDocumentContext,
  listCustomersForSelect,
  listSellableItems,
  listTaxCodes,
} from '@/server/modules/sales/documents';
import { Alert, Card, PageHeader } from '@/components/ui';
import { entityLogoSrc } from '@/lib/brand';
import { SalesOrderForm } from './order-form';

export const metadata = { title: 'New sales order · SkyJet' };

export default async function NewSalesOrderPage() {
  const { context, session, entity } = await authorise(Permission.SalesInvoiceCreate);
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
        <PageHeader title="New sales order" />
        <Alert tone="warning" title="No customers yet">
          <Link href="/sales/customers/new">Add a customer</Link> first.
        </Alert>
      </>
    );
  }

  const defaultTax = taxCodes.find((t) => t.code === 'VAT16')?.id ?? taxCodes[0]?.id ?? null;

  return (
    <>
      <PageHeader
        title="New sales order"
        description="Commercial order only. Convert to invoice when ready to bill."
      />
      <Card>
        <SalesOrderForm
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
          canConfirm={can(session, entity.entityId, Permission.SalesInvoiceIssue)}
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
