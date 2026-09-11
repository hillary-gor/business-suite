'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ColumnToggles, ListTools } from '@/components/lists/list-chrome';

export function ColumnTable({
  tableId,
  filename,
  csv,
  columns,
  leading,
  children,
}: {
  tableId: string;
  filename: string;
  csv: string;
  columns: ReadonlyArray<{ id: string; label: string }>;
  leading?: ReactNode;
  children: ReactNode;
}) {
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(`skyjet.columns.${tableId}`);
      if (stored) setHidden(JSON.parse(stored) as string[]);
    } catch {
      setHidden([]);
    }
  }, [tableId]);

  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const hideClass = hidden.map((id) => `is-hide-${id}`).join(' ');

  function toggle(id: string) {
    setHidden((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      window.localStorage.setItem(`skyjet.columns.${tableId}`, JSON.stringify(next));
      return next;
    });
  }

  return (
    <>
      <div className="list-toolbar">
        <div className="list-toolbar__leading">{leading}</div>
        <ListTools filename={filename} csv={csv}>
          <ColumnToggles columns={columns} hidden={hiddenSet} onToggle={toggle} />
        </ListTools>
      </div>
      <div className={`col-table ${hideClass}`}>{children}</div>
    </>
  );
}
