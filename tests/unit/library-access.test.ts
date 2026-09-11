import { describe, expect, it } from 'vitest';
import { accessActionLabel, isAccessAction } from '@/app/library/access';
import {
  LIBRARY_CLASSIFICATIONS,
  LIBRARY_CLASSIFICATION_LABELS,
  LIBRARY_ROLE_CLEARANCE,
} from '@/server/modules/library/types';

describe('library access copy', () => {
  it('names the three access events a person can take', () => {
    expect(accessActionLabel('VIEW')).toBe('Opened details');
    expect(accessActionLabel('PREVIEW')).toBe('Opened file');
    expect(accessActionLabel('DOWNLOAD')).toBe('Downloaded file');
    expect(isAccessAction('VIEW')).toBe(true);
    expect(isAccessAction('DELETE')).toBe(false);
  });

  it('keeps classification labels aligned with the stored codes', () => {
    expect(LIBRARY_CLASSIFICATIONS).toEqual(['internal', 'confidential', 'restricted']);
    for (const level of LIBRARY_CLASSIFICATIONS) {
      expect(LIBRARY_CLASSIFICATION_LABELS[level].length).toBeGreaterThan(0);
    }
  });

  it('documents the coarse role-to-clearance map so Settings is not a guess', () => {
    expect(LIBRARY_ROLE_CLEARANCE.some((row) => row.access.includes('Restricted'))).toBe(true);
    expect(LIBRARY_ROLE_CLEARANCE.some((row) => row.access === 'Internal only')).toBe(true);
  });
});
