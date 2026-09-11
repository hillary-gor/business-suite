import { describe, expect, it } from 'vitest';
import { BUSINESS_SUITE_HOME, PLATFORM_HOME, postSignInPath } from './entry';

describe('postSignInPath', () => {
  it('sends domain and login visits to the workspace, not Business Suite', () => {
    expect(postSignInPath('/')).toBe(PLATFORM_HOME);
    expect(postSignInPath('/login')).toBe(PLATFORM_HOME);
    expect(postSignInPath('/sign-in')).toBe(PLATFORM_HOME);
    expect(postSignInPath('')).toBe(PLATFORM_HOME);
    expect(PLATFORM_HOME).toBe('/workspace');
    expect(BUSINESS_SUITE_HOME).toBe('/business-suite');
  });

  it('keeps deep links so a bookmarked module screen still opens', () => {
    expect(postSignInPath('/library')).toBe('/library');
    expect(postSignInPath('/sales/invoices')).toBe('/sales/invoices');
    expect(postSignInPath('/business-suite')).toBe('/business-suite');
    expect(postSignInPath('/sales?status=open')).toBe('/sales?status=open');
  });
});
