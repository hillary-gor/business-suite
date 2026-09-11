'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ColumnToggles, MenuButton, SplitMenu } from '@/components/lists/list-chrome';
import {
  SALES_TXN_COLUMNS_KEY,
  SALES_TXN_PAGE_SIZES,
  SALES_TXN_ROWS_KEY,
  SALES_TXN_TOGGLE_COLUMNS,
  SALES_TXN_TYPES,
  parseSalesTxnHidden,
  parseSalesTxnPageSize,
  salesTxnQueryString,
  salesTxnTypeLabel,
  type SalesTxnColumnId,
  type SalesTxnPageSize,
  type SalesTxnQuery,
  type SalesTxnRange,
  type SalesTxnStatusFilter,
  type SalesTxnTypeFilter,
} from '@/lib/sales-transactions';

const STUB = 'Not in this version';
const PERM = 'You do not have permission';

export function TransactionsToolbar({
  query,
  mayInvoice,
  mayPay,
}: {
  query: SalesTxnQuery;
  mayInvoice: boolean;
  mayPay: boolean;
}) {
  const router = useRouter();
  const primaryHref = mayInvoice
    ? '/sales/invoices/new'
    : mayPay
      ? '/sales/payments/new'
      : undefined;

  function go(patch: Partial<SalesTxnQuery>) {
    router.push(
      `/sales/transactions${salesTxnQueryString({
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
            Type
            <select
              value={query.type}
              aria-label="Type"
              onChange={(event) => go({ type: event.target.value as SalesTxnTypeFilter })}
            >
              <option value="all">All transactions</option>
              {SALES_TXN_TYPES.map((kind) => (
                <option key={kind} value={kind}>
                  {salesTxnTypeLabel(kind)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Date
            <select
              value={query.range}
              aria-label="Date"
              onChange={(event) => go({ range: event.target.value as SalesTxnRange })}
            >
              <option value="last3">Last 3 months</option>
              <option value="thisMonth">This month</option>
              <option value="last12">Last 12 months</option>
              <option value="all">All dates</option>
            </select>
          </label>
          <form
            className="list-search"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              go({ q: String(data.get('q') ?? '').trim() || undefined });
            }}
          >
            <input
              type="search"
              name="q"
              defaultValue={query.q ?? ''}
              placeholder="Search"
              aria-label="Search"
            />
          </form>
        </div>
        <SplitMenu
          label="New transaction"
          href={primaryHref}
          primary
          items={[
            {
              label: 'Invoice',
              href: '/sales/invoices/new',
              disabled: !mayInvoice,
              title: mayInvoice ? undefined : PERM,
            },
            { label: 'Import invoices', disabled: true, title: STUB },
            {
              label: 'Payment',
              href: '/sales/payments/new',
              disabled: !mayPay,
              title: mayPay ? undefined : PERM,
            },
            {
              label: 'Estimate',
              href: '/sales/estimates/new',
              disabled: !mayInvoice,
              title: mayInvoice ? undefined : PERM,
            },
            {
              label: 'Sales Receipt',
              href: '/sales/receipts/new',
              disabled: !mayInvoice,
              title: mayInvoice ? undefined : PERM,
            },
            {
              label: 'Credit Note',
              href: '/sales/credit-notes/new',
              disabled: !mayInvoice,
              title: mayInvoice ? undefined : PERM,
            },
            {
              label: 'Refund Receipt',
              href: '/sales/refunds/new',
              disabled: !mayPay,
              title: mayPay ? undefined : PERM,
            },
            { label: 'Delayed Credit', disabled: true, title: STUB },
            { label: 'Delayed Charge', disabled: true, title: STUB },
            { label: 'Time Activity', disabled: true, title: STUB },
            {
              label: 'Sales Order',
              href: '/sales/orders/new',
              disabled: !mayInvoice,
              title: mayInvoice ? undefined : PERM,
            },
          ]}
        />
      </div>
      <div className="txn-toolbar__sub">
        <label className="field field--inline">
          <select
            value={query.status}
            aria-label="Status"
            onChange={(event) => go({ status: event.target.value as SalesTxnStatusFilter })}
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="draft">Draft</option>
          </select>
        </label>
        <span className="txn-toolbar__stub" title={STUB}>
          Delivery method
        </span>
        <span className="txn-toolbar__stub" title={STUB}>
          Errors
        </span>
      </div>
    </div>
  );
}

export function TransactionsTableTools({
  query,
  csv,
  filename,
  mayReports,
  mayStatements,
}: {
  query: SalesTxnQuery;
  csv: string;
  filename: string;
  mayReports: boolean;
  mayStatements: boolean;
}) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsId = useId();
  const hiddenSet = new Set(query.hidden);

  useEffect(() => {
    if (!settingsOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false);
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

  function push(next: SalesTxnQuery) {
    try {
      window.localStorage.setItem(SALES_TXN_COLUMNS_KEY, JSON.stringify(next.hidden));
      window.localStorage.setItem(SALES_TXN_ROWS_KEY, String(next.rows));
    } catch {
      // Preference storage is optional.
    }
    router.push(`/sales/transactions${salesTxnQueryString(next)}`);
  }

  function toggleColumn(id: string) {
    const hidden = hiddenSet.has(id)
      ? query.hidden.filter((item) => item !== id)
      : [...query.hidden, id];
    push({ ...query, hidden });
  }

  function download() {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="list-tools txn-table-tools">
      <button type="button" className="list-tools__icon" title="Export" onClick={download}>
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
      <div className="list-tools__customise" ref={settingsRef}>
        <button
          type="button"
          className="list-tools__icon"
          title="Settings"
          aria-label="Column and row settings"
          aria-expanded={settingsOpen}
          aria-controls={settingsId}
          onClick={() => setSettingsOpen((value) => !value)}
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
        {settingsOpen ? (
          <div className="list-tools__panel txn-settings" id={settingsId}>
            <p className="txn-settings__heading">Columns</p>
            <ColumnToggles
              columns={[...SALES_TXN_TOGGLE_COLUMNS]}
              hidden={hiddenSet}
              onToggle={toggleColumn}
            />
            <p className="txn-settings__heading">Rows</p>
            <div className="txn-settings__rows">
              {SALES_TXN_PAGE_SIZES.map((size) => (
                <label key={size}>
                  <input
                    type="radio"
                    name="txn-rows"
                    checked={query.rows === size}
                    onChange={() => push({ ...query, rows: size as SalesTxnPageSize, page: 1 })}
                  />
                  {size}
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <QuickLinksMenu mayReports={mayReports} mayStatements={mayStatements} />
    </div>
  );
}

export function TransactionsPrefsSync({ query }: { query: SalesTxnQuery }) {
  const router = useRouter();

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const hasHidden = url.searchParams.has('hidden');
      const hasRows = url.searchParams.has('rows');
      if (hasHidden && hasRows) return;

      const storedHidden = hasHidden
        ? query.hidden
        : parseSalesTxnHiddenFromStorage(window.localStorage.getItem(SALES_TXN_COLUMNS_KEY));
      const storedRows = hasRows
        ? query.rows
        : parseSalesTxnPageSize(window.localStorage.getItem(SALES_TXN_ROWS_KEY) ?? undefined);

      const sameHidden = [...storedHidden].sort().join(',') === [...query.hidden].sort().join(',');
      if (sameHidden && storedRows === query.rows) return;
      router.replace(
        `/sales/transactions${salesTxnQueryString({
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

function QuickLinksMenu({
  mayReports,
  mayStatements,
}: {
  mayReports: boolean;
  mayStatements: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = [
    { label: 'Deleted transactions', href: undefined as string | undefined, title: STUB },
    {
      label: 'Accounts receivable ageing summary',
      href: mayReports ? '/reports/aged-receivables' : undefined,
      title: mayReports ? undefined : PERM,
    },
    { label: 'Customer balance summary', href: undefined, title: STUB },
    { label: 'Sales by customer summary', href: undefined, title: STUB },
    {
      label: 'Statement list report',
      href: mayStatements ? '/sales/statements' : undefined,
      title: mayStatements ? undefined : PERM,
    },
  ];

  return (
    <div className="split-menu" ref={rootRef}>
      <button
        type="button"
        className="list-tools__icon"
        title="Quick links"
        aria-label="Quick links"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="5" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="19" r="1.6" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div className="split-menu__panel" id={menuId} role="menu">
          {items.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                className="split-menu__item"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ) : (
              <span
                key={item.label}
                className="split-menu__item split-menu__item--disabled"
                title={item.title}
              >
                {item.label}
              </span>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function parseSalesTxnHiddenFromStorage(raw: string | null): SalesTxnColumnId[] {
  if (!raw) return parseSalesTxnHidden(undefined);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parseSalesTxnHidden(parsed.filter((id) => typeof id === 'string').join(','));
    }
  } catch {
    return parseSalesTxnHidden(undefined);
  }
  return parseSalesTxnHidden(undefined);
}
