'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Amount, Badge, EmptyState, Quantity } from '@/components/ui';
import { CustomiseDrawer } from '@/components/lists/customise-drawer';
import { RowAction } from '@/components/lists/list-chrome';
import type { CatalogueRow } from '@/server/modules/inventory/lists';
import {
  attentionLines,
  defaultProductsView,
  itemTypeLabel,
  matchesProductSearch,
  matchesProductType,
  matchesStockStatus,
  parseProductType,
  parseStockStatus,
  PRODUCT_COLUMNS,
  PRODUCTS_VIEW_KEY,
  stockAlertOf,
  type ProductTypeFilter,
  type StockStatusFilter,
} from '@/lib/inventory-list';
import {
  loadListView,
  pageCount,
  pagerLabel,
  pageSlice,
  saveListView,
  visibleColumns,
  type ListView,
} from '@/lib/list-view';
import { toCsv } from '@/lib/payables';

export function ProductsTable({
  rows,
  attention,
  currency,
  mayManage,
  mayAdjust,
  mayPurchase,
  onCreate,
}: {
  rows: readonly CatalogueRow[];
  attention: { low: number; out: number };
  currency: string;
  mayManage: boolean;
  mayAdjust: boolean;
  mayPurchase: boolean;
  onCreate?: () => void;
}) {
  const fallback = useMemo(() => defaultProductsView(), []);
  const [view, setView] = useState<ListView>(fallback);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<ProductTypeFilter>('ALL');
  const [stock, setStock] = useState<StockStatusFilter>('ANY');
  const [moreFilters, setMoreFilters] = useState(false);
  const [inactive, setInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [customise, setCustomise] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const listRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setView(loadListView(PRODUCTS_VIEW_KEY, PRODUCT_COLUMNS, fallback));
  }, [fallback]);

  function update(next: ListView) {
    setView(next);
    saveListView(PRODUCTS_VIEW_KEY, next);
  }

  const filtered = useMemo(() => {
    const matched = rows.filter(
      (row) =>
        (inactive || row.isActive) &&
        matchesProductSearch(row, search) &&
        matchesProductType(row, type) &&
        matchesStockStatus(row, stock),
    );
    const direction = view.sortDir === 'desc' ? -1 : 1;
    return [...matched].sort((a, b) => {
      const left = sortValue(a, view.sortBy);
      const right = sortValue(b, view.sortBy);
      if (typeof left === 'number' && typeof right === 'number') {
        return (left - right) * direction;
      }
      return String(left).localeCompare(String(right)) * direction;
    });
  }, [rows, inactive, search, type, stock, view.sortBy, view.sortDir]);

  const pages = pageCount(filtered.length, view.rowsPerPage);
  const current = Math.min(page, pages);
  const visible = pageSlice(filtered, current, view.rowsPerPage);
  const columns = visibleColumns(view, PRODUCT_COLUMNS);
  const dataColumns = columns.filter((column) => column.id !== 'actions');
  const banner = attentionLines(attention);

  const csv = toCsv([
    dataColumns.map((column) => column.label),
    ...(selected.length > 0 ? filtered.filter((row) => selected.includes(row.id)) : filtered).map(
      (row) => dataColumns.map((column) => plainCell(row, column.id)),
    ),
  ]);

  function toggleSort(id: string) {
    if (id === 'actions') return;
    update(
      view.sortBy === id
        ? { ...view, sortDir: view.sortDir === 'asc' ? 'desc' : 'asc' }
        : { ...view, sortBy: id, sortDir: 'asc' },
    );
  }

  function download() {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'inventory-products.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  const grouped = view.groupBy === 'category';
  let lastGroup: string | null = null;

  return (
    <section className="inv-list" ref={listRef}>
      {banner.length > 0 && !dismissed ? (
        <div className="inv-attention" role="status">
          <span className="inv-attention__mark" aria-hidden="true">
            !
          </span>
          <div className="inv-attention__body">
            <strong>Some items need your attention</strong>
            <ul>
              {banner.map((line) => {
                const out = line.includes('out of stock');
                return (
                  <li key={line}>
                    {line}{' '}
                    <Link href={out ? '/inventory/stock?alert=out' : '/inventory/stock?alert=low'}>
                      See all
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
          <button
            type="button"
            className="inv-attention__close"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
          >
            ✕
          </button>
        </div>
      ) : null}

      <div className="inv-filters">
        <label className="inv-filters__field inv-filters__field--search">
          <span>Search</span>
          <span className="inv-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8" />
              <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={search}
              placeholder="Search by name, part number or category"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </span>
        </label>
        <label className="inv-filters__field">
          <span>Type</span>
          <select
            value={type}
            onChange={(event) => {
              setType(parseProductType(event.target.value));
              setPage(1);
            }}
          >
            <option value="ALL">All</option>
            <option value="INVENTORY">Inventory</option>
            <option value="NON_INVENTORY">Non-inventory</option>
            <option value="SERVICE">Service</option>
          </select>
        </label>
        <label className="inv-filters__field">
          <span>Stock status</span>
          <select
            value={stock}
            onChange={(event) => {
              setStock(parseStockStatus(event.target.value));
              setPage(1);
            }}
          >
            <option value="ANY">Any</option>
            <option value="IN_STOCK">In stock</option>
            <option value="LOW">Low on stock</option>
            <option value="OUT">Out of stock</option>
          </select>
        </label>
        <button
          type="button"
          className={`inv-filters__more${moreFilters ? ' is-open' : ''}`}
          aria-expanded={moreFilters}
          onClick={() => setMoreFilters((value) => !value)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 6h16l-6 7v5l-4 2v-7L4 6Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
          </svg>
          Filters
        </button>

        <div className="inv-filters__tools">
          <div className="inv-filters__tools-row">
            <ListStamp />
            <button
              type="button"
              className="list-tools__icon"
              title="Inline editing is not available yet"
              disabled
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 20h4l11-11-4-4L4 16v4ZM14 6l4 4"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="list-tools__icon"
              title={selected.length > 0 ? 'Export selected' : 'Batch actions'}
              disabled={selected.length === 0}
              onClick={download}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="list-tools__icon"
              title="Full screen"
              onClick={() => {
                const node = listRef.current;
                if (!node) return;
                if (document.fullscreenElement) void document.exitFullscreen();
                else void node.requestFullscreen();
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M9 4H4v5M15 4h5v5M9 20H4v-5M20 15v5h-5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="list-tools__icon"
              title="Print"
              onClick={() => window.print()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7v-6Z"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="list-tools__icon"
              title={selected.length > 0 ? 'Export selected' : 'Export'}
              onClick={download}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 4v11M8 11l4 4 4-4M5 19h14"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <button
            type="button"
            className="list-tools__customise-btn"
            onClick={() => setCustomise(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 7h16M4 12h16M4 17h16M8 7V4M14 12V9M11 17v-3"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
            Customize
          </button>
        </div>
      </div>

      {moreFilters ? (
        <div className="inv-filters__drawer">
          <label className="customise__check">
            <input
              type="checkbox"
              checked={inactive}
              onChange={(event) => setInactive(event.target.checked)}
            />
            Include inactive products
          </label>
          <label className="customise__check">
            <input
              type="checkbox"
              checked={view.groupBy === 'category'}
              onChange={(event) =>
                update({ ...view, groupBy: event.target.checked ? 'category' : null })
              }
            />
            Group by category
          </label>
        </div>
      ) : null}

      {selected.length > 0 ? (
        <div className="inv-selection">
          <span>{selected.length} selected</span>
          <button type="button" className="button button--small" onClick={download}>
            Export selected
          </button>
          <button type="button" className="button button--small" onClick={() => setSelected([])}>
            Clear
          </button>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? 'No products or services yet' : 'No results found'}
          description={
            rows.length === 0
              ? 'Add what you sell and what you stock, and this list fills itself.'
              : 'Try a different search or clear the filters.'
          }
          action={
            rows.length === 0 && mayManage && onCreate ? (
              <button type="button" className="button button--primary" onClick={onCreate}>
                New product/service
              </button>
            ) : null
          }
        />
      ) : (
        <div
          className={`inv-table${view.rowHeight === 'compact' ? ' inv-table--compact' : ''}${
            view.alternateRows ? ' inv-table--striped' : ''
          }`}
        >
          <table>
            <thead>
              <tr>
                <th className="inv-table__pick">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={
                      visible.length > 0 && visible.every((row) => selected.includes(row.id))
                    }
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...new Set([...selected, ...visible.map((row) => row.id)])]
                          : selected.filter((id) => !visible.some((row) => row.id === id)),
                      )
                    }
                  />
                </th>
                {columns.map((column) => (
                  <th
                    key={column.id}
                    className={`${column.numeric ? 'numeric' : ''}${
                      column.id === 'actions' ? ' inv-table__actions' : ''
                    }`}
                    aria-sort={
                      view.sortBy === column.id
                        ? view.sortDir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                  >
                    {column.fixed ? (
                      column.label
                    ) : (
                      <button type="button" onClick={() => toggleSort(column.id)}>
                        {column.label}
                        {view.sortBy === column.id ? (
                          <span aria-hidden="true">{view.sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
                        ) : null}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const group = row.category ?? 'Uncategorized';
                const heading = grouped && group !== lastGroup ? group : null;
                lastGroup = group;
                return (
                  <Fragment key={row.id}>
                    {heading ? (
                      <tr className="inv-table__group">
                        <td colSpan={columns.length + 1}>{heading}</td>
                      </tr>
                    ) : null}
                    <tr className={row.isActive ? undefined : 'is-inactive'}>
                      <td className="inv-table__pick">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.name}`}
                          checked={selected.includes(row.id)}
                          onChange={(event) =>
                            setSelected(
                              event.target.checked
                                ? [...selected, row.id]
                                : selected.filter((id) => id !== row.id),
                            )
                          }
                        />
                      </td>
                      {columns.map((column) => (
                        <td
                          key={column.id}
                          className={`${column.numeric ? 'numeric' : ''}${
                            column.id === 'actions' ? ' inv-table__actions' : ''
                          }`}
                        >
                          {column.id === 'actions'
                            ? renderActions(row, { mayManage, mayAdjust, mayPurchase })
                            : renderCell(row, column.id, currency, mayManage)}
                        </td>
                      ))}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="inv-pager">
        <span>{pagerLabel(filtered.length, current, view.rowsPerPage)}</span>
        <div className="inv-pager__nav">
          <button
            type="button"
            aria-label="Previous page"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
          >
            ‹
          </button>
          <span>
            Page {current} of {pages}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={current >= pages}
            onClick={() => setPage(current + 1)}
          >
            ›
          </button>
        </div>
      </footer>

      <CustomiseDrawer
        open={customise}
        onClose={() => setCustomise(false)}
        columns={PRODUCT_COLUMNS}
        view={view}
        onChange={update}
      >
        <label className="customise__check customise__check--disabled">
          <input type="checkbox" disabled />
          Enable inline editing
        </label>
        <label className="customise__check">
          <input
            type="checkbox"
            checked={view.groupBy === 'category'}
            onChange={(event) =>
              update({ ...view, groupBy: event.target.checked ? 'category' : null })
            }
          />
          Group by category
        </label>
      </CustomiseDrawer>
    </section>
  );
}

/** Rendered after mount so the server and the client agree on the markup. */
function ListStamp() {
  const [stamp, setStamp] = useState<string | null>(null);
  useEffect(() => setStamp('Updated less than a minute ago'), []);
  return <span className="inv-stamp">{stamp}</span>;
}

function sortValue(row: CatalogueRow, columnId: string): string | number {
  switch (columnId) {
    case 'qtyOnHand':
      return Number(row.qtyOnHand);
    case 'qtyOnPo':
      return Number(row.qtyOnPo);
    case 'qtyOnSo':
      return Number(row.qtyOnSo);
    case 'qtyAvailable':
      return Number(row.qtyAvailable);
    case 'price':
      return Number(row.price ?? 0);
    case 'cost':
      return Number(row.cost ?? 0);
    case 'reorderPoint':
      return Number(row.reorderPoint ?? 0);
    default:
      return String(plainCell(row, columnId)).toLowerCase();
  }
}

function plainCell(row: CatalogueRow, columnId: string): string {
  switch (columnId) {
    case 'name':
      return row.name;
    case 'salesDescription':
      return row.salesDescription ?? '';
    case 'purchaseDescription':
      return row.purchaseDescription ?? '';
    case 'qtyOnHand':
      return row.isStocked ? row.qtyOnHand : '';
    case 'qtyOnPo':
      return row.qtyOnPo;
    case 'qtyOnSo':
      return row.qtyOnSo;
    case 'qtyAvailable':
      return row.isStocked ? row.qtyAvailable : '';
    case 'category':
      return row.category ?? 'Uncategorized';
    case 'sku':
      return row.sku;
    case 'type':
      return itemTypeLabel(row.itemType);
    case 'price':
      return row.price ?? '';
    case 'cost':
      return row.cost ?? '';
    case 'incomeAccount':
      return row.incomeAccount ?? '';
    case 'expenseAccount':
      return row.expenseAccount ?? '';
    case 'inventoryAccount':
      return row.inventoryAccount ?? '';
    case 'reorderPoint':
      return row.reorderPoint ?? '';
    case 'preferredSupplier':
      return row.preferredSupplier ?? '';
    default:
      return '';
  }
}

function renderCell(row: CatalogueRow, columnId: string, currency: string, mayManage: boolean) {
  switch (columnId) {
    case 'name':
      return (
        <span className="inv-product">
          <span className="inv-product__thumb" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect
                x="3"
                y="5"
                width="18"
                height="14"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path d="m5 16 4-4 3 3 3-3 4 4" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </span>
          {mayManage ? (
            <Link href={`/inventory/items/${row.id}/edit`}>{row.name}</Link>
          ) : (
            <span>{row.name}</span>
          )}
        </span>
      );
    case 'qtyOnHand': {
      if (!row.isStocked) return <span className="cell-muted">—</span>;
      const alert = stockAlertOf(row);
      return (
        <span className="inv-qty">
          <Quantity value={row.qtyOnHand} />
          {alert === 'out' ? <Badge tone="danger">OUT</Badge> : null}
          {alert === 'low' ? <Badge tone="warning">LOW</Badge> : null}
        </span>
      );
    }
    case 'qtyOnPo':
      return <Quantity value={row.qtyOnPo} />;
    case 'qtyOnSo':
      return <Quantity value={row.qtyOnSo} />;
    case 'qtyAvailable':
      return row.isStocked ? (
        <Quantity value={row.qtyAvailable} />
      ) : (
        <span className="cell-muted">—</span>
      );
    case 'price':
      return <Amount value={row.price} currency={currency} />;
    case 'cost':
      return <Amount value={row.cost} currency={currency} />;
    case 'reorderPoint':
      return row.reorderPoint ? (
        <Quantity value={row.reorderPoint} />
      ) : (
        <span className="cell-muted">—</span>
      );
    default: {
      const text = plainCell(row, columnId);
      return text === '' ? <span className="cell-muted">—</span> : text;
    }
  }
}

function renderActions(
  row: CatalogueRow,
  permissions: { mayManage: boolean; mayAdjust: boolean; mayPurchase: boolean },
) {
  const items: Array<{ label: string; href: string }> = [];
  if (permissions.mayManage) {
    items.push({ label: 'Edit', href: `/inventory/items/${row.id}/edit` });
  }
  if (row.isStocked && permissions.mayAdjust) {
    items.push({ label: 'Adjust quantity', href: `/inventory/adjustments/new?itemId=${row.id}` });
  }
  if (row.isStocked && permissions.mayPurchase) {
    items.push({
      label: 'Reorder',
      href: `/purchasing/orders/new?itemId=${row.id}&qty=${row.reorderPoint ?? '1'}`,
    });
  }
  items.push({ label: 'Run report', href: `/inventory/ledger?itemId=${row.id}` });

  return (
    <RowAction
      label={permissions.mayManage ? 'Edit' : 'Run report'}
      href={
        permissions.mayManage
          ? `/inventory/items/${row.id}/edit`
          : `/inventory/ledger?itemId=${row.id}`
      }
      items={items}
    />
  );
}
