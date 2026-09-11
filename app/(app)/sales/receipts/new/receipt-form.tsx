'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveSalesReceiptAction } from '@/server/actions/sales';
import { Money, formatMoney } from '@/lib/money';
import type { DocumentLayout } from '@/lib/document-layout';
import { mergeLayout } from '@/lib/document-layout';
import { Alert, Field } from '@/components/ui';
import { DocumentCustomizePanel } from '@/components/documents/customize-panel';
import { DocumentBrand, DocumentPoweredBy } from '@/components/documents/document-brand';
import { ItemPicker } from '@/components/documents/item-picker';
import { DotsLoader } from '@/components/loading/dots-loader';
import {
  DocumentEmailPanel,
  DocumentToolbar,
  type DocumentMode,
} from '@/components/documents/document-toolbar';
import {
  DocumentPdfPreview,
  PrintDocumentButton,
} from '@/components/documents/document-pdf-preview';
import { composerDraft, composerMoneyLines } from '@/lib/documents/composer-draft';
import { QuickAddProductButton, type QuickProduct } from '@/components/documents/quick-add-product';

interface LineState {
  key: string;
  itemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxCodeId: string;
  stockUnitId: string;
  stockLotId: string;
  serviceDate: string;
}

const emptyLine = (): LineState => ({
  key: crypto.randomUUID(),
  itemId: '',
  description: '',
  quantity: '1',
  unitPrice: '',
  taxCodeId: '',
  stockUnitId: '',
  stockLotId: '',
  serviceDate: '',
});

export function SalesReceiptForm({
  customers,
  taxCodes,
  warehouses,
  banks,
  items: initialItems,
  stockUnits,
  stockLots,
  units,
  paymentTerms,
  defaultTaxCodeId,
  baseCurrency,
  entity,
  initialLayout,
}: {
  customers: ReadonlyArray<{
    id: string;
    label: string;
    currencyCode: string;
    email: string | null;
    phone: string | null;
  }>;
  taxCodes: ReadonlyArray<{ id: string; label: string; rate: string }>;
  warehouses: ReadonlyArray<{ id: string; label: string }>;
  banks: ReadonlyArray<{ id: string; label: string }>;
  items: ReadonlyArray<{
    id: string;
    label: string;
    description: string;
    trackingMode: string;
    isStocked: boolean;
    partNumber?: string;
  }>;
  stockUnits: ReadonlyArray<{ id: string; itemId: string; label: string; warehouseId: string }>;
  stockLots: ReadonlyArray<{
    id: string;
    itemId: string;
    label: string;
    warehouseId: string | null;
  }>;
  units: ReadonlyArray<{ code: string; name: string }>;
  paymentTerms: ReadonlyArray<{ id: string; label: string }>;
  defaultTaxCodeId: string | null;
  baseCurrency: string;
  entity: {
    name: string;
    tradingName: string | null;
    registrationNumber: string | null;
    logoSrc: string;
  };
  initialLayout: DocumentLayout;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<DocumentMode>('edit');
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [layout, setLayout] = useState(mergeLayout(initialLayout));
  const [items, setItems] = useState(initialItems);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [bankAccountId, setBankAccountId] = useState(banks[0]?.id ?? '');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentTermsId, setPaymentTermsId] = useState(paymentTerms[0]?.id ?? '');
  const [billEmail, setBillEmail] = useState(customers[0]?.email ?? '');
  const [shipToName, setShipToName] = useState('');
  const [shipToAddress, setShipToAddress] = useState('');
  const [customerPo, setCustomerPo] = useState('');
  const [notes, setNotes] = useState('');
  const [emailTo, setEmailTo] = useState(customers[0]?.email ?? '');
  const [emailSubject, setEmailSubject] = useState('Sales receipt');
  const [lines, setLines] = useState<LineState[]>([
    { ...emptyLine(), taxCodeId: defaultTaxCodeId ?? '' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const customer = customers.find((c) => c.id === customerId);
  const currency = customer?.currencyCode ?? baseCurrency;

  const totals = useMemo(() => {
    let subtotal = Money.zero();
    let tax = Money.zero();
    for (const line of lines) {
      const net = Money.from(line.quantity || '0').times(line.unitPrice || '0');
      const rate = taxCodes.find((t) => t.id === line.taxCodeId)?.rate ?? '0';
      subtotal = subtotal.plus(net);
      tax = tax.plus(net.times(rate));
    }
    return { subtotal, tax, total: subtotal.plus(tax) };
  }, [lines, taxCodes]);

  const pdfDraft = useMemo(
    () =>
      composerDraft({
        kind: 'sales-receipt',
        issueDate: receiptDate,
        party: {
          name: customer?.label ?? 'Customer',
          email: billEmail || customer?.email || null,
        },
        shipTo:
          shipToName || shipToAddress
            ? { name: shipToName || 'Ship to', address: shipToAddress || null }
            : null,
        meta: customerPo ? [{ label: 'Customer PO', value: customerPo }] : [],
        notes: notes || null,
        currency,
        ...composerMoneyLines({ lines, items, taxCodes }),
      }),
    [
      billEmail,
      currency,
      customer,
      customerPo,
      items,
      lines,
      notes,
      receiptDate,
      shipToAddress,
      shipToName,
      taxCodes,
    ],
  );

  function onCustomerChange(id: string) {
    setCustomerId(id);
    const next = customers.find((c) => c.id === id);
    setBillEmail(next?.email ?? '');
    setEmailTo(next?.email ?? '');
  }

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function onItemChange(key: string, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    updateLine(key, {
      itemId,
      description: item?.description ?? '',
      ...(item?.trackingMode === 'SERIAL' ? { quantity: '1' } : {}),
      stockUnitId: '',
      stockLotId: '',
    });
  }

  function onProductCreated(product: QuickProduct) {
    setItems((current) => [
      ...current,
      {
        id: product.id,
        label: product.label,
        description: product.description,
        trackingMode: product.trackingMode,
        isStocked: product.isStocked,
        partNumber: product.partNumber,
      },
    ]);
  }

  function submit(post: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await saveSalesReceiptAction({
        customerId,
        bankAccountId,
        warehouseId: warehouseId || undefined,
        receiptDate,
        paymentTermsId: paymentTermsId || undefined,
        billEmail: billEmail || undefined,
        shipToName: shipToName || undefined,
        shipToAddress: shipToAddress || undefined,
        customerPo: customerPo || undefined,
        notes: notes || undefined,
        currencyCode: currency,
        post,
        idempotencyKey: post ? idempotencyKey : undefined,
        lines: lines.map((line) => ({
          itemId: line.itemId || undefined,
          description: line.description,
          serviceDate: line.serviceDate || undefined,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxCodeId: line.taxCodeId || undefined,
          stockUnitId: line.stockUnitId || undefined,
          stockLotId: line.stockLotId || undefined,
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/sales/receipts');
      router.refresh();
    });
  }

  const brand = entity.tradingName || entity.name;
  const cols = layout.columns;

  const documentBody = (
    <div className="doc-sheet stack">
      {layout.show_logo ? (
        <DocumentBrand
          name={brand}
          registrationNumber={entity.registrationNumber}
          showRegistration={layout.show_company_registration}
          logoSrc={entity.logoSrc}
        />
      ) : null}

      <div className="doc-sheet__grid">
        <div className="stack">
          <Field label="Customer" htmlFor="customer" required>
            <select
              id="customer"
              value={customerId}
              onChange={(e) => onCustomerChange(e.target.value)}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          {layout.show_customer_email ? (
            <Field label="Customer email" htmlFor="billEmail">
              <input
                id="billEmail"
                type="email"
                value={billEmail}
                onChange={(e) => setBillEmail(e.target.value)}
              />
            </Field>
          ) : null}
          {layout.show_customer_contact && customer?.phone ? (
            <div className="cell-muted">Phone {customer.phone}</div>
          ) : null}
          {layout.show_ship_to ? (
            <>
              <Field label="Ship to" htmlFor="shipToName">
                <input
                  id="shipToName"
                  value={shipToName}
                  onChange={(e) => setShipToName(e.target.value)}
                  placeholder="Name"
                />
              </Field>
              <Field label="Ship-to address" htmlFor="shipToAddress">
                <textarea
                  id="shipToAddress"
                  rows={2}
                  value={shipToAddress}
                  onChange={(e) => setShipToAddress(e.target.value)}
                />
              </Field>
            </>
          ) : null}
        </div>
        <div className="stack">
          {layout.show_document_no ? (
            <Field label="Receipt no." htmlFor="receiptNo">
              <input id="receiptNo" value="(assigned on post)" disabled />
            </Field>
          ) : null}
          {layout.show_document_date ? (
            <Field label="Receipt date" htmlFor="receiptDate" required>
              <input
                id="receiptDate"
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </Field>
          ) : null}
          {layout.show_terms ? (
            <Field label="Terms" htmlFor="terms">
              <select
                id="terms"
                value={paymentTermsId}
                onChange={(e) => setPaymentTermsId(e.target.value)}
              >
                <option value="">None</option>
                {paymentTerms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Deposit to" htmlFor="bank" required>
            <select
              id="bank"
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
            >
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Warehouse" htmlFor="warehouse">
            <select
              id="warehouse"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">None</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Customer PO" htmlFor="customerPo">
            <input
              id="customerPo"
              value={customerPo}
              onChange={(e) => setCustomerPo(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {layout.show_table ? (
        <>
          <div className="button-row" style={{ justifyContent: 'space-between' }}>
            <span className="cell-muted">Line items</span>
            <QuickAddProductButton units={units} onCreated={onProductCreated} />
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  {cols.line_no.visible ? <th>{cols.line_no.label}</th> : null}
                  {cols.service_date.visible ? <th>{cols.service_date.label}</th> : null}
                  {cols.product.visible ? <th>{cols.product.label}</th> : null}
                  {cols.sku.visible ? <th>{cols.sku.label}</th> : null}
                  {cols.description.visible ? <th>{cols.description.label}</th> : null}
                  {cols.qty.visible ? <th className="numeric">{cols.qty.label}</th> : null}
                  {cols.rate.visible ? <th className="numeric">{cols.rate.label}</th> : null}
                  {cols.amount.visible ? <th className="numeric">{cols.amount.label}</th> : null}
                  <th>Tax</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const item = items.find((i) => i.id === line.itemId);
                  const amount = Money.from(line.quantity || '0').times(line.unitPrice || '0');
                  const unitsForItem = stockUnits.filter(
                    (u) =>
                      u.itemId === line.itemId && (!warehouseId || u.warehouseId === warehouseId),
                  );
                  const lotsForItem = stockLots.filter(
                    (l) =>
                      l.itemId === line.itemId &&
                      (!warehouseId || !l.warehouseId || l.warehouseId === warehouseId),
                  );
                  return (
                    <tr key={line.key}>
                      {cols.line_no.visible ? <td>{index + 1}</td> : null}
                      {cols.service_date.visible ? (
                        <td>
                          <input
                            type="date"
                            value={line.serviceDate}
                            onChange={(e) => updateLine(line.key, { serviceDate: e.target.value })}
                          />
                        </td>
                      ) : null}
                      {cols.product.visible ? (
                        <td>
                          <ItemPicker
                            items={items}
                            value={line.itemId}
                            onChange={(itemId) => onItemChange(line.key, itemId)}
                          />
                          {item?.trackingMode === 'SERIAL' ? (
                            <select
                              value={line.stockUnitId}
                              onChange={(e) =>
                                updateLine(line.key, { stockUnitId: e.target.value })
                              }
                            >
                              <option value="">Serial</option>
                              {unitsForItem.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.label}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          {item?.trackingMode === 'LOT' ? (
                            <select
                              value={line.stockLotId}
                              onChange={(e) => updateLine(line.key, { stockLotId: e.target.value })}
                            >
                              <option value="">Lot</option>
                              {lotsForItem.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.label}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </td>
                      ) : null}
                      {cols.sku.visible ? (
                        <td className="cell-code">{item?.partNumber ?? '—'}</td>
                      ) : null}
                      {cols.description.visible ? (
                        <td>
                          <input
                            value={line.description}
                            onChange={(e) => updateLine(line.key, { description: e.target.value })}
                          />
                        </td>
                      ) : null}
                      {cols.qty.visible ? (
                        <td className="numeric">
                          <input
                            value={line.quantity ?? ''}
                            onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                            disabled={item?.trackingMode === 'SERIAL'}
                          />
                        </td>
                      ) : null}
                      {cols.rate.visible ? (
                        <td className="numeric">
                          <input
                            value={line.unitPrice}
                            onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                          />
                        </td>
                      ) : null}
                      {cols.amount.visible ? (
                        <td className="numeric">{formatMoney(amount, { currency })}</td>
                      ) : null}
                      <td>
                        <select
                          value={line.taxCodeId}
                          onChange={(e) => updateLine(line.key, { taxCodeId: e.target.value })}
                        >
                          <option value="">No tax</option>
                          {taxCodes.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button button--ghost button--small"
                          onClick={() =>
                            setLines((current) => current.filter((l) => l.key !== line.key))
                          }
                          disabled={lines.length === 1}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="button-row">
            <button
              type="button"
              className="button button--ghost"
              onClick={() =>
                setLines((current) => [
                  ...current,
                  { ...emptyLine(), taxCodeId: defaultTaxCodeId ?? '' },
                ])
              }
            >
              Add line
            </button>
          </div>
        </>
      ) : null}

      <Field label="Notes" htmlFor="notes">
        <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="invoice-totals">
        <div>
          <span>Subtotal</span>
          <strong>{formatMoney(totals.subtotal, { currency, showCurrency: true })}</strong>
        </div>
        <div>
          <span>Tax</span>
          <strong>{formatMoney(totals.tax, { currency, showCurrency: true })}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{formatMoney(totals.total, { currency, showCurrency: true })}</strong>
        </div>
      </div>
      <DocumentPoweredBy />
    </div>
  );

  return (
    <div className="stack">
      <DocumentToolbar
        mode={mode}
        onModeChange={setMode}
        onCustomize={() => setCustomizeOpen(true)}
        title="Sales receipt"
      />
      <DocumentCustomizePanel
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        documentType="SALES_RECEIPT"
        initial={layout}
        onChange={setLayout}
      />

      {error ? <Alert title="Could not save">{error}</Alert> : null}

      {mode === 'email' ? (
        <DocumentEmailPanel
          to={emailTo}
          onToChange={setEmailTo}
          subject={emailSubject}
          onSubjectChange={setEmailSubject}
          body={`Please find your sales receipt for ${formatMoney(totals.total, { currency, showCurrency: true })}.`}
        />
      ) : null}

      {mode === 'pdf' ? <DocumentPdfPreview kind="sales-receipt" draft={pdfDraft} /> : null}
      {mode === 'edit' ? documentBody : null}

      {mode === 'edit' ? (
        <div className="button-row">
          <PrintDocumentButton kind="sales-receipt" draft={pdfDraft} />
          <button type="button" className="button" disabled={pending} onClick={() => submit(false)}>
            {pending ? <DotsLoader label="Saving" /> : 'Save draft'}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={pending}
            onClick={() => submit(true)}
          >
            {pending ? <DotsLoader label="Posting" tone="inverse" /> : 'Post sales receipt'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
