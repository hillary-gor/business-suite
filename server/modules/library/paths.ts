import type { LibraryDocumentType } from './types';

export function sanitizeLibraryFileName(name: string): string {
  let cleaned = name
    .replace(/[\\/]+/g, '-')
    .replace(/[^\w.\- ()]+/g, '_')
    .trim();
  if (cleaned.length < 1) cleaned = 'document';
  if (cleaned.length > 200) cleaned = cleaned.slice(0, 200);
  return cleaned;
}

export function libraryObjectPath(
  entityId: string,
  documentType: LibraryDocumentType,
  documentId: string,
  fileName: string,
): string {
  return `${entityId}/${documentType}/${documentId}/${sanitizeLibraryFileName(fileName)}`;
}

export function libraryRevisionObjectPath(
  entityId: string,
  documentType: LibraryDocumentType,
  documentId: string,
  revisionId: string,
  fileName: string,
): string {
  return `${entityId}/${documentType}/${documentId}/${revisionId}/${sanitizeLibraryFileName(fileName)}`;
}
