'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { savePoAction, sendPoEmailAction } from '@/server/actions/purchasing';
import { Money, formatMoney, formatQuantity } from '@/lib/money';
import { displayCurrency, productLabel } from '@/lib/inventory-overview';
import {
  purchaseOrderHref,
  purchaseOrderIsDraft,
  purchaseOrderTitle,
  supplierDetailHref,
} from '@/lib/purchase-orders';
import { Alert, Field } from '@/components/ui';
import { PrintDocumentButton } from '@/components/documents/document-pdf-preview';
import { composerDraft, composerMoneyLines } from '@/lib/documents/composer-draft';
import { ItemPicker } from '@/components/documents/item-picker';
import { MenuButton, PageFeedback, SplitMenu } from '@/components/lists/list-chrome';
import { PoDialogRoot } from './po-dialog-root';

const STUB = 'Not in this version';
const ATTACH_LIMIT = 'Max file size: 20 MB';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AfterSave = 'stay' | 'close' | 'new' | 'send' | 'receive' | 'bill';

type SupplierOption = {
  id: string;
  legalName: string;
  currencyCode: string;
  email: string | null;
  mailingAddress: string | null;
};

type ItemOption = {
  id: string;
  label: string;
  description: string;
  partNumber: string;
  purchaseCost: string | null;
  defaultTaxCodeId: string | null;
  categoryName: string | null;
};

type CategoryLine = {
  key: string;
  accountId: string;
  description: string;
  amount: string;
  taxCodeId: string;
  customerId: string;
  received: string;
  closed: string;
};

type ItemLine = {
  key: string;
  itemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxCodeId: string;
  customerId: string;
  received: string;
  closed: string;
};

export type PoComposerInitial = {
  id: string;
  poNo: string | null;
  status: string;
  supplierId: string;
  orderDate: string;
  expectedDate: string;
  warehouseId: string;
  notes: string;
  paymentTermsId: string | null;
  email: string;
  mailingAddress: string;
  categoryLines: Array<Omit<CategoryLine, 'key'>>;
  itemLines: Array<Omit<ItemLine, 'key'>>;
};

function emptyCategoryLine(taxCodeId: string): CategoryLine {
  return {
    key: crypto.randomUUID(),
    accountId: '',
    description: '',
    amount: '',
    taxCodeId,
    customerId: '',
    received: '0',
    closed: '0',
  };
}

function emptyItemLine(taxCodeId: string): ItemLine {
  return {
    key: crypto.randomUUID(),
    itemId: '',
    description: '',
    quantity: '1',
    unitPrice: '',
    taxCodeId,
    customerId: '',
    received: '0',
    closed: '0',
  };
}

function hydrateItemLine(line: Omit<ItemLine, 'key'>): ItemLine {
  return {
    ...line,
    key: crypto.randomUUID(),
    quantity: formatQuantity(line.quantity || '0'),
    unitPrice: Money.from(line.unitPrice || '0')
      .roundToCurrency(2)
      .toDecimal()
      .toFixed(2),
    received: formatQuantity(line.received || '0'),
  };
}

function hydrateCategoryLine(line: Omit<CategoryLine, 'key'>): CategoryLine {
  return {
    ...line,
    key: crypto.randomUUID(),
    amount: Money.from(line.amount || '0')
      .roundToCurrency(2)
      .toDecimal()
      .toFixed(2),
    received: formatQuantity(line.received || '0'),
  };
}

function moneyLabel(amount: Money, currencyCode: string): string {
  return formatMoney(amount, {
    currency: displayCurrency(currencyCode),
    showCurrency: true,
  });
}

function parseEmailList(value: string): string[] {
  return value
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function PoComposer({
  closeHref = '/purchasing/orders',
  suppliers,
  customers,
  taxCodes,
  warehouses,
  items,
  expenseAccounts,
  defaultTaxCodeId,
  baseCurrency,
  canApprove,
  canReceive,
  canBill,
  today,
  initial,
  defaultSupplierId,
  defaultItemId,
  defaultQty,
}: {
  closeHref?: string;
  suppliers: ReadonlyArray<SupplierOption>;
  customers: ReadonlyArray<{ id: string; legalName: string; shippingAddress: string | null }>;
  taxCodes: ReadonlyArray<{ id: string; label: string; rate: string }>;
  warehouses: ReadonlyArray<{ id: string; label: string }>;
  items: ReadonlyArray<ItemOption>;
  expenseAccounts: ReadonlyArray<{ id: string; label: string; name: string }>;
  defaultTaxCodeId: string | null;
  baseCurrency: string;
  canApprove: boolean;
  canReceive: boolean;
  canBill: boolean;
  today: string;
  initial?: PoComposerInitial;
  defaultSupplierId?: string;
  defaultItemId?: string;
  defaultQty?: string;
}) {
  const router = useRouter();
  const taxId = defaultTaxCodeId ?? '';
  const [poId, setPoId] = useState(initial?.id ?? null);
  const [poNo, setPoNo] = useState(initial?.poNo ?? null);
  const [status, setStatus] = useState(initial?.status ?? 'DRAFT');
  const [statusChoice, setStatusChoice] = useState(
    initial?.status === 'APPROVED'
      ? 'OPEN'
      : initial?.status === 'CANCELLED'
        ? 'CANCELLED'
        : 'DRAFT',
  );
  const [supplierId, setSupplierId] = useState(
    initial?.supplierId || defaultSupplierId || suppliers[0]?.id || '',
  );
  const [email, setEmail] = useState(initial?.email ?? '');
  const [ccOpen, setCcOpen] = useState(false);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [mailingAddress, setMailingAddress] = useState(initial?.mailingAddress ?? '');
  const [shipToId, setShipToId] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [orderDate, setOrderDate] = useState(initial?.orderDate || today);
  const [dueDate, setDueDate] = useState(initial?.expectedDate ?? '');
  const [shipVia, setShipVia] = useState('');
  const [warehouseId, setWarehouseId] = useState(initial?.warehouseId || warehouses[0]?.id || '');
  const [message, setMessage] = useState('');
  const [memo, setMemo] = useState(initial?.notes ?? '');
  const [categoryOpen, setCategoryOpen] = useState((initial?.categoryLines.length ?? 0) > 0);
  const [itemOpen, setItemOpen] = useState(true);
  const [categoryLines, setCategoryLines] = useState<CategoryLine[]>(() =>
    initial?.categoryLines.length ? initial.categoryLines.map(hydrateCategoryLine) : [],
  );
  const [itemLines, setItemLines] = useState<ItemLine[]>(() => {
    if (initial) return initial.itemLines.map(hydrateItemLine);
    const item = defaultItemId ? items.find((row) => row.id === defaultItemId) : undefined;
    return [
      {
        ...emptyItemLine(taxId),
        itemId: item?.id ?? '',
        description: item?.description ?? '',
        quantity: defaultQty || '1',
        unitPrice: item?.purchaseCost ?? '',
        taxCodeId: item?.defaultTaxCodeId || taxId,
      },
    ];
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submitRef = useRef<(after: AfterSave) => void>(() => {});

  const supplier = suppliers.find((row) => row.id === supplierId);
  const currency = supplier?.currencyCode ?? baseCurrency;
  const editable = purchaseOrderIsDraft(status);
  const title = purchaseOrderTitle(poNo);

  useEffect(() => {
    if (initial) return;
    const next = suppliers.find((row) => row.id === supplierId);
    setEmail(next?.email ?? '');
    setMailingAddress(next?.mailingAddress ?? '');
  }, [initial, supplierId, suppliers]);

  const totals = useMemo(() => {
    let subtotal = Money.zero();
    let tax = Money.zero();
    for (const line of categoryLines) {
      const net = Money.from(line.amount || '0');
      const rate = taxCodes.find((row) => row.id === line.taxCodeId)?.rate ?? '0';
      subtotal = subtotal.plus(net);
      tax = tax.plus(net.times(rate));
    }
    for (const line of itemLines) {
      const net = Money.from(line.quantity || '0').times(line.unitPrice || '0');
      const rate = taxCodes.find((row) => row.id === line.taxCodeId)?.rate ?? '0';
      subtotal = subtotal.plus(net);
      tax = tax.plus(net.times(rate));
    }
    return { subtotal, tax, total: subtotal.plus(tax) };
  }, [categoryLines, itemLines, taxCodes]);

  const pdfDraft = useMemo(
    () =>
      composerDraft({
        kind: 'purchase-order',
        number: poNo,
        issueDate: orderDate,
        dueDate: dueDate || undefined,
        party: {
          name: supplier?.legalName ?? 'Supplier',
          email: email || null,
          address: mailingAddress || null,
        },
        shipTo: shippingAddress ? { name: 'Ship to', address: shippingAddress } : null,
        notes: memo || null,
        currency,
        ...composerMoneyLines({
          lines: [
            ...categoryLines.map((line) => ({
              description: line.description,
              amount: line.amount,
              taxCodeId: line.taxCodeId,
            })),
            ...itemLines.map((line) => ({
              description: line.description,
              itemId: line.itemId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              taxCodeId: line.taxCodeId,
            })),
          ],
          items,
          taxCodes,
        }),
      }),
    [
      categoryLines,
      currency,
      dueDate,
      email,
      itemLines,
      items,
      mailingAddress,
      memo,
      orderDate,
      poNo,
      shippingAddress,
      supplier,
      taxCodes,
    ],
  );

  function close() {
    router.push(closeHref);
  }

  function onSupplierChange(id: string) {
    setSupplierId(id);
    const next = suppliers.find((row) => row.id === id);
    setEmail(next?.email ?? '');
    setMailingAddress(next?.mailingAddress ?? '');
  }

  function onShipToChange(id: string) {
    setShipToId(id);
    const next = customers.find((row) => row.id === id);
    setShippingAddress(next?.shippingAddress ?? '');
  }

  function updateCategory(key: string, patch: Partial<CategoryLine>) {
    setCategoryLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function updateItem(key: string, patch: Partial<ItemLine>) {
    setItemLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function onItemChange(key: string, itemId: string) {
    const item = items.find((row) => row.id === itemId);
    setItemLines((current) =>
      current.map((line) =>
        line.key === key
          ? {
              ...line,
              itemId,
              description: item?.description ?? line.description,
              unitPrice: item?.purchaseCost || line.unitPrice,
              taxCodeId: item?.defaultTaxCodeId || line.taxCodeId || taxId,
            }
          : line,
      ),
    );
  }

  function onCategoryAccount(key: string, accountId: string) {
    const account = expenseAccounts.find((row) => row.id === accountId);
    setCategoryLines((current) =>
      current.map((line) =>
        line.key === key
          ? {
              ...line,
              accountId,
              description: line.description || account?.name || '',
            }
          : line,
      ),
    );
  }

  function saveLines() {
    const categories = categoryLines
      .filter((line) => line.description.trim() || line.amount.trim())
      .map((line) => ({
        itemId: undefined,
        description: line.description.trim() || 'Category',
        quantity: '1',
        unitPrice: line.amount || '0',
        taxCodeId: line.taxCodeId || undefined,
      }));
    const products = itemLines
      .filter((line) => line.description.trim() || line.itemId || line.unitPrice.trim())
      .map((line) => ({
        itemId: line.itemId || undefined,
        description: line.description.trim() || 'Item',
        quantity: line.quantity || '1',
        unitPrice: line.unitPrice || '0',
        taxCodeId: line.taxCodeId || undefined,
      }));
    return [...categories, ...products];
  }

  function submit(after: AfterSave) {
    const wantsSend = after === 'send' || after === 'receive' || after === 'bill';
    const wantsApprove = wantsSend || statusChoice === 'OPEN';
    const needsSave = editable;

    if (status === 'CANCELLED' && after !== 'close' && after !== 'new') {
      setError('This purchase order is cancelled.');
      return;
    }
    if (!needsSave) {
      if (after === 'close') {
        close();
        return;
      }
      if (after === 'new') {
        router.push('/purchasing/orders/new');
        return;
      }
      if (after === 'stay') {
        setError('Only a draft purchase order can be saved.');
        return;
      }
      if (!poId) {
        setError('Save the purchase order first.');
        return;
      }
    }
    if (needsSave && !supplierId) {
      setError('Select a supplier.');
      return;
    }
    const lines = needsSave ? saveLines() : [];
    if (needsSave && lines.length === 0) {
      setError('Add at least one line.');
      return;
    }
    if (wantsApprove && needsSave && !canApprove) {
      setError('You do not have permission to open this purchase order.');
      return;
    }
    if (after === 'receive' && !canReceive) {
      setError('You do not have permission to receive items.');
      return;
    }
    if (after === 'bill' && !canBill) {
      setError('You do not have permission to submit a bill.');
      return;
    }
    if (wantsSend) {
      if (!email.trim()) {
        setError('Add a supplier email before sending this purchase order.');
        return;
      }
      if (!EMAIL_RE.test(email.trim())) {
        setError('Check the supplier email address.');
        return;
      }
      const extra = [...parseEmailList(cc), ...parseEmailList(bcc)];
      const bad = extra.find((address) => !EMAIL_RE.test(address));
      if (bad) {
        setError(`Check this email address: ${bad}`);
        return;
      }
    }

    setError(null);
    startTransition(async () => {
      let savedId = poId;
      if (needsSave) {
        const result = await savePoAction({
          poId: poId ?? undefined,
          supplierId,
          warehouseId: warehouseId || undefined,
          orderDate,
          expectedDate: dueDate || undefined,
          notes: memo || undefined,
          currencyCode: currency,
          paymentTermsId: initial?.paymentTermsId || undefined,
          approve: wantsApprove,
          lines,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        savedId = result.data.poId;
        setPoId(result.data.poId);
        if (result.data.poNo) {
          setPoNo(result.data.poNo);
          setStatus('APPROVED');
          setStatusChoice('OPEN');
        }
      }

      if (!savedId) {
        setError('Save the purchase order first.');
        return;
      }

      if (wantsSend) {
        const mail = await sendPoEmailAction({
          poId: savedId,
          to: email.trim(),
          cc: parseEmailList(cc),
          bcc: parseEmailList(bcc),
          message: message.trim() || undefined,
        });
        if (!mail.ok) {
          setError(mail.error);
          if (!poId) router.push(purchaseOrderHref(savedId));
          return;
        }
      }

      if (after === 'close') {
        router.push(closeHref);
        return;
      }
      if (after === 'new') {
        router.push('/purchasing/orders/new');
        return;
      }
      if (after === 'receive') {
        router.push(`/purchasing/receipts/new?poId=${savedId}`);
        return;
      }
      if (after === 'bill') {
        router.push(`/purchasing/bills/new?supplierId=${supplierId}`);
        return;
      }
      if (!poId || after === 'send') {
        router.push(purchaseOrderHref(savedId));
        return;
      }
      router.refresh();
    });
  }

  submitRef.current = submit;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (pending || event.repeat) return;
      if (event.key === 'Escape') {
        router.push(closeHref);
        return;
      }
      if (event.ctrlKey && event.altKey && !event.metaKey && event.code === 'KeyS') {
        event.preventDefault();
        submitRef.current('new');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, closeHref, router]);

  const receiveHref =
    poId && status === 'APPROVED' && canReceive ? `/purchasing/receipts/new?poId=${poId}` : null;
  const billHref =
    supplierId && status === 'APPROVED' && canBill
      ? `/purchasing/bills/new?supplierId=${supplierId}`
      : null;
  const copyHref = supplierId ? `/purchasing/orders/new?supplierId=${supplierId}` : null;
  const openBlocked =
    status === 'APPROVED'
      ? 'This purchase order is already open.'
      : status === 'CANCELLED'
        ? 'This purchase order is cancelled.'
        : 'Approve the purchase order first.';
  const sendBlocked =
    status === 'CANCELLED'
      ? 'This purchase order is cancelled.'
      : editable && !canApprove
        ? 'You need permission to open this purchase order before sending it.'
        : undefined;
  const receiveBlocked = !canReceive ? 'You do not have permission to receive items.' : sendBlocked;
  const billBlocked = !canBill ? 'You do not have permission to submit a bill.' : sendBlocked;

  return (
    <PoDialogRoot>
      <div
        className="invoice-dialog po-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="po-dialog-title"
      >
        <header className="po-dialog__header">
          <div className="po-dialog__title">
            <button
              type="button"
              className="po-dialog__icon"
              disabled
              title="Audit history is not in this version"
            >
              <ClockIcon />
            </button>
            <h1 id="po-dialog-title">{title}</h1>
          </div>
          <div className="po-dialog__tools">
            {copyHref ? (
              <Link href={copyHref} className="po-dialog__text">
                Copy
              </Link>
            ) : (
              <button type="button" className="po-dialog__text" disabled title={STUB}>
                Copy
              </button>
            )}
            <PageFeedback />
            <button
              type="button"
              className="po-dialog__icon"
              disabled
              title={STUB}
              aria-label="Help"
            >
              <HelpIcon />
            </button>
            <button
              type="button"
              className="po-dialog__icon"
              disabled
              title={STUB}
              aria-label="Settings"
            >
              <GearIcon />
            </button>
            <button
              type="button"
              className="invoice-dialog__close"
              aria-label="Close"
              onClick={close}
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="invoice-dialog__body po-dialog__body">
          {error ? <Alert title="Could not complete">{error}</Alert> : null}
          {suppliers.length === 0 ? (
            <Alert tone="warning" title="No vendors yet">
              <Link href="/purchasing/vendors/new">Add a vendor</Link> before creating a purchase
              order.
            </Alert>
          ) : null}

          <div className="po-top">
            <div className="stack">
              <Field label="Supplier" htmlFor="po-supplier" required>
                <div className="po-combo">
                  <select
                    id="po-supplier"
                    value={supplierId}
                    disabled={!editable}
                    onChange={(event) => onSupplierChange(event.target.value)}
                  >
                    {suppliers.length === 0 ? <option value="">No suppliers</option> : null}
                    {suppliers.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.legalName}
                      </option>
                    ))}
                  </select>
                  {supplierId ? (
                    <Link href={supplierDetailHref(supplierId)} className="po-combo__name">
                      {supplier?.legalName ?? 'Supplier'}
                    </Link>
                  ) : null}
                </div>
              </Field>
              <div className="po-email">
                <Field label="Email" htmlFor="po-email">
                  <input
                    id="po-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="po-link"
                  onClick={() => setCcOpen((open) => !open)}
                >
                  Cc/Bcc
                </button>
              </div>
              {ccOpen ? (
                <div className="po-cc">
                  <Field label="Cc" htmlFor="po-cc">
                    <input id="po-cc" value={cc} onChange={(event) => setCc(event.target.value)} />
                  </Field>
                  <Field label="Bcc" htmlFor="po-bcc">
                    <input
                      id="po-bcc"
                      value={bcc}
                      onChange={(event) => setBcc(event.target.value)}
                    />
                  </Field>
                </div>
              ) : null}
              <Field label="Purchase Order status" htmlFor="po-status">
                <select
                  id="po-status"
                  value={statusChoice}
                  disabled={!editable}
                  onChange={(event) => setStatusChoice(event.target.value)}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="OPEN">OPEN</option>
                  {status === 'CANCELLED' ? <option value="CANCELLED">Cancelled</option> : null}
                </select>
              </Field>
            </div>

            <Field label="Mailing address" htmlFor="po-mailing">
              <textarea
                id="po-mailing"
                rows={6}
                value={mailingAddress}
                disabled={!editable}
                onChange={(event) => setMailingAddress(event.target.value)}
              />
            </Field>

            <div className="stack">
              <Field label="Ship to" htmlFor="po-ship-to">
                <select
                  id="po-ship-to"
                  value={shipToId}
                  disabled={!editable}
                  onChange={(event) => onShipToChange(event.target.value)}
                >
                  <option value="">Select customer for address</option>
                  {customers.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.legalName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Shipping address" htmlFor="po-shipping">
                <textarea
                  id="po-shipping"
                  rows={4}
                  value={shippingAddress}
                  disabled={!editable}
                  onChange={(event) => setShippingAddress(event.target.value)}
                />
              </Field>
            </div>

            <div className="stack">
              <Field label="Purchase Order date" htmlFor="po-date" required>
                <input
                  id="po-date"
                  type="date"
                  value={orderDate}
                  disabled={!editable}
                  onChange={(event) => setOrderDate(event.target.value)}
                />
              </Field>
              <Field label="Due date" htmlFor="po-due">
                <input
                  id="po-due"
                  type="date"
                  value={dueDate}
                  disabled={!editable}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </Field>
              <Field label="Ship Via" htmlFor="po-via">
                <input
                  id="po-via"
                  value={shipVia}
                  disabled={!editable}
                  onChange={(event) => setShipVia(event.target.value)}
                  title="Ship via is not saved in this version"
                />
              </Field>
              <Field label="Location" htmlFor="po-warehouse">
                <select
                  id="po-warehouse"
                  value={warehouseId}
                  disabled={!editable}
                  onChange={(event) => setWarehouseId(event.target.value)}
                >
                  <option value="">None</option>
                  {warehouses.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="po-amount">
              <span>AMOUNT</span>
              <strong>{moneyLabel(totals.total, currency)}</strong>
              {totals.tax.isZero() ? null : (
                <p className="po-amount__tax">includes {moneyLabel(totals.tax, currency)} tax</p>
              )}
              {receiveHref ? (
                <Link href={receiveHref} className="button">
                  Receive items
                </Link>
              ) : (
                <button type="button" className="button" disabled title={openBlocked}>
                  Receive items
                </button>
              )}
              {billHref ? (
                <Link href={billHref} className="button button--primary">
                  Copy to bill
                </Link>
              ) : (
                <button
                  type="button"
                  className="button button--primary"
                  disabled
                  title={openBlocked}
                >
                  Copy to bill
                </button>
              )}
            </div>
          </div>

          <section className="po-section">
            <button
              type="button"
              className="po-section__toggle"
              aria-expanded={categoryOpen}
              onClick={() => setCategoryOpen((open) => !open)}
            >
              <Chevron open={categoryOpen} />
              Category details
            </button>
            {categoryOpen ? (
              <div className="po-section__body">
                <div className="table-wrapper">
                  <table className="data-table data-table--dense po-lines">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Category</th>
                        <th>Description</th>
                        <th className="numeric">Amount</th>
                        <th>Tax</th>
                        <th>Customer</th>
                        <th>Received</th>
                        <th>Closed</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {categoryLines.map((line, index) => (
                        <tr key={line.key}>
                          <td>{index + 1}</td>
                          <td>
                            <select
                              value={line.accountId}
                              disabled={!editable}
                              aria-label={`Category ${index + 1}`}
                              onChange={(event) => onCategoryAccount(line.key, event.target.value)}
                            >
                              <option value="">Select a category</option>
                              {expenseAccounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              value={line.description}
                              disabled={!editable}
                              onChange={(event) =>
                                updateCategory(line.key, { description: event.target.value })
                              }
                            />
                          </td>
                          <td className="numeric">
                            <input
                              value={line.amount}
                              disabled={!editable}
                              inputMode="decimal"
                              onChange={(event) =>
                                updateCategory(line.key, { amount: event.target.value })
                              }
                            />
                          </td>
                          <td>
                            <TaxCell
                              value={line.taxCodeId}
                              taxCodes={taxCodes}
                              disabled={!editable}
                              onChange={(taxCodeId) => updateCategory(line.key, { taxCodeId })}
                            />
                          </td>
                          <td>
                            <CustomerCell
                              value={line.customerId}
                              customers={customers}
                              disabled={!editable}
                              onChange={(customerId) => updateCategory(line.key, { customerId })}
                            />
                          </td>
                          <td>{formatQuantity(line.received)}</td>
                          <td>{line.closed}</td>
                          <td className="po-line-actions">
                            <LineIcons
                              disabled={!editable}
                              onCopy={() =>
                                setCategoryLines((current) => [
                                  ...current,
                                  { ...line, key: crypto.randomUUID(), received: '0', closed: '0' },
                                ])
                              }
                              onDelete={() =>
                                setCategoryLines((current) =>
                                  current.filter((row) => row.key !== line.key),
                                )
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="po-section__footer">
                  <button
                    type="button"
                    className="button"
                    disabled={!editable}
                    onClick={() =>
                      setCategoryLines((current) => [
                        ...current,
                        emptyCategoryLine(taxId),
                        emptyCategoryLine(taxId),
                        emptyCategoryLine(taxId),
                        emptyCategoryLine(taxId),
                      ])
                    }
                  >
                    Add lines
                  </button>
                  <button
                    type="button"
                    className="button"
                    disabled={!editable || categoryLines.length === 0}
                    onClick={() => setCategoryLines([])}
                  >
                    Clear all lines
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="po-section">
            <button
              type="button"
              className="po-section__toggle"
              aria-expanded={itemOpen}
              onClick={() => setItemOpen((open) => !open)}
            >
              <Chevron open={itemOpen} />
              Item details
            </button>
            {itemOpen ? (
              <div className="po-section__body">
                <div className="table-wrapper">
                  <table className="data-table data-table--dense po-lines">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Product/Service</th>
                        <th>SKU</th>
                        <th>Description</th>
                        <th className="numeric">Qty</th>
                        <th className="numeric">Rate</th>
                        <th className="numeric">Amount</th>
                        <th>Tax</th>
                        <th>Customer</th>
                        <th>Received</th>
                        <th>Closed</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {itemLines.map((line, index) => {
                        const item = items.find((row) => row.id === line.itemId);
                        const amount = Money.from(line.quantity || '0').times(
                          line.unitPrice || '0',
                        );
                        return (
                          <tr key={line.key}>
                            <td>{index + 1}</td>
                            <td className="po-product">
                              {editable ? (
                                <ItemPicker
                                  items={items}
                                  value={line.itemId}
                                  allowEmpty
                                  emptyLabel="Select a product/service"
                                  onChange={(itemId) => onItemChange(line.key, itemId)}
                                />
                              ) : (
                                <span>
                                  {item
                                    ? productLabel(
                                        item.categoryName,
                                        item.description,
                                        item.partNumber,
                                      )
                                    : line.description}
                                </span>
                              )}
                            </td>
                            <td>{item?.partNumber ?? ''}</td>
                            <td>
                              <input
                                value={line.description}
                                disabled={!editable}
                                onChange={(event) =>
                                  updateItem(line.key, { description: event.target.value })
                                }
                              />
                            </td>
                            <td className="numeric">
                              <input
                                value={line.quantity}
                                disabled={!editable}
                                inputMode="decimal"
                                onChange={(event) =>
                                  updateItem(line.key, { quantity: event.target.value })
                                }
                              />
                            </td>
                            <td className="numeric">
                              <input
                                value={line.unitPrice}
                                disabled={!editable}
                                inputMode="decimal"
                                onChange={(event) =>
                                  updateItem(line.key, { unitPrice: event.target.value })
                                }
                              />
                            </td>
                            <td className="numeric">{moneyLabel(amount, currency)}</td>
                            <td>
                              <TaxCell
                                value={line.taxCodeId}
                                taxCodes={taxCodes}
                                disabled={!editable}
                                onChange={(taxCodeId) => updateItem(line.key, { taxCodeId })}
                              />
                            </td>
                            <td>
                              <CustomerCell
                                value={line.customerId}
                                customers={customers}
                                disabled={!editable}
                                onChange={(customerId) => updateItem(line.key, { customerId })}
                              />
                            </td>
                            <td>{formatQuantity(line.received)}</td>
                            <td>{line.closed}</td>
                            <td className="po-line-actions">
                              <LineIcons
                                disabled={!editable}
                                onCopy={() =>
                                  setItemLines((current) => [
                                    ...current,
                                    {
                                      ...line,
                                      key: crypto.randomUUID(),
                                      received: '0',
                                      closed: '0',
                                    },
                                  ])
                                }
                                onDelete={() =>
                                  setItemLines((current) =>
                                    current.filter((row) => row.key !== line.key),
                                  )
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="po-section__footer">
                  <div className="po-section__footer-start">
                    <button
                      type="button"
                      className="button"
                      disabled={!editable}
                      onClick={() =>
                        setItemLines((current) => [
                          ...current,
                          emptyItemLine(taxId),
                          emptyItemLine(taxId),
                          emptyItemLine(taxId),
                          emptyItemLine(taxId),
                        ])
                      }
                    >
                      Add lines
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={!editable}
                      onClick={() => setItemLines([emptyItemLine(taxId)])}
                    >
                      Clear all lines
                    </button>
                  </div>
                  <p className="po-total">
                    {totals.tax.isZero() ? null : <>Tax {moneyLabel(totals.tax, currency)} · </>}
                    Total <strong>{moneyLabel(totals.total, currency)}</strong>
                  </p>
                </div>
              </div>
            ) : null}
          </section>

          <div className="po-notes">
            <Field label="Your message to supplier" htmlFor="po-message">
              <textarea
                id="po-message"
                rows={4}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                title="Printed supplier messages are not saved in this version"
              />
            </Field>
            <Field label="Memo" htmlFor="po-memo">
              <textarea
                id="po-memo"
                rows={4}
                value={memo}
                disabled={!editable}
                onChange={(event) => setMemo(event.target.value)}
              />
            </Field>
          </div>

          <div className="invoice-attach po-attach">
            <button type="button" className="po-link" disabled title={STUB}>
              Add attachment
            </button>
            <span className="invoice-attach__link">{ATTACH_LIMIT}</span>
            <button type="button" className="po-link" disabled title={STUB}>
              Show existing
            </button>
          </div>
        </div>

        <footer className="invoice-dialog__footer">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <div className="invoice-dialog__footer-links">
            <PrintDocumentButton kind="purchase-order" savedId={poId} draft={pdfDraft} />
            <button type="button" className="button button--ghost" disabled title={STUB}>
              Make recurring
            </button>
            <MenuButton
              label="More"
              items={[
                { label: 'Make a copy', href: copyHref ?? undefined, disabled: !copyHref },
                { label: 'Delete', disabled: true, title: STUB },
                { label: 'Audit history', disabled: true, title: STUB },
              ]}
            />
          </div>
          <div className="invoice-dialog__footer-save">
            <button
              type="button"
              className="button"
              disabled={pending || !editable}
              title={editable ? undefined : 'Only a draft purchase order can be saved'}
              onClick={() => submit('stay')}
            >
              Save
            </button>
            <SplitMenu
              label={pending ? 'Saving' : 'Save and close'}
              primary
              disabled={pending || suppliers.length === 0}
              onClick={() => submit('close')}
              items={[
                {
                  label: 'Save and new',
                  shortcut: 'Ctrl+Alt+S',
                  onSelect: () => submit('new'),
                },
                {
                  label: 'Save and send',
                  onSelect: () => submit('send'),
                  disabled: Boolean(sendBlocked),
                  title: sendBlocked,
                },
                {
                  label: 'Save and receive items',
                  onSelect: () => submit('receive'),
                  disabled: Boolean(receiveBlocked),
                  title: receiveBlocked,
                },
                {
                  label: 'Save and submit bill',
                  onSelect: () => submit('bill'),
                  disabled: Boolean(billBlocked),
                  title: billBlocked,
                },
              ]}
            />
          </div>
        </footer>
      </div>
    </PoDialogRoot>
  );
}

function TaxCell({
  value,
  taxCodes,
  disabled,
  onChange,
}: {
  value: string;
  taxCodes: ReadonlyArray<{ id: string; label: string }>;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <select
      className="po-tax"
      value={value}
      disabled={disabled}
      aria-label="Tax"
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">No tax</option>
      {taxCodes.map((row) => (
        <option key={row.id} value={row.id}>
          {row.label}
        </option>
      ))}
    </select>
  );
}

function CustomerCell({
  value,
  customers,
  disabled,
  onChange,
}: {
  value: string;
  customers: ReadonlyArray<{ id: string; legalName: string }>;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label="Customer"
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="" />
      {customers.map((row) => (
        <option key={row.id} value={row.id}>
          {row.legalName}
        </option>
      ))}
    </select>
  );
}

function LineIcons({
  disabled,
  onCopy,
  onDelete,
}: {
  disabled: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="po-icon-btn"
        aria-label="Copy line"
        disabled={disabled}
        onClick={onCopy}
      >
        <CopyIcon />
      </button>
      <button
        type="button"
        className="po-icon-btn"
        aria-label="Delete line"
        disabled={disabled}
        onClick={onDelete}
      >
        <TrashIcon />
      </button>
    </>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d={open ? 'M2 4.5 6 8.5 10 4.5' : 'M4.5 2 8.5 6 4.5 10'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 8v4.5L15 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M9.5 9.5a2.5 2.5 0 1 1 4.2 1.8c-.7.6-1.7 1-1.7 2.2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="0.8" fill="currentColor" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 4.5v1.6M12 17.9v1.6M4.5 12h1.6M17.9 12h1.6M6.7 6.7l1.1 1.1M16.2 16.2l1.1 1.1M17.3 6.7l-1.1 1.1M7.8 16.2l-1.1 1.1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M6 16V6.5A1.5 1.5 0 0 1 7.5 5H16" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 7h14M10 7V5h4v2M8 7l.8 12h6.4L16 7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}
