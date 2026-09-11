'use client';

import { useRouter } from 'next/navigation';
import { queryString } from '@/lib/payables';
import type { HubOverviewRange } from '@/lib/customer-hub';

export function HubRangeSelect({ range }: { range: HubOverviewRange }) {
  const router = useRouter();

  return (
    <label className="hub-funnel__range">
      <select
        aria-label="Funnel date range"
        value={range}
        onChange={(event) => {
          const next = event.target.value as HubOverviewRange;
          router.push(`/customers${queryString({ range: next === 'last12' ? undefined : next })}`);
        }}
      >
        <option value="last12">Last 365 days</option>
        <option value="thisYear">This year</option>
      </select>
    </label>
  );
}
