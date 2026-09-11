'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  employeeInitial,
  employeeStatusLabel,
  matchesEmployeeFilter,
  matchesEmployeeSearch,
  type EmployeeFilter,
} from '@/lib/team';
import type { EmployeeRow } from '@/server/modules/team/employees';

const COLUMNS = [
  { id: 'email', label: 'Email address' },
  { id: 'phone', label: 'Phone number' },
  { id: 'role', label: 'Job title' },
  { id: 'status', label: 'Status' },
] as const;

const COLUMN_PREFS_KEY = 'skyjet.columns.employees';

export function EmployeeList({
  employees,
  mayManage,
}: {
  employees: readonly EmployeeRow[];
  mayManage: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<EmployeeFilter>('active');
  const [descending, setDescending] = useState(false);
  const [hidden, setHidden] = useState<string[]>(['role']);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLUMN_PREFS_KEY);
      if (stored) setHidden(JSON.parse(stored) as string[]);
    } catch {
      setHidden(['role']);
    }
  }, []);

  function toggleColumn(id: string) {
    setHidden((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      window.localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(next));
      return next;
    });
  }

  const visible = useMemo(() => {
    const rows = employees.filter(
      (employee) =>
        matchesEmployeeFilter(employee.status, filter) && matchesEmployeeSearch(employee, query),
    );
    return descending ? [...rows].reverse() : rows;
  }, [employees, filter, query, descending]);

  const hideClass = hidden.map((id) => `is-hide-${id}`).join(' ');

  return (
    <section className="emp-list">
      <div className="emp-list__toolbar">
        <div className="emp-list__filters">
          <div className="emp-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="6.2" stroke="currentColor" strokeWidth="1.75" />
              <path d="m15.6 15.6 3.9 3.9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              placeholder="Find an employee"
              aria-label="Find an employee"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="emp-list__status-filter"
            value={filter}
            aria-label="Filter by employment status"
            onChange={(event) => setFilter(event.target.value as EmployeeFilter)}
          >
            <option value="active">Active employees</option>
            <option value="inactive">Inactive employees</option>
            <option value="all">All employees</option>
          </select>
        </div>

        <div className="emp-list__actions">
          {mayManage ? (
            <Link href="/team/employees/new" className="button button--primary">
              Add an employee
            </Link>
          ) : null}
          <ColumnMenu hidden={hidden} onToggle={toggleColumn} />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="emp-list__empty">
          <p className="emp-list__empty-title">
            {employees.length === 0 ? 'No employees yet' : 'No employees match that search'}
          </p>
          <p className="emp-list__empty-body">
            {employees.length === 0
              ? 'Add the people who work here. An employee record is separate from a login: add a login under Manage users.'
              : 'Try a different name, or change the status filter.'}
          </p>
          {employees.length === 0 && mayManage ? (
            <Link href="/team/employees/new" className="button button--primary">
              Add an employee
            </Link>
          ) : null}
        </div>
      ) : (
        <div className={`emp-table-wrap ${hideClass}`}>
          <table className="emp-table">
            <thead>
              <tr>
                <th className="emp-table__avatar-col">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="8.5" r="3.4" stroke="currentColor" strokeWidth="1.6" />
                    <path
                      d="M5.5 19.5c0-3.2 2.9-5.2 6.5-5.2s6.5 2 6.5 5.2"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="sr-only">Photo</span>
                </th>
                <th>
                  <button
                    type="button"
                    className="emp-table__sort"
                    aria-label={`Sort by display name, currently ${descending ? 'Z to A' : 'A to Z'}`}
                    onClick={() => setDescending((value) => !value)}
                  >
                    Display name
                    <span aria-hidden="true">{descending ? '▼' : '▲'}</span>
                  </button>
                </th>
                <th data-col="email">Email address</th>
                <th data-col="phone">Phone number</th>
                <th data-col="role">Job title</th>
                <th data-col="status">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((employee) => (
                <tr
                  key={employee.id}
                  className="emp-table__row"
                  onClick={() => router.push(`/team/employees/${employee.id}`)}
                >
                  <td className="emp-table__avatar-col">
                    <span className="emp-avatar" aria-hidden="true">
                      {employeeInitial(employee.displayName)}
                    </span>
                  </td>
                  <td>
                    <Link
                      href={`/team/employees/${employee.id}`}
                      className="emp-table__name"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {employee.displayName}
                    </Link>
                  </td>
                  <td data-col="email">{employee.email ?? '-'}</td>
                  <td data-col="phone">{employee.phone ?? '-'}</td>
                  <td data-col="role">{employee.jobTitle ?? '-'}</td>
                  <td data-col="status">{employeeStatusLabel(employee.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ColumnMenu({
  hidden,
  onToggle,
}: {
  hidden: readonly string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="emp-columns" ref={rootRef}>
      <button
        type="button"
        className="emp-columns__trigger"
        aria-expanded={open}
        aria-label="Choose columns"
        title="Choose columns"
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M19.4 13.5a7.8 7.8 0 0 0 .1-1.5 7.8 7.8 0 0 0-.1-1.5l2-1.5-2-3.5-2.4 1a7.4 7.4 0 0 0-2.6-1.5L14 2h-4l-.4 2.5A7.4 7.4 0 0 0 7 6l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0-.1 1.5c0 .5 0 1 .1 1.5l-2 1.5 2 3.5 2.4-1a7.4 7.4 0 0 0 2.6 1.5L10 22h4l.4-2.5a7.4 7.4 0 0 0 2.6-1.5l2.4 1 2-3.5-2-1.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div className="emp-columns__panel">
          <p className="emp-columns__title">Columns</p>
          <ul>
            {COLUMNS.map((column) => (
              <li key={column.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={!hidden.includes(column.id)}
                    onChange={() => onToggle(column.id)}
                  />
                  {column.label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
