import { definePDFJSModule } from 'unpdf';

let ready: Promise<void> | undefined;

/**
 * unpdf inlines a PDF.js worker in `unpdf/pdfjs`. Pointing it at npm
 * `pdfjs-dist` loads a newer API against that older worker and throws
 * "The API version does not match the Worker version".
 */
export function useLibraryPdfjs(): Promise<void> {
  ready ??= definePDFJSModule(() => import('unpdf/pdfjs'));
  return ready;
}
