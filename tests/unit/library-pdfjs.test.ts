import { describe, expect, it } from 'vitest';
import { getResolvedPDFJS } from 'unpdf';
import { useLibraryPdfjs } from '@/server/modules/library/pdfjs';

describe('library PDF.js', () => {
  it('uses the serverless bundle so the API and worker stay on the same version', async () => {
    await useLibraryPdfjs();
    const pdfjs = await getResolvedPDFJS();
    expect(pdfjs.version).toMatch(/^6\.1\./);
  });
});
