'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ColumnToggles, MenuButton, SplitMenu } from '@/components/lists/list-chrome';
import {
  INVOICE_LIST_COLUMNS_KEY,
  INVOICE_LIST_PAGE_SIZES,
  INVOICE_LIST_RANGE_OPTIONS,
  INVOICE_LIST_ROWS_KEY,
  INVOICE_LIST_TOGGLE_COLUMNS,
  invoiceListQueryString,
  parseInvoiceListHidden,
  parseInvoiceListPageSize,
  type InvoiceListColumnId,
  type InvoiceListPageSize,
  type InvoiceListQuery,
  type InvoiceListRange,
  type InvoiceListStatus,
} from '@/lib/sales-invoices';

const STUB = 'Not in this version';
const PERM = 'You do not have permission';

export function InvoicesToolbar({
  query,
  mayCreate,
}: {
  query: InvoiceListQuery;
  mayCreate: boolean;
}) {
  const router = useRouter();

  function go(patch: Partial<InvoiceListQuery>) {
    router.push(
      `/sales/invoices${invoiceListQueryString({
        ...query,
        ...patch,
        page: patch.page ?? 1,
      })}`,
    );
  }

  return (
    <div className="txn-toolbar">
      <div className="txn-toolbar__row">
        <div className="txn-toolbar__filters">
          <MenuButton
            label="Batch actions"
            items={[{ label: 'Print selected', disabled: true, title: STUB }]}
          />
          <label className="field">
            Status
            <select
              value={query.status}
              aria-label="Status"
              onChange={(event) => go({ status: event.target.value as InvoiceListStatus })}
            >
              <option value="all">All</option>
              <option value="needs_attention">Needs attention</option>
              <optgroup label="Unpaid">
                <option value="unpaid">Unpaid</option>
                <option value="overdue">Overdue</option>
                <option value="not_due">Not due</option>
              </optgroup>
              <optgroup label="Paid">
                <option value="paid">Paid</option>
                <option value="not_deposited">Not deposited</option>
                <option value="deposited">Deposited</option>
              </optgroup>
            </select>
          </label>
          <label className="field">
            Date
            <select
              value={query.range}
              aria-label="Date"
              onChange={(event) => go({ range: event.target.value as InvoiceListRange })}
            >
              {INVOICE_LIST_RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {mayCreate ? (
          <SplitMenu
            label="Create invoice"
            href="/sales/invoices/new"
            primary
            items={[{ label: 'Import invoices', disabled: true, title: STUB }]}
          />
        ) : (
          <button type="button" className="button button--primary" disabled title={PERM}>
            Create invoice
          </button>
        )}
      </div>
    </div>
  );
}

export function InvoiceTableTools({ query }: { query: InvoiceListQuery }) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const settingsRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const settingsId = useId();
  const hiddenSet = new Set(query.hidden);

  useLayoutEffect(() => {
    if (!settingsOpen) return;

    function place() {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = panelRef.current?.offsetWidth ?? 220;
      const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
      const top = Math.min(rect.bottom + 6, window.innerHeight - 8);
      setPanelPos({ top, left });
    }

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (settingsRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);

  function push(next: InvoiceListQuery) {
    try {
      window.localStorage.setItem(INVOICE_LIST_COLUMNS_KEY, JSON.stringify(next.hidden));
      window.localStorage.setItem(INVOICE_LIST_ROWS_KEY, String(next.rows));
    } catch {
      // Preference storage is optional.
    }
    router.push(`/sales/invoices${invoiceListQueryString(next)}`);
  }

  function toggleColumn(id: string) {
    const column = INVOICE_LIST_TOGGLE_COLUMNS.find((item) => item.id === id);
    if (!column) return;
    const hidden = hiddenSet.has(column.id)
      ? query.hidden.filter((item) => item !== column.id)
      : [...query.hidden, column.id];
    push({ ...query, hidden });
  }

  return (
    <div className="list-tools txn-table-tools">
      <div className="list-tools__customise" ref={settingsRef}>
        <button
          ref={buttonRef}
          type="button"
          className="list-tools__icon"
          title="Settings"
          aria-label="Column and row settings"
          aria-expanded={settingsOpen}
          aria-controls={settingsId}
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            setPanelPos({
              top: rect.bottom + 6,
              left: Math.max(8, rect.right - 220),
            });
            setSettingsOpen((value) => !value);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
            <path
              d="M19.4 13.5a7.8 7.8 0 0 0 .1-1.5 7.8 7.8 0 0 0-.1-1.5l2-1.5-2-3.5-2.4 1a7.4 7.4 0 0 0-2.6-1.5L14 2h-4l-.4 2.5A7.4 7.4 0 0 0 7 6l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0-.1 1.5c0 .5 0 1 .1 1.5l-2 1.5 2 3.5 2.4-1a7.4 7.4 0 0 0 2.6 1.5L10 22h4l.4-2.5a7.4 7.4 0 0 0 2.6-1.5l2.4 1 2-3.5-2-1.5Z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {settingsOpen && typeof document !== 'undefined'
          ? createPortal(
              <div
                ref={panelRef}
                className="list-tools__panel txn-settings txn-settings--float"
                id={settingsId}
                style={{ top: panelPos.top, left: panelPos.left }}
              >
                <p className="txn-settings__heading">Columns</p>
                <ColumnToggles
                  columns={[...INVOICE_LIST_TOGGLE_COLUMNS]}
                  hidden={hiddenSet}
                  onToggle={toggleColumn}
                />
                <p className="txn-settings__heading">Rows</p>
                <div className="txn-settings__rows">
                  {INVOICE_LIST_PAGE_SIZES.map((size) => (
                    <label key={size}>
                      <input
                        type="radio"
                        name="invoice-rows"
                        checked={query.rows === size}
                        onChange={() =>
                          push({ ...query, rows: size as InvoiceListPageSize, page: 1 })
                        }
                      />
                      {size}
                    </label>
                  ))}
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}

export function InvoicePrefsSync({ query }: { query: InvoiceListQuery }) {
  const router = useRouter();

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const hasHidden = url.searchParams.has('hidden');
      const hasRows = url.searchParams.has('rows');
      if (hasHidden && hasRows) return;

      const storedHidden = hasHidden
        ? query.hidden
        : parseInvoiceListHiddenFromStorage(window.localStorage.getItem(INVOICE_LIST_COLUMNS_KEY));
      const storedRows = hasRows
        ? query.rows
        : parseInvoiceListPageSize(window.localStorage.getItem(INVOICE_LIST_ROWS_KEY) ?? undefined);

      const sameHidden = [...storedHidden].sort().join(',') === [...query.hidden].sort().join(',');
      if (sameHidden && storedRows === query.rows) return;
      router.replace(
        `/sales/invoices${invoiceListQueryString({
          ...query,
          hidden: storedHidden,
          rows: storedRows,
          page: 1,
        })}`,
      );
    } catch {
      // Ignore blocked storage.
    }
  }, [query, router]);

  return null;
}

function parseInvoiceListHiddenFromStorage(raw: string | null): InvoiceListColumnId[] {
  if (!raw) return parseInvoiceListHidden(undefined);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parseInvoiceListHidden(parsed.filter((id) => typeof id === 'string').join(','));
    }
  } catch {
    return parseInvoiceListHidden(undefined);
  }
  return parseInvoiceListHidden(undefined);
}
