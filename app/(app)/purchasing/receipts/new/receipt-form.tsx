'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveGoodsReceiptAction } from '@/server/actions/purchasing';
import { Money, formatMoney, formatQuantity } from '@/lib/money';
import { displayCurrency } from '@/lib/inventory-overview';
import { formatDisplayDate } from '@/lib/payables';
import { purchaseOrderHref } from '@/lib/purchase-orders';
import { Alert, Field } from '@/components/ui';
import { PrintDocumentButton } from '@/components/documents/document-pdf-preview';
import { composerDraft, composerMoneyLines } from '@/lib/documents/composer-draft';
import { ItemPicker } from '@/components/documents/item-picker';
import { BusyLabel } from '@/components/loading/dots-loader';
import { PageFeedback, SplitMenu } from '@/components/lists/list-chrome';
import { GrnDialogRoot } from './grn-dialog-root';

const STUB = 'Not in this version';
const ATTACH_LIMIT = 'Max file size: 20 MB';
const CLOSE_HREF = '/purchasing/receipts';

type AfterSave = 'stay' | 'close' | 'new';

export type PoOption = {
  id: string;
  poNo: string;
  supplierId: string;
  supplierName: string;
  warehouseId: string | null;
  orderDate: string;
  total: string;
  remaining: string;
  currencyCode: string;
};

export type PoLine = {
  id: string;
  lineNo: number;
  itemId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  trackingMode: string | null;
  partNumber: string | null;
  categoryName: string | null;
  receivedQty: string;
};

type ItemOption = {
  id: string;
  label: string;
  description: string;
  trackingMode: string;
  partNumber?: string;
  purchaseCost: string | null;
  categoryName: string | null;
};

type LineState = {
  key: string;
  poLineId: string;
  itemId: string;
  description: string;
  quantity: string;
  unitCost: string;
  serialNumber: string;
  trackingMode: string;
};

function moneyField(value: string | null | undefined): string {
  if (!value || !value.trim()) return '0.00';
  return Money.from(value).roundToCurrency(2).toDecimal().toFixed(2);
}

function remainingQty(line: PoLine): Money {
  return Money.from(line.quantity).minus(line.receivedQty || '0');
}

function emptyLine(): LineState {
  return {
    key: crypto.randomUUID(),
    poLineId: '',
    itemId: '',
    description: '',
    quantity: '1',
    unitCost: '',
    serialNumber: '',
    trackingMode: 'NONE',
  };
}

function linesFromPo(poLines: ReadonlyArray<PoLine>): LineState[] {
  const next: LineState[] = [];
  for (const line of poLines) {
    if (!line.itemId) continue;
    let left = remainingQty(line);
    if (!left.isPositive()) continue;
    const tracking = line.trackingMode ?? 'NONE';
    const unitCost = moneyField(line.unitPrice);
    if (tracking === 'SERIAL') {
      let count = 0;
      while (left.isPositive() && count < 100) {
        next.push({
          key: crypto.randomUUID(),
          poLineId: line.id,
          itemId: line.itemId,
          description: line.description,
          quantity: '1',
          unitCost,
          serialNumber: '',
          trackingMode: tracking,
        });
        left = left.minus(1);
        count += 1;
      }
    } else {
      next.push({
        key: crypto.randomUUID(),
        poLineId: line.id,
        itemId: line.itemId,
        description: line.description,
        quantity: formatQuantity(left),
        unitCost,
        serialNumber: '',
        trackingMode: tracking,
      });
    }
  }
  return next.length > 0 ? next : [emptyLine(), emptyLine()];
}

function moneyLabel(amount: Money, currencyCode: string): string {
  return formatMoney(amount, {
    currency: displayCurrency(currencyCode),
    showCurrency: true,
  }).replace(' ', '');
}

function filledLines(lines: ReadonlyArray<LineState>): LineState[] {
  return lines.filter((line) => line.itemId);
}

export function ReceiptForm({
  suppliers,
  warehouses,
  items,
  approvedPos,
  loadPoLines,
  defaultPoId,
  defaultSupplierId,
  today,
  baseCurrency,
}: {
  suppliers: ReadonlyArray<{ id: string; legalName: string }>;
  warehouses: ReadonlyArray<{ id: string; label: string }>;
  items: ReadonlyArray<ItemOption>;
  approvedPos: ReadonlyArray<PoOption>;
  loadPoLines: (poId: string) => Promise<PoLine[]>;
  defaultPoId?: string;
  defaultSupplierId?: string;
  today: string;
  baseCurrency: string;
}) {
  const router = useRouter();
  const defaultPo = defaultPoId ? approvedPos.find((row) => row.id === defaultPoId) : undefined;
  const [goodsReceiptId, setGoodsReceiptId] = useState<string | null>(null);
  const [grnNo, setGrnNo] = useState<string | null>(null);
  const [poId, setPoId] = useState(defaultPo?.id ?? '');
  const [supplierId, setSupplierId] = useState(defaultPo?.supplierId ?? defaultSupplierId ?? '');
  const [warehouseId, setWarehouseId] = useState(defaultPo?.warehouseId ?? warehouses[0]?.id ?? '');
  const [receiptDate, setReceiptDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineState[]>([emptyLine(), emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(!defaultPoId && Boolean(defaultSupplierId));
  const [panelDismissed, setPanelDismissed] = useState(Boolean(defaultPoId));
  const [pending, startTransition] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const loadGen = useRef(0);

  const selectedPo = approvedPos.find((row) => row.id === poId);
  const supplierName =
    selectedPo?.supplierName ??
    suppliers.find((row) => row.id === supplierId)?.legalName ??
    'this supplier';
  const supplierPos = useMemo(
    () => approvedPos.filter((row) => row.supplierId === supplierId),
    [approvedPos, supplierId],
  );
  const currency = selectedPo?.currencyCode ?? baseCurrency;
  const hasItems = filledLines(lines).length > 0;
  const needsTracking = lines.some(
    (line) => line.trackingMode === 'SERIAL' || line.trackingMode === 'LOT',
  );

  const pdfDraft = useMemo(
    () =>
      composerDraft({
        kind: 'goods-receipt',
        issueDate: receiptDate,
        party: { name: supplierName },
        meta: selectedPo ? [{ label: 'Source PO', value: selectedPo.poNo }] : [],
        notes: notes || null,
        currency,
        ...composerMoneyLines({
          lines: filledLines(lines).map((line) => ({
            description: line.description,
            itemId: line.itemId,
            quantity: line.quantity,
            unitPrice: line.unitCost || '0',
          })),
          items,
          taxCodes: [],
        }),
      }),
    [currency, items, lines, notes, receiptDate, selectedPo, supplierName],
  );

  useEffect(() => {
    if (!defaultPoId) return;
    void applyPo(defaultPoId);
    // Load the linked PO once when opened from an order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPoId]);

  useEffect(() => {
    if (panelDismissed || hasItems || !supplierId) return;
    setPanelOpen(true);
  }, [hasItems, panelDismissed, supplierId]);

  function close() {
    router.push(CLOSE_HREF);
  }

  function resetComposer() {
    loadGen.current += 1;
    setGoodsReceiptId(null);
    setGrnNo(null);
    setPoId('');
    setSupplierId('');
    setWarehouseId(warehouses[0]?.id ?? '');
    setReceiptDate(today);
    setNotes('');
    setLines([emptyLine(), emptyLine()]);
    setError(null);
    setPanelOpen(false);
    setPanelDismissed(false);
    setIdempotencyKey(crypto.randomUUID());
  }

  function onSupplierChange(nextId: string) {
    loadGen.current += 1;
    setSupplierId(nextId);
    setPoId('');
    setLines([emptyLine(), emptyLine()]);
    setError(null);
    setPanelDismissed(false);
    setPanelOpen(Boolean(nextId));
  }

  async function applyPo(nextPoId: string) {
    const po = approvedPos.find((row) => row.id === nextPoId);
    const gen = ++loadGen.current;
    const poLines = await loadPoLines(nextPoId);
    if (gen !== loadGen.current) return;
    if (po) {
      setPoId(po.id);
      setSupplierId(po.supplierId);
      if (po.warehouseId) setWarehouseId(po.warehouseId);
    } else {
      setPoId(nextPoId);
    }
    const next = linesFromPo(poLines);
    const ready = filledLines(next);
    setLines(next);
    if (ready.length === 0) {
      setError('This purchase order has no remaining stocked items to receive.');
      setPanelDismissed(false);
      setPanelOpen(true);
      return;
    }
    setError(null);
    setPanelOpen(false);
    setPanelDismissed(true);
  }

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addBlankLines() {
    setLines((current) => [...current, emptyLine(), emptyLine()]);
  }

  function copyLine(key: string) {
    setLines((current) => {
      const index = current.findIndex((line) => line.key === key);
      if (index < 0) return current;
      const source = current[index];
      if (!source) return current;
      const clone: LineState = {
        ...source,
        key: crypto.randomUUID(),
        serialNumber: '',
        quantity: source.trackingMode === 'SERIAL' ? '1' : source.quantity,
      };
      const next = current.slice();
      next.splice(index + 1, 0, clone);
      return next;
    });
  }

  function removeLine(key: string) {
    setLines((current) => {
      const next = current.filter((line) => line.key !== key);
      return next.length > 0 ? next : [emptyLine()];
    });
  }

  function validate(payload: LineState[]): string | null {
    if (payload.length === 0) return 'Add at least one item to receive.';
    if (!supplierId) return 'Select a supplier.';
    if (!warehouseId) return 'Select a warehouse.';
    for (const [index, line] of payload.entries()) {
      const n = index + 1;
      if (!line.description.trim()) return `Line ${n}: description is required.`;
      if (!line.quantity.trim()) return `Line ${n}: enter the quantity received.`;
      try {
        if (!Money.from(line.quantity).isPositive()) {
          return `Line ${n}: quantity received must be more than zero.`;
        }
      } catch {
        return `Line ${n}: enter a valid quantity.`;
      }
      if (!line.unitCost.trim()) return `Line ${n}: enter a rate.`;
      try {
        Money.from(line.unitCost);
      } catch {
        return `Line ${n}: enter a valid rate.`;
      }
      if (line.trackingMode === 'SERIAL' && !line.serialNumber.trim()) {
        return `Line ${n}: serial number is required.`;
      }
      if (line.trackingMode === 'LOT' && !line.serialNumber.trim()) {
        return `Line ${n}: lot number is required.`;
      }
    }
    return null;
  }

  function submit(after: AfterSave) {
    const payload = filledLines(lines);
    const problem = validate(payload);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveGoodsReceiptAction({
        goodsReceiptId: goodsReceiptId ?? undefined,
        supplierId,
        poId: poId || undefined,
        receiptDate,
        warehouseId,
        notes: notes || undefined,
        post: after !== 'stay',
        idempotencyKey,
        lines: payload.map((line) => ({
          poLineId: line.poLineId || undefined,
          itemId: line.itemId,
          description: line.description,
          quantity: line.trackingMode === 'SERIAL' ? '1' : line.quantity,
          unitCost: moneyField(line.unitCost),
          serialNumber: line.serialNumber.trim() || undefined,
          conditionCode: 'OH',
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setGoodsReceiptId(result.data.goodsReceiptId);
      if (result.data.grnNo) setGrnNo(result.data.grnNo);
      if (after === 'close') {
        router.push(CLOSE_HREF);
        router.refresh();
        return;
      }
      if (after === 'new') {
        resetComposer();
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  const title = grnNo ? `Item receipt #${grnNo}` : 'Item receipt';

  return (
    <GrnDialogRoot>
      <div
        className="invoice-dialog po-dialog grn-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grn-dialog-title"
      >
        <header className="po-dialog__header">
          <div className="po-dialog__title">
            <h1 id="grn-dialog-title">{title}</h1>
          </div>
          <div className="po-dialog__tools">
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
              className="invoice-dialog__close"
              aria-label="Close"
              onClick={close}
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="grn-shell">
          <div className="invoice-dialog__body po-dialog__body grn-main">
            {error ? <Alert title="Could not complete">{error}</Alert> : null}
            {suppliers.length === 0 ? (
              <Alert tone="warning" title="No vendors yet">
                <Link href="/purchasing/vendors/new">Add a vendor</Link> first.
              </Alert>
            ) : null}
            {warehouses.length === 0 ? (
              <Alert tone="warning" title="No warehouse">
                Create a warehouse before receiving stock.
              </Alert>
            ) : null}

            {selectedPo ? (
              <p className="grn-linked">
                <Link href={purchaseOrderHref(selectedPo.id)}>Linked transactions (1)</Link>
              </p>
            ) : null}

            <div className="grn-top">
              <Field label="Supplier" htmlFor="grn-supplier" required>
                <select
                  id="grn-supplier"
                  value={supplierId}
                  onChange={(event) => onSupplierChange(event.target.value)}
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.legalName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date" htmlFor="grn-date" required>
                <input
                  id="grn-date"
                  type="date"
                  value={receiptDate}
                  onChange={(event) => setReceiptDate(event.target.value)}
                />
              </Field>
              <Field label="Receipt no." htmlFor="grn-no">
                <input id="grn-no" value={grnNo ?? ''} placeholder="Assigned on save" readOnly />
              </Field>
              <Field label="Warehouse" htmlFor="grn-warehouse" required>
                <select
                  id="grn-warehouse"
                  value={warehouseId}
                  onChange={(event) => setWarehouseId(event.target.value)}
                >
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <section className="po-section">
              <h2 className="grn-section-title">Item details</h2>
              <div className="po-section__body">
                <div className="table-wrapper">
                  <table className="data-table po-lines">
                    <thead>
                      <tr>
                        <th className="grn-num">#</th>
                        <th>Product/service</th>
                        <th>SKU</th>
                        <th className="numeric">Rate</th>
                        <th className="numeric">Qty received</th>
                        {needsTracking ? <th>Lot / serial</th> : null}
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, index) => {
                        const item = items.find((row) => row.id === line.itemId);
                        return (
                          <tr key={line.key}>
                            <td className="grn-num cell-muted">{index + 1}</td>
                            <td className="po-product">
                              <ItemPicker
                                items={items}
                                value={line.itemId}
                                allowEmpty
                                emptyLabel="Enter product/service"
                                placeholder="Enter product/service"
                                onChange={(itemId) => {
                                  const next = items.find((row) => row.id === itemId);
                                  updateLine(line.key, {
                                    itemId,
                                    description: next?.description ?? '',
                                    trackingMode: next?.trackingMode ?? 'NONE',
                                    quantity: next?.trackingMode === 'SERIAL' ? '1' : line.quantity,
                                    unitCost: next ? moneyField(next.purchaseCost) : line.unitCost,
                                    serialNumber: '',
                                    poLineId: '',
                                  });
                                }}
                              />
                            </td>
                            <td className="cell-muted">{item?.partNumber ?? '—'}</td>
                            <td className="numeric">
                              <input
                                value={line.unitCost}
                                onChange={(event) =>
                                  updateLine(line.key, { unitCost: event.target.value })
                                }
                                inputMode="decimal"
                                aria-label="Rate"
                              />
                            </td>
                            <td className="numeric">
                              <input
                                value={line.quantity}
                                onChange={(event) =>
                                  updateLine(line.key, { quantity: event.target.value })
                                }
                                inputMode="decimal"
                                disabled={line.trackingMode === 'SERIAL'}
                                aria-label="Qty received"
                              />
                            </td>
                            {needsTracking ? (
                              <td>
                                {line.trackingMode === 'SERIAL' || line.trackingMode === 'LOT' ? (
                                  <input
                                    value={line.serialNumber}
                                    onChange={(event) =>
                                      updateLine(line.key, { serialNumber: event.target.value })
                                    }
                                    placeholder={
                                      line.trackingMode === 'LOT' ? 'Lot number' : 'Serial number'
                                    }
                                  />
                                ) : (
                                  <span className="cell-muted">—</span>
                                )}
                              </td>
                            ) : null}
                            <td className="po-line-actions">
                              <LineIcons
                                onCopy={() => copyLine(line.key)}
                                onDelete={() => removeLine(line.key)}
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
                    <button type="button" className="button" onClick={addBlankLines}>
                      Add lines
                    </button>
                    {supplierId && !panelOpen ? (
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => {
                          setPanelDismissed(false);
                          setPanelOpen(true);
                        }}
                      >
                        Add from purchase orders
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <div className="po-notes">
              <Field label="Memo" htmlFor="grn-memo">
                <textarea
                  id="grn-memo"
                  rows={4}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>
              <div className="invoice-attach">
                <strong>Attachments</strong>
                <div>
                  <button type="button" className="po-link" disabled title={STUB}>
                    Add attachment
                  </button>
                  <span className="invoice-attach__link"> {ATTACH_LIMIT}</span>
                </div>
                <button type="button" className="po-link" disabled title={STUB}>
                  Show existing
                </button>
              </div>
            </div>
          </div>

          {panelOpen ? (
            <aside className="grn-panel" aria-label="Add items from purchase orders">
              <div className="grn-panel__head">
                <h2>Add items</h2>
                <button
                  type="button"
                  className="po-dialog__icon"
                  aria-label="Close add items"
                  onClick={() => {
                    setPanelOpen(false);
                    setPanelDismissed(true);
                  }}
                >
                  <CloseIcon />
                </button>
              </div>
              <div className="grn-panel__body">
                <Field label="Supplier" htmlFor="grn-panel-supplier">
                  <select
                    id="grn-panel-supplier"
                    value={supplierId}
                    onChange={(event) => onSupplierChange(event.target.value)}
                  >
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.legalName}
                      </option>
                    ))}
                  </select>
                </Field>
                {supplierId ? (
                  <p className="grn-panel__hint">
                    Add items from these purchase orders associated with {supplierName} to start
                    receiving them.
                  </p>
                ) : (
                  <p className="grn-panel__hint">
                    Select a supplier to see their open purchase orders.
                  </p>
                )}
                {supplierId && supplierPos.length === 0 ? (
                  <p className="grn-panel__empty">
                    No approved purchase orders for {supplierName}.
                  </p>
                ) : null}
                {supplierPos.map((po) => {
                  const remaining = Money.from(po.remaining || '0');
                  const disabled = !remaining.isPositive();
                  return (
                    <article key={po.id} className="grn-po-card">
                      <div className="grn-po-card__title">
                        <span>Purchase order #{po.poNo}</span>
                        <a
                          href={purchaseOrderHref(po.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="po-icon-btn"
                          aria-label={`Open purchase order ${po.poNo}`}
                        >
                          <ExternalIcon />
                        </a>
                      </div>
                      <dl className="grn-po-card__meta">
                        <div>
                          <dt>Date</dt>
                          <dd>{formatDisplayDate(po.orderDate)}</dd>
                        </div>
                        <div>
                          <dt>Amount</dt>
                          <dd>{moneyLabel(Money.from(po.total), po.currencyCode)}</dd>
                        </div>
                        <div>
                          <dt>Balance</dt>
                          <dd>{moneyLabel(remaining, po.currencyCode)}</dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="button button--primary grn-po-card__add"
                        disabled={disabled || pending}
                        title={disabled ? 'This purchase order has no remaining items' : undefined}
                        onClick={() => {
                          void applyPo(po.id);
                        }}
                      >
                        Add
                      </button>
                    </article>
                  );
                })}
              </div>
            </aside>
          ) : null}
        </div>

        <footer className="invoice-dialog__footer">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <div className="invoice-dialog__footer-links">
            <PrintDocumentButton kind="goods-receipt" savedId={goodsReceiptId} draft={pdfDraft} />
          </div>
          <div className="invoice-dialog__footer-save">
            <button
              type="button"
              className="button"
              disabled={pending || suppliers.length === 0 || warehouses.length === 0}
              onClick={() => submit('stay')}
            >
              <BusyLabel pending={pending} idle="Save" />
            </button>
            <SplitMenu
              label={pending ? 'Saving' : 'Save and close'}
              primary
              disabled={pending || suppliers.length === 0 || warehouses.length === 0}
              onClick={() => submit('close')}
              items={[
                {
                  label: 'Save and new',
                  shortcut: 'Ctrl+Alt+S',
                  onSelect: () => submit('new'),
                },
              ]}
            />
          </div>
        </footer>
      </div>
    </GrnDialogRoot>
  );
}

function LineIcons({ onCopy, onDelete }: { onCopy: () => void; onDelete: () => void }) {
  return (
    <>
      <button type="button" className="po-icon-btn" aria-label="Copy line" onClick={onCopy}>
        <CopyIcon />
      </button>
      <button type="button" className="po-icon-btn" aria-label="Delete line" onClick={onDelete}>
        <TrashIcon />
      </button>
    </>
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

function ExternalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 5h5v5M19 5l-9 9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
