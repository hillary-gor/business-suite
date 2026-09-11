import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import type { DocumentModel } from '@/lib/documents/model';
import { DocumentPdf } from './document-pdf';

export async function renderDocumentPdf(model: DocumentModel): Promise<Buffer> {
  return renderToBuffer(createElement(DocumentPdf, { model }) as ReactElement<DocumentProps>);
}
