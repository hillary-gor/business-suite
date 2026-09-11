'use client';

import { useRouter } from 'next/navigation';
import {
  PO_LIST_RANGE_OPTIONS,
  poListQueryString,
  type PoListQuery,
  type PoListRange,
} from '@/lib/purchase-orders';

export function PoFilters({
  query,
  suppliers,
}: {
  query: PoListQuery;
  suppliers: ReadonlyArray<{ id: string; legal_name: string }>;
}) {
  const router = useRouter();

  function go(patch: Partial<PoListQuery>) {
    router.push(
      `/purchasing/orders${poListQueryString({
        ...query,
        ...patch,
        page: 1,
      })}`,
    );
  }

  return (
    <div className="filter-bar">
      <label className="field">
        Supplier
        <select
          value={query.supplierId ?? ''}
          aria-label="Supplier"
          onChange={(event) => go({ supplierId: event.target.value || undefined })}
        >
          <option value="">All</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.legal_name}
            </option>
          ))}
        </select>
      </label>
      <label className="field field--calendar">
        Purchase Order Date
        <span className="field--calendar__control">
          <select
            value={query.range}
            aria-label="Purchase Order Date"
            onChange={(event) => go({ range: event.target.value as PoListRange })}
          >
            {PO_LIST_RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect
              x="4"
              y="6"
              width="16"
              height="14"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.75"
            />
            <path
              d="M8 4v4M16 4v4M4 10h16"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </label>
    </div>
  );
}
