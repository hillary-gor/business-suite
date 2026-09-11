import { describe, expect, it } from 'vitest';
import { clipExtracted, shouldEnqueueLibraryOcr } from '@/server/modules/library/extract';

describe('library text extract', () => {
  it('strips empty and null bytes before indexing', () => {
    expect(clipExtracted('   \n')).toBeNull();
    expect(clipExtracted('\0secret\0')).toBe('secret');
  });

  it('queues OCR only when a scan has no text layer', () => {
    expect(shouldEnqueueLibraryOcr('application/pdf', null)).toBe(true);
    expect(shouldEnqueueLibraryOcr('image/png', null)).toBe(true);
    expect(shouldEnqueueLibraryOcr('application/pdf', 'already extracted')).toBe(false);
    expect(shouldEnqueueLibraryOcr('application/zip', null)).toBe(false);
  });

  it('caps the body so a generated tsvector cannot swallow the row', () => {
    const huge = 'x'.repeat(500_010);
    expect(clipExtracted(huge)?.length).toBe(500_000);
  });
});
