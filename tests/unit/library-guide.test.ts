import { LIBRARY_GUIDE_HREF, LIBRARY_GUIDE_SECTIONS } from '@/app/library/guide';
import { describe, expect, it } from 'vitest';

describe('library guide', () => {
  it('gives a new person a full walkthrough with unique topics', () => {
    const ids = LIBRARY_GUIDE_SECTIONS.map((section) => section.id);
    expect(ids).toEqual([...new Set(ids)]);
    expect(LIBRARY_GUIDE_SECTIONS.length).toBeGreaterThanOrEqual(12);
    expect(LIBRARY_GUIDE_HREF).toBe('/library/help');
    for (const section of LIBRARY_GUIDE_SECTIONS) {
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.paragraphs.length).toBeGreaterThan(0);
    }
  });
});
