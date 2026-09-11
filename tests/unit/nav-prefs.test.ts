import { describe, expect, it } from 'vitest';
import { parseNavPrefs } from '@/app/(app)/nav-prefs';

describe('parseNavPrefs', () => {
  it('fills defaults when the stored value is empty', () => {
    expect(parseNavPrefs(null).labels).toBe(true);
    expect(parseNavPrefs({}).pinned).toEqual([
      'sales',
      'customers',
      'purchasing',
      'inventory',
      'accounting',
      'reports',
    ]);
  });

  it('keeps a saved pin list and collapsed pane', () => {
    const prefs = parseNavPrefs({
      labels: false,
      pinned: ['sales', 'reports'],
      paneHidden: true,
    });
    expect(prefs).toEqual({
      labels: false,
      pinned: ['sales', 'reports'],
      paneHidden: true,
    });
  });

  it('drops unknown pin ids', () => {
    expect(parseNavPrefs({ pinned: ['sales', 'widgets', 'reports'] }).pinned).toEqual([
      'sales',
      'reports',
    ]);
  });

  it('pins Customer Hub on the old default rail without touching a custom list', () => {
    expect(
      parseNavPrefs({
        pinned: ['sales', 'purchasing', 'inventory', 'accounting', 'reports'],
      }).pinned,
    ).toEqual(['sales', 'customers', 'purchasing', 'inventory', 'accounting', 'reports']);
    expect(parseNavPrefs({ pinned: ['sales', 'reports'] }).pinned).toEqual(['sales', 'reports']);
  });
});
