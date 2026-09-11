'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { setEmployeeStatusAction } from '@/server/actions/team';
import type { EmployeeStatus } from '@/server/modules/team/schemas';

export function EmployeeActions({
  employeeId,
  status,
}: {
  employeeId: string;
  status: EmployeeStatus;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  function changeStatus(next: EmployeeStatus) {
    setOpen(false);
    setError(null);
    startTransition(async () => {
      const result = await setEmployeeStatusAction({ employeeId, status: next });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const statusChanges: Array<{ label: string; next: EmployeeStatus }> = [];
  if (status !== 'ACTIVE') statusChanges.push({ label: 'Mark as active', next: 'ACTIVE' });
  if (status === 'ACTIVE') statusChanges.push({ label: 'Put on leave', next: 'ON_LEAVE' });
  if (status !== 'INACTIVE' && status !== 'TERMINATED') {
    statusChanges.push({ label: 'Make inactive', next: 'INACTIVE' });
  }
  if (status !== 'TERMINATED') {
    statusChanges.push({ label: 'End employment', next: 'TERMINATED' });
  }

  return (
    <div className="emp-actions" ref={rootRef}>
      {error ? (
        <p className="emp-actions__error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="button button--primary emp-actions__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={pending}
        onClick={() => setOpen((value) => !value)}
      >
        {pending ? 'Saving…' : 'Actions'}
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="emp-actions__panel" role="menu">
          <Link href={`/team/employees/${employeeId}/edit`} role="menuitem">
            Edit employee
          </Link>
          {statusChanges.map((change) => (
            <button
              key={change.next}
              type="button"
              role="menuitem"
              onClick={() => changeStatus(change.next)}
            >
              {change.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
