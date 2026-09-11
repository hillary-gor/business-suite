import { LIBRARY_OCR_MIME_TYPES } from './types';

export const LIBRARY_EXTRACT_MAX_CHARS = 500_000;

export function shouldEnqueueLibraryOcr(mimeType: string, extractedText: string | null): boolean {
  if (extractedText) return false;
  return (LIBRARY_OCR_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Pull a searchable text layer out of the bytes we already store.
 * PDF: embedded text only. Scans with no text layer return null.
 * OCR is a separate worker, not a silent no-op here.
 */
export async function extractLibraryText(bytes: Buffer, mimeType: string): Promise<string | null> {
  try {
    if (mimeType === 'text/plain' || mimeType === 'text/csv') {
      return clipExtracted(bytes.toString('utf8'));
    }
    if (mimeType === 'application/pdf') {
      const { useLibraryPdfjs } = await import('./pdfjs');
      await useLibraryPdfjs();
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await extractText(pdf, { mergePages: true });
      const merged = Array.isArray(text) ? text.join('\n') : String(text ?? '');
      return clipExtracted(merged);
    }
  } catch (error) {
    console.error('[library:extract]', error);
  }
  return null;
}

export function clipExtracted(raw: string): string | null {
  const cleaned = raw
    .replace(/\0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, LIBRARY_EXTRACT_MAX_CHARS);
}
