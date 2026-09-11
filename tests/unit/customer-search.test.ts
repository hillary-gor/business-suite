import { describe, expect, it } from 'vitest';
import { matchesCustomerQuery } from '@/lib/customer-search';

const kenya = {
  label: 'KENAIR — Kenya Airways',
  code: 'KENAIR',
  email: 'ap@kenya-airways.com',
  phone: '+254700000000',
};

describe('matchesCustomerQuery', () => {
  it('matches an empty query', () => {
    expect(matchesCustomerQuery(kenya, '')).toBe(true);
  });

  it('matches name, code, or email tokens', () => {
    expect(matchesCustomerQuery(kenya, 'kenya')).toBe(true);
    expect(matchesCustomerQuery(kenya, 'KENAIR')).toBe(true);
    expect(matchesCustomerQuery(kenya, 'ap@kenya')).toBe(true);
  });

  it('requires every token', () => {
    expect(matchesCustomerQuery(kenya, 'kenya airways')).toBe(true);
    expect(matchesCustomerQuery(kenya, 'kenya xyz')).toBe(false);
  });
});
