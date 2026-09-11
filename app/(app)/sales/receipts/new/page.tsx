import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { getDocumentLayout } from '@/server/actions/document-layout';
import { listUnitsOfMeasure } from '@/server/modules/inventory/masters';
import {
  getEntityDocumentContext,
  listBankAccounts,
  listCustomersForSelect,
  listOnHandLots,
  listOnHandUnits,
  listPaymentTerms,
  listSellableItems,
  listTaxCodes,
  listWarehousesForSelect,
} from '@/server/modules/sales/documents';
import { Alert, Card, PageHeader } from '@/components/ui';
import { entityLogoSrc } from '@/lib/brand';
import { SalesReceiptForm } from './receipt-form';

export const metadata = { title: 'New sales receipt · SkyJet' };

export default async function NewSalesReceiptPage() {
  const { context, entity } = await authorise(Permission.SalesInvoiceCreate);
  const [
    customers,
    taxCodes,
    warehouses,
    banks,
    items,
    stockUnits,
    stockLots,
    units,
    paymentTerms,
    entityCtx,
    layout,
  ] = await Promise.all([
    listCustomersForSelect(context),
    listTaxCodes(context),
    listWarehousesForSelect(context),
    listBankAccounts(context),
    listSellableItems(context),
    listOnHandUnits(context),
    listOnHandLots(context),
    listUnitsOfMeasure(context),
    listPaymentTerms(context),
    getEntityDocumentContext(context),
    getDocumentLayout('SALES_RECEIPT'),
  ]);

  if (customers.length === 0) {
    return (
      <>
        <PageHeader title="New sales receipt" />
        <Alert tone="warning" title="No customers yet">
          <Link href="/sales/customers/new">Add a customer</Link> first.
        </Alert>
      </>
    );
  }

  if (banks.length === 0) {
    return (
      <>
        <PageHeader title="New sales receipt" />
        <Alert tone="warning" title="No cash or bank account">
          Add a postable cash or bank account before posting a sales receipt.
        </Alert>
      </>
    );
  }

  const defaultTax =
    taxCodes.find((t) => t.code === 'VAT16')?.id ?? taxCodes[0]?.id ?? null;

  return (
    <>
      <PageHeader
        title="New sales receipt"
        description="Immediate sale: deposit to bank, credit revenue and tax. Stocked lines post ISSUE and COGS."
      />
      <Card>
        <SalesReceiptForm
          customers={customers.map((c) => ({
            id: c.id,
            label: `${c.code} — ${c.legal_name}`,
            currencyCode: c.currency_code,
            email: c.email,
            phone: c.phone,
          }))}
          taxCodes={taxCodes.map((t) => ({
            id: t.id,
            label: `${t.code} (${Number(t.rate) * 100}%)`,
            rate: t.rate,
          }))}
          warehouses={warehouses.map((w) => ({
            id: w.id,
            label: `${w.code} — ${w.name}`,
          }))}
          banks={banks.map((b) => ({
            id: b.id,
            label: `${b.code} — ${b.name}`,
          }))}
          items={items.map((i) => ({
            id: i.id,
            label: `${i.part_number} — ${i.description}`,
            description: i.description,
            trackingMode: i.tracking_mode,
            isStocked: i.is_stocked,
            partNumber: i.part_number,
          }))}
          stockUnits={stockUnits.map((u) => ({
            id: u.id,
            itemId: u.item_id,
            label: `${u.serial_number} (${u.condition_code})`,
            warehouseId: u.warehouse_id,
          }))}
          stockLots={stockLots.map((l) => ({
            id: l.id,
            itemId: l.item_id,
            label: `${l.lot_number} · qty ${l.quantity_on_hand}`,
            warehouseId: l.warehouse_id,
          }))}
          units={units}
          paymentTerms={paymentTerms.map((t) => ({
            id: t.id,
            label: `${t.code} — ${t.name}`,
          }))}
          defaultTaxCodeId={defaultTax}
          baseCurrency={entity.baseCurrency}
          entity={{
            name: entityCtx.name,
            tradingName: entityCtx.trading_name,
            registrationNumber: entityCtx.registration_number,
            logoSrc: entityLogoSrc(entityCtx.has_logo, entityCtx.updated_at),
          }}
          initialLayout={layout}
        />
      </Card>
    </>
  );
}
