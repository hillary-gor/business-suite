'use client';

import { useRouter } from 'next/navigation';
import {
  supplierQueryString,
  type SupplierDateRange,
  type SupplierQuery,
  type SupplierSort,
} from '@/lib/supplier-hub';
import type { ExpenseKind } from '@/lib/payables';

export function SupplierRailControls({
  supplierId,
  query,
}: {
  supplierId: string;
  query: SupplierQuery;
}) {
  const router = useRouter();

  function go(patch: Partial<SupplierQuery>) {
    router.push(
      `/purchasing/vendors/${supplierId}${supplierQueryString({
        ...query,
        ...patch,
        page: 1,
      })}`,
    );
  }

  return (
    <div className="party-rail__controls">
      <label className="party-rail__search">
        <span className="sr-only">Search</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="6.25" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M16 16.5 20 20.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
        <input
          type="search"
          placeholder="Search"
          defaultValue={query.q ?? ''}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            go({ q: (event.target as HTMLInputElement).value.trim() || undefined });
          }}
        />
      </label>
      <label className="party-rail__sort">
        <span className="sr-only">Sort suppliers</span>
        <select
          value={query.sort}
          onChange={(event) => go({ sort: event.target.value as SupplierSort })}
        >
          <option value="name">Sort by name</option>
          <option value="balance">Sort by balance</option>
        </select>
      </label>
    </div>
  );
}

export function SupplierTxnToolbar({
  supplierId,
  query,
}: {
  supplierId: string;
  query: SupplierQuery;
}) {
  const router = useRouter();

  function go(patch: Partial<SupplierQuery>) {
    router.push(
      `/purchasing/vendors/${supplierId}${supplierQueryString({
        ...query,
        ...patch,
        page: 1,
      })}`,
    );
  }

  return (
    <div className="party-txn-filters">
      <label className="field">
        <span className="sr-only">Transaction type</span>
        <select
          value={query.kind}
          aria-label="Transaction type"
          onChange={(event) => go({ kind: event.target.value as ExpenseKind })}
        >
          <option value="all">All transactions</option>
          <option value="purchase_order">Purchase orders</option>
          <option value="bill">Bills</option>
          <option value="expense">Expenses</option>
          <option value="item_receipt">Item receipts</option>
          <option value="payment">Payments</option>
          <option value="credit">Supplier credits</option>
        </select>
      </label>
      <label className="field">
        <span className="sr-only">Dates</span>
        <select
          value={query.range}
          aria-label="Dates"
          onChange={(event) => go({ range: event.target.value as SupplierDateRange })}
        >
          <option value="last12">Last 12 months</option>
          <option value="thisYear">This year</option>
          <option value="all">All dates</option>
        </select>
      </label>
    </div>
  );
}
