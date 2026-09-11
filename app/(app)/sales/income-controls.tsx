'use client';

import { useRouter } from 'next/navigation';
import { queryString } from '@/lib/payables';
import { parseSalesIncomeRange, type SalesIncomeRange } from '@/lib/sales-overview';

export function SalesIncomeControls({
  range,
  compare,
}: {
  range: SalesIncomeRange;
  compare: boolean;
}) {
  const router = useRouter();

  function push(next: { income?: SalesIncomeRange; compare?: boolean }) {
    const income = next.income ?? range;
    const on = next.compare ?? compare;
    router.push(
      `/sales${queryString({
        income: income === 'thisMonth' ? undefined : income,
        compare: on ? '1' : undefined,
      })}`,
    );
  }

  return (
    <div className="sales-ov__income-controls">
      <label className="sales-ov__duration">
        Duration:
        <select
          aria-label="Income duration"
          value={range}
          onChange={(event) => push({ income: parseSalesIncomeRange(event.target.value) })}
        >
          <option value="thisMonth">This month</option>
          <option value="lastMonth">Last month</option>
          <option value="thisQuarter">This quarter</option>
          <option value="thisYear">This year</option>
        </select>
      </label>
      <span>Compare to previous year</span>
      <button
        type="button"
        className={`prefs-switch${compare ? ' is-on' : ''}`}
        role="switch"
        aria-checked={compare}
        aria-label="Compare to previous year"
        onClick={() => push({ compare: !compare })}
      >
        <span className="prefs-switch__thumb" />
      </button>
    </div>
  );
}
