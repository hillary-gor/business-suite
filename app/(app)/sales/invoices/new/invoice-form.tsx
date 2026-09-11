'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveInvoiceAction } from '@/server/actions/sales';
import { Money, formatMoney } from '@/lib/money';
import type { DocumentLayout } from '@/lib/document-layout';
import { mergeLayout } from '@/lib/document-layout';
import { Alert, Field } from '@/components/ui';
import { CompanyLogo } from '@/components/brand/company-logo';
import { DocumentCustomizePanel } from '@/components/documents/customize-panel';
import { DocumentBrand, DocumentPoweredBy } from '@/components/documents/document-brand';
import { CustomerPicker } from '@/components/documents/customer-picker';
import { ItemPicker } from '@/components/documents/item-picker';
import { type DocumentMode } from '@/components/documents/document-toolbar';
import { DocumentPdfPreview, openDocumentPdf } from '@/components/documents/document-pdf-preview';
import { composerDraft, composerMoneyLines } from '@/lib/documents/composer-draft';
import type { DocumentKind } from '@/lib/documents/kinds';
import { MenuButton, PageFeedback, SplitMenu } from '@/components/lists/list-chrome';
import Link from 'next/link';
import { InvoiceEmailCard, type InvoicePrintModel } from '@/components/documents/invoice-print';
import {
  ISSUED_INVOICE_CANNOT_SAVE_MESSAGE,
  invoiceComposerPersistBlockedReason,
} from '@/lib/invoice-composer';
import { invoiceLineStockWarning, invoiceStockWarningText } from '@/lib/invoice-stock';
import { InvoiceDialogRoot } from './invoice-dialog-root';
import { QuickAddProductButton, type QuickProduct } from '@/components/documents/quick-add-product';
import {
  QuickAddCustomerPanel,
  type QuickCustomer,
} from '@/components/documents/quick-add-customer';

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

const emptyLine = (key?: string): LineState => ({
  key: key ?? crypto.randomUUID(),
  itemId: '',
  description: '',
  quantity: '1',
  unitPrice: '',
  taxCodeId: '',
  stockUnitId: '',
  stockLotId: '',
  serviceDate: '',
});

export function InvoiceForm({
  customers: initialCustomers,
  taxCodes,
  warehouses,
  items: initialItems,
  stockUnits,
  stockLots,
  units,
  paymentTerms,
  currencies,
  defaultTaxCodeId,
  baseCurrency,
  entity,
  initialLayout,
  mayIssue,
  mayPay,
  mayCreateCustomer,
  closeHref = '/sales/invoices',
  today,
}: {
  customers: ReadonlyArray<{
    id: string;
    label: string;
    code?: string;
    currencyCode: string;
    email: string | null;
    phone: string | null;
    paymentTermsId?: string | null;
  }>;
  taxCodes: ReadonlyArray<{ id: string; label: string; rate: string }>;
  warehouses: ReadonlyArray<{ id: string; label: string }>;
  items: ReadonlyArray<{
    id: string;
    label: string;
    description: string;
    trackingMode: string;
    isStocked: boolean;
    partNumber?: string;
    salesPrice?: string | null;
    qtyOnHand?: string;
    defaultTaxCodeId?: string | null;
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
  currencies: ReadonlyArray<{ code: string; name: string }>;
  defaultTaxCodeId: string | null;
  baseCurrency: string;
  entity: {
    name: string;
    tradingName: string | null;
    registrationNumber: string | null;
    logoSrc: string;
    email: string | null;
    phone: string | null;
  };
  initialLayout: DocumentLayout;
  mayIssue: boolean;
  mayPay: boolean;
  mayCreateCustomer: boolean;
  closeHref?: string;
  today: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<DocumentMode>('edit');
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [addCustomerName, setAddCustomerName] = useState('');
  const [layout, setLayout] = useState(mergeLayout(initialLayout));
  const [items, setItems] = useState(initialItems);
  const [customers, setCustomers] = useState(initialCustomers);
  const [customerId, setCustomerId] = useState(initialCustomers[0]?.id ?? '');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [paymentTermsId, setPaymentTermsId] = useState(paymentTerms[0]?.id ?? '');
  const [billEmail, setBillEmail] = useState(customers[0]?.email ?? '');
  const [shipToName, setShipToName] = useState('');
  const [shipToAddress, setShipToAddress] = useState('');
  const [customerPo, setCustomerPo] = useState('');
  const [notes, setNotes] = useState('Thank you for your business.');
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | null>(null);
  const [invoiceNo, setInvoiceNo] = useState<string | null>(null);
  const [issued, setIssued] = useState(false);
  const [followUp, setFollowUp] = useState(false);
  const [pendingAfter, setPendingAfter] = useState<'stay' | 'new' | 'close'>('stay');
  const [lines, setLines] = useState<LineState[]>([
    { ...emptyLine('line-1'), taxCodeId: defaultTaxCodeId ?? '' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useRef<string | null>(null);
  const savingRef = useRef(false);
  const issuedRef = useRef(false);

  const customer = customers.find((c) => c.id === customerId);
  const currency = customer?.currencyCode ?? baseCurrency;
  const brand = entity.tradingName || entity.name;

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

  const stockIssues = useMemo(() => {
    return lines.flatMap((line) => {
      const item = items.find((entry) => entry.id === line.itemId);
      if (!item) return [];
      const warning = invoiceLineStockWarning({
        isStocked: item.isStocked,
        qtyOnHand: item.qtyOnHand ?? '0',
        quantity: line.quantity,
      });
      if (!warning) return [];
      return [
        {
          key: line.key,
          warning,
          text: invoiceStockWarningText(warning, item.qtyOnHand ?? '0'),
        },
      ];
    });
  }, [items, lines]);

  const printModel: InvoicePrintModel = useMemo(() => {
    return {
      title: invoiceNo ? `Invoice ${invoiceNo}` : 'Invoice',
      brand,
      logoSrc: entity.logoSrc,
      email: entity.email,
      phone: entity.phone,
      registrationNumber: entity.registrationNumber,
      customerName: customer?.label ?? 'Customer',
      customerEmail: billEmail || customer?.email || null,
      billTo: shipToName || null,
      shipTo: [shipToName, shipToAddress].filter(Boolean).join('\n') || null,
      invoiceNo: invoiceNo ?? 'Draft',
      invoiceDate,
      dueDate,
      po: customerPo || null,
      notes,
      currency,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      lines: lines
        .filter((line) => line.description || line.itemId)
        .map((line) => {
          const item = items.find((entry) => entry.id === line.itemId);
          const amount = Money.from(line.quantity || '0').times(line.unitPrice || '0');
          return {
            description: line.description || item?.label || 'Line',
            quantity: line.quantity || '0',
            unitPrice: line.unitPrice || '0',
            amount: amount.toDatabase(),
            sku: item?.partNumber,
          };
        }),
    };
  }, [
    billEmail,
    brand,
    currency,
    customer,
    customerPo,
    dueDate,
    entity.email,
    entity.logoSrc,
    entity.phone,
    entity.registrationNumber,
    invoiceDate,
    invoiceNo,
    items,
    lines,
    notes,
    shipToAddress,
    shipToName,
    totals,
  ]);

  const pdfDraft = useMemo(() => {
    const computed = composerMoneyLines({ lines, items, taxCodes });
    return composerDraft({
      kind: 'invoice',
      number: invoiceNo,
      issueDate: invoiceDate,
      dueDate,
      party: {
        name: customer?.label ?? 'Customer',
        email: billEmail || customer?.email || null,
      },
      shipTo:
        shipToName || shipToAddress
          ? { name: shipToName || 'Ship to', address: shipToAddress || null }
          : null,
      meta: customerPo ? [{ label: 'Customer PO', value: customerPo }] : [],
      notes,
      currency,
      ...computed,
    });
  }, [
    billEmail,
    currency,
    customer,
    customerPo,
    dueDate,
    invoiceDate,
    invoiceNo,
    items,
    lines,
    notes,
    shipToAddress,
    shipToName,
    taxCodes,
  ]);

  function onCustomerChange(id: string) {
    setCustomerId(id);
    const next = customers.find((c) => c.id === id);
    setBillEmail(next?.email ?? '');
    if (next?.paymentTermsId) setPaymentTermsId(next.paymentTermsId);
  }

  function onCustomerCreated(customer: QuickCustomer) {
    setCustomers((current) => {
      if (current.some((entry) => entry.id === customer.id)) return current;
      return [
        ...current,
        {
          id: customer.id,
          label: customer.label,
          currencyCode: customer.currencyCode,
          email: customer.email,
          phone: customer.phone,
          paymentTermsId: customer.paymentTermsId,
        },
      ];
    });
    setCustomerId(customer.id);
    setBillEmail(customer.email ?? '');
    if (customer.paymentTermsId) setPaymentTermsId(customer.paymentTermsId);
  }

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function onItemChange(key: string, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    updateLine(key, {
      itemId,
      description: item?.description ?? '',
      unitPrice: item?.salesPrice || '',
      taxCodeId: item?.defaultTaxCodeId || defaultTaxCodeId || '',
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
        salesPrice: null,
        qtyOnHand: '0',
        defaultTaxCodeId: defaultTaxCodeId,
      },
    ]);
  }

  function resetForm() {
    setCustomerId(customers[0]?.id ?? '');
    setWarehouseId(warehouses[0]?.id ?? '');
    setInvoiceDate(today);
    setDueDate('');
    setPaymentTermsId(paymentTerms[0]?.id ?? '');
    setBillEmail(customers[0]?.email ?? '');
    setShipToName('');
    setShipToAddress('');
    setCustomerPo('');
    setNotes('Thank you for your business.');
    setLines([{ ...emptyLine('line-1'), taxCodeId: defaultTaxCodeId ?? '' }]);
    setSavedInvoiceId(null);
    setInvoiceNo(null);
    setIssued(false);
    issuedRef.current = false;
    savingRef.current = false;
    idempotencyKey.current = null;
    setError(null);
    setMode('edit');
  }

  function close() {
    router.push(closeHref);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || pending || addCustomerOpen || customizeOpen) return;
      router.push(closeHref);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, addCustomerOpen, customizeOpen, closeHref, router]);

  function printSheet(kind: 'invoice' | 'packing' | 'pod') {
    const documentKind: DocumentKind =
      kind === 'packing' ? 'packing-list' : kind === 'pod' ? 'proof-of-delivery' : 'invoice';
    void openDocumentPdf({
      kind: documentKind,
      savedId: savedInvoiceId,
      draft: { ...pdfDraft, kind: documentKind },
    });
  }

  function submit(issue: boolean, after: 'stay' | 'new' | 'close' | 'review') {
    const issuedBlock = invoiceComposerPersistBlockedReason(issued || issuedRef.current);
    if (issuedBlock) {
      setError(issuedBlock);
      return;
    }
    setError(null);
    if (!customerId) {
      setError('Select a customer.');
      return;
    }
    if (issue && stockIssues.length > 0) {
      setError(stockIssues[0]?.text ?? 'A stocked line is short of quantity on hand.');
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    startTransition(async () => {
      try {
        if (issue && !idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
        const result = await saveInvoiceAction({
          invoiceId: savedInvoiceId ?? undefined,
          customerId,
          warehouseId: warehouseId || undefined,
          invoiceDate,
          dueDate: dueDate || undefined,
          paymentTermsId: paymentTermsId || undefined,
          billEmail: billEmail || undefined,
          shipToName: shipToName || undefined,
          shipToAddress: shipToAddress || undefined,
          customerPo: customerPo || undefined,
          notes: notes || undefined,
          currencyCode: currency,
          issue,
          idempotencyKey: issue ? (idempotencyKey.current ?? undefined) : undefined,
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
        setSavedInvoiceId(result.data.invoiceId);
        setInvoiceNo(result.data.invoiceNo);
        if (issue) {
          issuedRef.current = true;
          setIssued(true);
        }
        if (after === 'review') setMode('email');
        setPendingAfter(after === 'review' ? 'stay' : after);
        setFollowUp(true);
        router.refresh();
      } finally {
        savingRef.current = false;
      }
    });
  }

  function finishFollowUp() {
    setFollowUp(false);
    if (pendingAfter === 'close') {
      router.push(closeHref);
      return;
    }
    if (pendingAfter === 'new') resetForm();
  }

  const cols = layout.columns;

  const documentBody = (
    <div className="doc-sheet stack">
      <div className="invoice-hero">
        <div>
          <p className="invoice-hero__kicker">Invoice</p>
          <h2 className="invoice-hero__company">{brand}</h2>
          {entity.email ? <p className="invoice-hero__meta">{entity.email}</p> : null}
          {entity.phone ? <p className="invoice-hero__meta">{entity.phone}</p> : null}
          <Link href="/settings/company" className="invoice-hero__edit">
            Edit company
          </Link>
        </div>
        {layout.show_logo ? (
          <Link
            href="/settings/additional"
            className="invoice-hero__logo"
            title="Change company logo"
          >
            <CompanyLogo src={entity.logoSrc} alt={brand} className="doc-sheet__logo-img" />
          </Link>
        ) : (
          <DocumentBrand
            name={brand}
            registrationNumber={entity.registrationNumber}
            showRegistration={layout.show_company_registration}
            logoSrc={entity.logoSrc}
          />
        )}
      </div>

      <div className="doc-sheet__grid">
        <div className="stack">
          <Field label="Customer" htmlFor="customer" required>
            <CustomerPicker
              id="customer"
              customers={customers}
              value={customerId}
              onChange={onCustomerChange}
              mayAdd={mayCreateCustomer}
              onAddNew={(typedName) => {
                setAddCustomerName(typedName);
                setAddCustomerOpen(true);
              }}
            />
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
          <p className="invoice-balance">
            <span>Balance due</span>
            <strong>{formatMoney(totals.total, { currency, showCurrency: true })}</strong>
          </p>
          {layout.show_document_no ? (
            <Field label="Invoice no." htmlFor="invoiceNo">
              <input id="invoiceNo" value={invoiceNo ?? '(assigned on issue)'} disabled />
            </Field>
          ) : null}
          {layout.show_document_date ? (
            <Field label="Invoice date" htmlFor="invoiceDate" required>
              <input
                id="invoiceDate"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </Field>
          ) : null}
          {layout.show_due_date ? (
            <Field label="Due date" htmlFor="dueDate">
              <input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
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
                              {lotsForItem.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.label}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          {stockIssues.find((issue) => issue.key === line.key) ? (
                            <p className="invoice-stock-warn">
                              {stockIssues.find((issue) => issue.key === line.key)?.text}
                            </p>
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
              Add product or service
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setLines([{ ...emptyLine(), taxCodeId: defaultTaxCodeId ?? '' }])}
            >
              Clear all lines
            </button>
          </div>
        </>
      ) : null}

      <div className="invoice-bottom">
        <div className="stack">
          <Field label="Note to customer" htmlFor="notes">
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <Field label="Memo on statement (hidden)" htmlFor="statementMemo">
            <textarea
              id="statementMemo"
              rows={2}
              disabled
              placeholder="This memo will not show up on your invoice, but will appear on the statement."
              title="Not in this version"
            />
          </Field>
          <div className="invoice-attach">
            <span className="invoice-attach__link" title="Not in this version">
              Add attachment
            </span>
            <span className="cell-muted">
              Max file size: 20 MB. Attachments are not in this version.
            </span>
          </div>
        </div>
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
            <span>Invoice total</span>
            <strong>{formatMoney(totals.total, { currency, showCurrency: true })}</strong>
          </div>
          <p className="cell-muted" title="Not in this version">
            Customer payment options and edit totals are not in this version.
          </p>
        </div>
      </div>
      <DocumentPoweredBy />
    </div>
  );

  const title = invoiceNo ? `Invoice ${invoiceNo}` : 'New invoice';
  const STUB = 'Not in this version';
  const PERM = 'You do not have permission';

  return (
    <InvoiceDialogRoot>
      <div
        className={`invoice-dialog${mode === 'edit' ? ' is-edit' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-dialog-title"
      >
        <header className="invoice-dialog__header">
          <div className="invoice-dialog__title-row">
            <h1 id="invoice-dialog-title">{title}</h1>
            <button
              type="button"
              className="invoice-dialog__close"
              aria-label="Close"
              onClick={close}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6 6 18"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <div className="invoice-dialog__toolbar">
            <div className="invoice-dialog__modes" role="tablist" aria-label="Document mode">
              {(
                [
                  ['edit', 'Edit'],
                  ['email', 'Email view'],
                  ['pdf', 'PDF view'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mode === id}
                  className={`invoice-dialog__tab${mode === id ? ' is-active' : ''}`}
                  onClick={() => setMode(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="invoice-dialog__header-actions">
              {issued && mayPay ? (
                <Link
                  className="button button--ghost button--small"
                  href={`/sales/payments/new?customerId=${customerId}`}
                >
                  Receive payment
                </Link>
              ) : (
                <button
                  type="button"
                  className="button button--ghost button--small"
                  disabled
                  title={issued ? PERM : 'Issue the invoice first'}
                >
                  Receive payment
                </button>
              )}
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() => setCustomizeOpen(true)}
                aria-label="Manage"
                title="Customise fields"
              >
                Manage
              </button>
              <PageFeedback />
            </div>
          </div>
        </header>

        <DocumentCustomizePanel
          open={customizeOpen}
          onClose={() => setCustomizeOpen(false)}
          documentType="INVOICE"
          initial={layout}
          onChange={setLayout}
        />
        <QuickAddCustomerPanel
          open={addCustomerOpen}
          initialName={addCustomerName}
          currencies={currencies}
          paymentTerms={paymentTerms}
          baseCurrency={baseCurrency}
          onClose={() => setAddCustomerOpen(false)}
          onCreated={onCustomerCreated}
        />

        <div className="invoice-dialog__body">
          {error ? <Alert title="Could not save">{error}</Alert> : null}
          {issued ? (
            <Alert tone="info" title="Issued">
              {ISSUED_INVOICE_CANNOT_SAVE_MESSAGE}
            </Alert>
          ) : null}
          {stockIssues.length > 0 && mode === 'edit' && !issued ? (
            <Alert tone="warning" title="Stock">
              One or more stocked items do not have enough quantity on hand. Save a draft if you
              need to, but issuing will fail until stock is available.
            </Alert>
          ) : null}

          {mode === 'email' ? (
            <InvoiceEmailCard
              model={printModel}
              message={notes}
              onViewDetails={() => {
                setMode('pdf');
              }}
            />
          ) : null}
          {mode === 'pdf' ? (
            <DocumentPdfPreview kind="invoice" savedId={savedInvoiceId} draft={pdfDraft} />
          ) : null}
          {mode === 'edit' ? documentBody : null}
        </div>

        <footer className="invoice-dialog__footer">
          <div className="invoice-dialog__footer-links">
            <button
              type="button"
              className="button button--ghost"
              onClick={() => printSheet('invoice')}
            >
              Print or download
            </button>
            <button type="button" className="button button--ghost" disabled title={STUB}>
              Make recurring
            </button>
            <MenuButton
              label="More actions"
              items={[
                { label: 'Make a copy', disabled: true, title: STUB },
                { label: 'Delete', disabled: true, title: STUB },
                { label: 'Void', disabled: true, title: STUB },
                { label: 'Transaction journal', disabled: true, title: STUB },
                { label: 'Audit history', disabled: true, title: STUB },
              ]}
            />
          </div>
          <div className="invoice-dialog__footer-save">
            <SplitMenu
              label={pending ? 'Saving' : 'Save'}
              onClick={() => submit(false, 'stay')}
              disabled={pending || issued}
              title={issued ? ISSUED_INVOICE_CANNOT_SAVE_MESSAGE : undefined}
              items={[
                { label: 'Save and new', onSelect: () => submit(false, 'new') },
                { label: 'Save and close', onSelect: () => submit(false, 'close') },
              ]}
            />
            {mayIssue ? (
              <SplitMenu
                label={pending ? 'Sending' : 'Review and send'}
                primary
                onClick={() => submit(true, 'review')}
                disabled={pending || issued}
                title={issued ? ISSUED_INVOICE_CANNOT_SAVE_MESSAGE : undefined}
                items={[{ label: 'Send later', disabled: true, title: STUB }]}
              />
            ) : (
              <button type="button" className="button button--primary" disabled title={PERM}>
                Review and send
              </button>
            )}
          </div>
        </footer>
        {followUp ? (
          <div className="invoice-followup" role="dialog" aria-labelledby="invoice-followup-title">
            <div className="invoice-followup__card">
              <h2 id="invoice-followup-title">
                {invoiceNo ? `Invoice ${invoiceNo} saved` : 'Draft invoice saved'}
              </h2>
              <p>Print a packing list, open the PDF, or continue with a related action.</p>
              <div className="invoice-followup__actions">
                <button type="button" className="button" onClick={() => printSheet('packing')}>
                  Print packing list
                </button>
                <button type="button" className="button" onClick={() => printSheet('pod')}>
                  Proof of delivery
                </button>
                <button type="button" className="button" onClick={() => printSheet('invoice')}>
                  Print invoice
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setFollowUp(false);
                    setMode('pdf');
                  }}
                >
                  PDF view
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setFollowUp(false);
                    setMode('email');
                  }}
                >
                  Email view
                </button>
                {issued && mayPay ? (
                  <Link className="button" href={`/sales/payments/new?customerId=${customerId}`}>
                    Receive payment
                  </Link>
                ) : (
                  <button type="button" className="button" disabled title="Issue the invoice first">
                    Receive payment
                  </button>
                )}
                <button type="button" className="button button--primary" onClick={finishFollowUp}>
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </InvoiceDialogRoot>
  );
}
