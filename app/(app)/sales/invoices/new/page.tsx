import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { getDocumentLayout } from '@/server/actions/document-layout';
import { listUnitsOfMeasure } from '@/server/modules/inventory/masters';
import {
  getEntityDocumentContext,
  listCustomersForSelect,
  listOnHandLots,
  listOnHandUnits,
  listPaymentTerms,
  listSellableItems,
  listTaxCodes,
  listWarehousesForSelect,
} from '@/server/modules/sales/documents';
import { withReadOnlyTransaction } from '@/server/db/transaction';
import { Alert } from '@/components/ui';
import { entityLogoSrc } from '@/lib/brand';
import { InvoiceForm } from './invoice-form';
import { InvoiceDialogRoot } from './invoice-dialog-root';

export const metadata = { title: 'New invoice · SkyJet' };

export default async function NewInvoicePage() {
  const { context, session, entity } = await authorise(Permission.SalesInvoiceCreate);
  const mayIssue = can(session, entity.entityId, Permission.SalesInvoiceIssue);
  const mayPay = can(session, entity.entityId, Permission.SalesPaymentCreate);
  const mayCreateCustomer = can(session, entity.entityId, Permission.MastersManageCustomers);
  const [
    customers,
    taxCodes,
    warehouses,
    items,
    stockUnits,
    stockLots,
    units,
    paymentTerms,
    currencies,
    entityCtx,
    layout,
  ] = await Promise.all([
    listCustomersForSelect(context),
    listTaxCodes(context),
    listWarehousesForSelect(context),
    listSellableItems(context),
    listOnHandUnits(context),
    listOnHandLots(context),
    listUnitsOfMeasure(context),
    listPaymentTerms(context),
    withReadOnlyTransaction(context, (tx) =>
      tx.query<{ code: string; name: string }>(
        `select code, name from app.currencies where is_active order by code`,
      ),
    ),
    getEntityDocumentContext(context),
    getDocumentLayout('INVOICE'),
  ]);

  if (customers.length === 0 && !mayCreateCustomer) {
    return (
      <InvoiceDialogRoot>
        <div
          className="invoice-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="invoice-dialog-title"
        >
          <header className="invoice-dialog__header">
            <h1 id="invoice-dialog-title">New invoice</h1>
            <Link href="/sales/invoices" className="invoice-dialog__close" aria-label="Close">
              ×
            </Link>
          </header>
          <div className="invoice-dialog__body">
            <Alert tone="warning" title="No customers yet">
              Add a customer before issuing an invoice.{' '}
              <Link href="/sales/customers/new">Create a customer</Link>
            </Alert>
          </div>
        </div>
      </InvoiceDialogRoot>
    );
  }

  const defaultTax = taxCodes.find((t) => t.code === 'VAT16')?.id ?? taxCodes[0]?.id ?? null;

  return (
    <InvoiceForm
      customers={customers.map((c) => ({
        id: c.id,
        label: `${c.code} — ${c.legal_name}`,
        code: c.code,
        currencyCode: c.currency_code,
        email: c.email,
        phone: c.phone,
        paymentTermsId: c.payment_terms_id,
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
      items={items.map((i) => ({
        id: i.id,
        label: `${i.part_number} — ${i.description}`,
        description: i.description,
        trackingMode: i.tracking_mode,
        isStocked: i.is_stocked,
        partNumber: i.part_number,
        salesPrice: i.sales_price,
        qtyOnHand: i.qty_on_hand,
        defaultTaxCodeId: i.default_tax_code_id,
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
      currencies={currencies}
      defaultTaxCodeId={defaultTax}
      baseCurrency={entity.baseCurrency}
      entity={{
        name: entityCtx.name,
        tradingName: entityCtx.trading_name,
        registrationNumber: entityCtx.registration_number,
        logoSrc: entityLogoSrc(entityCtx.has_logo, entityCtx.updated_at),
        email: entityCtx.email,
        phone: entityCtx.phone,
      }}
      initialLayout={layout}
      mayIssue={mayIssue}
      mayPay={mayPay}
      mayCreateCustomer={mayCreateCustomer}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
