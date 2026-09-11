/**
 * Employee presentation helpers.
 *
 * The employee list filters and searches in the browser rather than round
 * tripping to the server: a company has tens or hundreds of employees, not
 * hundreds of thousands, and typing a name should not wait on a query.
 */
import type { EmployeeGender, EmployeeStatus } from '@/server/modules/team/schemas';

export type EmployeeFilter = 'active' | 'inactive' | 'all';

const STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: 'Active',
  ON_LEAVE: 'On leave',
  INACTIVE: 'Inactive',
  TERMINATED: 'No longer employed',
};

const GENDER_LABELS: Record<EmployeeGender, string> = {
  FEMALE: 'Female',
  MALE: 'Male',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
};

export function employeeStatusLabel(status: EmployeeStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function employeeGenderLabel(gender: EmployeeGender | null): string | null {
  return gender ? (GENDER_LABELS[gender] ?? gender) : null;
}

/** Active is a single status; everything else is some flavour of gone. */
export function employeeStatusTone(status: EmployeeStatus): 'success' | 'warning' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'ON_LEAVE') return 'warning';
  return 'neutral';
}

export function parseEmployeeFilter(raw: string | undefined): EmployeeFilter {
  return raw === 'inactive' || raw === 'all' ? raw : 'active';
}

export function employeeFilterLabel(filter: EmployeeFilter): string {
  if (filter === 'inactive') return 'Inactive employees';
  if (filter === 'all') return 'All employees';
  return 'Active employees';
}

export function matchesEmployeeFilter(status: EmployeeStatus, filter: EmployeeFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return status === 'ACTIVE';
  return status !== 'ACTIVE';
}

export function matchesEmployeeSearch(
  employee: {
    displayName: string;
    email: string | null;
    phone: string | null;
    employeeNo: string | null;
    jobTitle: string | null;
  },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [
    employee.displayName,
    employee.email,
    employee.phone,
    employee.employeeNo,
    employee.jobTitle,
  ].some((value) => value !== null && value.toLowerCase().includes(needle));
}

/** The letter in the avatar circle. Falls back rather than rendering blank. */
export function employeeInitial(displayName: string): string {
  const first = displayName.trim()[0];
  return first ? first.toUpperCase() : '?';
}
