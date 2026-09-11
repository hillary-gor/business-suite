import { describe, expect, it } from 'vitest';
import {
  libraryObjectPath,
  libraryRevisionObjectPath,
  sanitizeLibraryFileName,
} from '@/server/modules/library/paths';

describe('library storage paths', () => {
  it('scopes objects to the organisation and document type', () => {
    const entityId = '10000000-0000-0000-0000-000000000001';
    const documentId = '20000000-0000-0000-0000-000000000002';
    const path = libraryObjectPath(entityId, 'manuals', documentId, '737 AMM.pdf');
    expect(path.startsWith(`${entityId}/manuals/${documentId}/`)).toBe(true);
    expect(path.includes('..')).toBe(false);
    expect(path.startsWith('business/')).toBe(false);
  });

  it('nests later revisions under the revision id so the previous object is not overwritten', () => {
    const entityId = '10000000-0000-0000-0000-000000000001';
    const documentId = '20000000-0000-0000-0000-000000000002';
    const revisionId = '30000000-0000-0000-0000-000000000003';
    const path = libraryRevisionObjectPath(
      entityId,
      'manuals',
      documentId,
      revisionId,
      '737 AMM.pdf',
    );
    expect(path).toBe(`${entityId}/manuals/${documentId}/${revisionId}/737 AMM.pdf`);
  });

  it('strips path separators from uploaded names', () => {
    expect(sanitizeLibraryFileName('../../etc/passwd')).toBe('..-..-etc-passwd');
    expect(sanitizeLibraryFileName('C:\\windows\\manual.pdf')).toBe('C_-windows-manual.pdf');
  });
});
