import { describe, expect, it } from 'vitest';
import {
  employeeFilterLabel,
  employeeGenderLabel,
  employeeInitial,
  employeeStatusLabel,
  employeeStatusTone,
  matchesEmployeeFilter,
  matchesEmployeeSearch,
  parseEmployeeFilter,
} from '@/lib/team';

const lisa = {
  displayName: 'Lisa Safari',
  email: 'lisasafari208@gmail.com',
  phone: null,
  employeeNo: 'EMP-0001',
  jobTitle: 'Stores supervisor',
};

describe('employee status', () => {
  it('spells out what each status means to a reader', () => {
    expect(employeeStatusLabel('ACTIVE')).toBe('Active');
    expect(employeeStatusLabel('ON_LEAVE')).toBe('On leave');
    expect(employeeStatusLabel('TERMINATED')).toBe('No longer employed');
  });

  it('reserves the positive tone for people actually working here', () => {
    expect(employeeStatusTone('ACTIVE')).toBe('success');
    expect(employeeStatusTone('ON_LEAVE')).toBe('warning');
    expect(employeeStatusTone('INACTIVE')).toBe('neutral');
    expect(employeeStatusTone('TERMINATED')).toBe('neutral');
  });
});

describe('employeeGenderLabel', () => {
  it('leaves an unstated gender unstated rather than guessing', () => {
    expect(employeeGenderLabel(null)).toBeNull();
    expect(employeeGenderLabel('PREFER_NOT_TO_SAY')).toBe('Prefer not to say');
  });
});

describe('parseEmployeeFilter', () => {
  it('defaults to active, which is what the list opens on', () => {
    expect(parseEmployeeFilter(undefined)).toBe('active');
    expect(parseEmployeeFilter('nonsense')).toBe('active');
    expect(parseEmployeeFilter('inactive')).toBe('inactive');
    expect(parseEmployeeFilter('all')).toBe('all');
  });

  it('labels the filter the way the dropdown reads', () => {
    expect(employeeFilterLabel('active')).toBe('Active employees');
    expect(employeeFilterLabel('inactive')).toBe('Inactive employees');
    expect(employeeFilterLabel('all')).toBe('All employees');
  });
});

describe('matchesEmployeeFilter', () => {
  it('treats leave and termination alike as not currently active', () => {
    expect(matchesEmployeeFilter('ACTIVE', 'active')).toBe(true);
    expect(matchesEmployeeFilter('ON_LEAVE', 'active')).toBe(false);
    expect(matchesEmployeeFilter('ON_LEAVE', 'inactive')).toBe(true);
    expect(matchesEmployeeFilter('TERMINATED', 'inactive')).toBe(true);
    expect(matchesEmployeeFilter('ACTIVE', 'inactive')).toBe(false);
    expect(matchesEmployeeFilter('TERMINATED', 'all')).toBe(true);
  });
});

describe('matchesEmployeeSearch', () => {
  it('matches on any of the columns a reader can see', () => {
    expect(matchesEmployeeSearch(lisa, 'safari')).toBe(true);
    expect(matchesEmployeeSearch(lisa, 'GMAIL')).toBe(true);
    expect(matchesEmployeeSearch(lisa, 'emp-0001')).toBe(true);
    expect(matchesEmployeeSearch(lisa, 'stores')).toBe(true);
  });

  it('does not match a term that appears nowhere', () => {
    expect(matchesEmployeeSearch(lisa, 'peru')).toBe(false);
  });

  it('shows everyone when nothing has been typed', () => {
    expect(matchesEmployeeSearch(lisa, '')).toBe(true);
    expect(matchesEmployeeSearch(lisa, '   ')).toBe(true);
  });

  it('is not tripped up by a missing phone number', () => {
    expect(matchesEmployeeSearch(lisa, '0722')).toBe(false);
  });
});

describe('employeeInitial', () => {
  it('takes the first letter and shouts it', () => {
    expect(employeeInitial('Lisa Safari')).toBe('L');
    expect(employeeInitial('  peru skyjet')).toBe('P');
  });

  it('falls back rather than rendering an empty circle', () => {
    expect(employeeInitial('   ')).toBe('?');
  });
});
