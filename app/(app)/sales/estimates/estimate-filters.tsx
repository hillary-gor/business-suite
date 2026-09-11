'use client';

import { useRouter } from 'next/navigation';
import { MenuButton } from '@/components/lists/list-chrome';
import { queryString } from '@/lib/payables';
import type { EstimateDateRange, EstimateStatusFilter } from '@/lib/customer-hub';

export function EstimateFilters({
  status,
  range,
}: {
  status: EstimateStatusFilter;
  range: EstimateDateRange;
}) {
  const router = useRouter();

  function go(next: { status?: EstimateStatusFilter; range?: EstimateDateRange }) {
    const nextStatus = next.status ?? status;
    const nextRange = next.range ?? range;
    router.push(
      `/sales/estimates${queryString({
        status: nextStatus === 'all' ? undefined : nextStatus,
        range: nextRange === 'last12' ? undefined : nextRange,
      })}`,
    );
  }

  return (
    <div className="filter-bar">
      <MenuButton label="Batch actions" items={[{ label: 'Print selected', disabled: true }]} />
      <label className="field">
        Status
        <select
          value={status}
          onChange={(event) => go({ status: event.target.value as EstimateStatusFilter })}
        >
          <option value="all">All</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>
      <label className="field">
        Date
        <select
          value={range}
          onChange={(event) => go({ range: event.target.value as EstimateDateRange })}
        >
          <option value="last12">Last 12 months</option>
          <option value="thisYear">This year</option>
          <option value="all">All dates</option>
        </select>
      </label>
    </div>
  );
}
