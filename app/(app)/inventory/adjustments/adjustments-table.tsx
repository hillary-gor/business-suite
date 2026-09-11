'use client';

import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui';
import { CustomiseDrawer } from '@/components/lists/customise-drawer';
import type { AdjustmentRow } from '@/server/modules/inventory/lists';
import { formatDisplayDate } from '@/lib/payables';
import { documentPdfPath } from '@/lib/documents/href';
import {
  ADJUSTMENT_COLUMNS,
  ADJUSTMENT_REASON_LABELS,
  ADJUSTMENT_REASONS,
  ADJUSTMENTS_VIEW_KEY,
  adjustmentDateBounds,
  adjustmentDateRangeLabel,
  adjustmentReasonLabel,
  defaultAdjustmentsView,
  matchesAdjustmentSearch,
  parseAdjustmentDateRange,
  parseAdjustmentReason,
  type AdjustmentDateRange,
  type AdjustmentReason,
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

export function AdjustmentsTable({ rows }: { rows: readonly AdjustmentRow[] }) {
  const fallback = useMemo(() => defaultAdjustmentsView(), []);
  const [view, setView] = useState<ListView>(fallback);
  const [range, setRange] = useState<AdjustmentDateRange>('ALL');
  const [reason, setReason] = useState<AdjustmentReason | 'ALL'>('ALL');
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [customise, setCustomise] = useState(false);

  useEffect(() => {
    setView(loadListView(ADJUSTMENTS_VIEW_KEY, ADJUSTMENT_COLUMNS, fallback));
  }, [fallback]);

  function update(next: ListView) {
    setView(next);
    saveListView(ADJUSTMENTS_VIEW_KEY, next);
  }

  const filtered = useMemo(() => {
    const bounds = adjustmentDateBounds(range);
    const matched = rows.filter((row) => {
      if (reason !== 'ALL' && row.reason !== reason) return false;
      if (bounds.from && row.adjustmentDate < bounds.from) return false;
      if (bounds.to && row.adjustmentDate > bounds.to) return false;
      return matchesAdjustmentSearch(row, search);
    });
    const direction = view.sortDir === 'desc' ? -1 : 1;
    return [...matched].sort((a, b) => {
      const left = sortValue(a, view.sortBy);
      const right = sortValue(b, view.sortBy);
      return String(left).localeCompare(String(right)) * direction;
    });
  }, [rows, range, reason, search, view.sortBy, view.sortDir]);

  const pages = pageCount(filtered.length, view.rowsPerPage);
  const current = Math.min(page, pages);
  const visible = pageSlice(filtered, current, view.rowsPerPage);
  const columns = visibleColumns(view, ADJUSTMENT_COLUMNS);

  function toggleSort(id: string) {
    if (id === 'actions') return;
    update(
      view.sortBy === id
        ? { ...view, sortDir: view.sortDir === 'asc' ? 'desc' : 'asc' }
        : { ...view, sortBy: id, sortDir: 'desc' },
    );
  }

  return (
    <section className="inv-list">
      <div className="inv-filters">
        <label className="inv-filters__field">
          <span>Date range</span>
          <span className="inv-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect
                x="4"
                y="5"
                width="16"
                height="15"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <path
                d="M8 3v4M16 3v4M4 10h16"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
            <select
              value={range}
              aria-label="Date range"
              onChange={(event) => {
                setRange(parseAdjustmentDateRange(event.target.value));
                setPage(1);
              }}
            >
              {(
                ['ALL', 'TODAY', 'THIS_MONTH', 'THIS_QUARTER', 'THIS_YEAR', 'LAST_365'] as const
              ).map((value) => (
                <option key={value} value={value}>
                  {value === 'ALL' ? 'Select...' : adjustmentDateRangeLabel(value)}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="inv-filters__field">
          <span>Adjustment reason</span>
          <select
            value={reason}
            aria-label="Adjustment reason"
            onChange={(event) => {
              setReason(parseAdjustmentReason(event.target.value));
              setPage(1);
            }}
          >
            <option value="ALL">All reasons</option>
            {ADJUSTMENT_REASONS.map((value) => (
              <option key={value} value={value}>
                {ADJUSTMENT_REASON_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="inv-filters__more"
          aria-label="Filters"
          onClick={() => setSearchOpen(true)}
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
        <button
          type="button"
          className={`inv-filters__more${searchOpen ? ' is-open' : ''}`}
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((value) => !value)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8" />
            <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Search
        </button>

        <div className="inv-filters__tools">
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

      {searchOpen ? (
        <div className="inv-filters__drawer">
          <label className="inv-filters__field inv-filters__field--search">
            <span>Search</span>
            <input
              type="search"
              value={search}
              placeholder="Search by reference, reason or account"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
      ) : null}

      <div
        className={`inv-table${view.rowHeight === 'compact' ? ' inv-table--compact' : ''}${
          view.alternateRows ? ' inv-table--striped' : ''
        }`}
      >
        <table>
          <thead>
            <tr>
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
            {visible.length === 0 ? (
              <tr>
                <td colSpan={Math.max(columns.length, 1)} className="inv-table__empty">
                  <EmptyState
                    title="Keep your inventory accurate"
                    description={
                      rows.length === 0
                        ? "You haven't created any inventory adjustments. Once you create an adjustment, it'll show up here."
                        : 'No adjustments match those filters.'
                    }
                  />
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.id}>
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={`${column.numeric ? 'numeric' : ''}${
                        column.id === 'actions' ? ' inv-table__actions' : ''
                      }`}
                    >
                      {renderCell(row, column.id)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
        columns={ADJUSTMENT_COLUMNS}
        view={view}
        onChange={update}
      />
    </section>
  );
}

function sortValue(row: AdjustmentRow, columnId: string): string {
  switch (columnId) {
    case 'date':
      return row.adjustmentDate;
    case 'reference':
      return row.reference;
    case 'reason':
      return adjustmentReasonLabel(row.reason);
    case 'account':
      return `${row.accountCode} ${row.accountName}`;
    case 'items':
      return row.items ?? '';
    case 'quantity':
      return row.quantity;
    default:
      return '';
  }
}

function renderCell(row: AdjustmentRow, columnId: string) {
  switch (columnId) {
    case 'date':
      return formatDisplayDate(row.adjustmentDate);
    case 'reference':
      return row.reference;
    case 'reason':
      return adjustmentReasonLabel(row.reason);
    case 'account':
      return `${row.accountCode} — ${row.accountName}`;
    case 'items':
      return row.items ?? <span className="cell-muted">—</span>;
    case 'quantity':
      return row.quantity;
    case 'actions':
      return (
        <a href={documentPdfPath('inventory-adjustment', row.id)} target="_blank" rel="noreferrer">
          Print
        </a>
      );
    default:
      return '';
  }
}
