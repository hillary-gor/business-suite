import {
  LIBRARY_ACCESS_ACTIONS,
  LIBRARY_CLASSIFICATION_LABELS,
  type LibraryAccessAction,
  type LibraryClassification,
} from '@/server/modules/library/types';
import { Permission } from '@/server/auth/permissions';
import type { Session } from '@/server/auth/session';
import { can } from '@/server/auth/session';

export function assignableClassifications(
  session: Session,
  entityId: string,
): LibraryClassification[] {
  const levels: LibraryClassification[] = ['internal'];
  if (can(session, entityId, Permission.LibraryDocumentReadConfidential)) {
    levels.push('confidential');
  }
  if (can(session, entityId, Permission.LibraryDocumentReadRestricted)) {
    levels.push('restricted');
  }
  return levels;
}

export function accessActionLabel(action: LibraryAccessAction): string {
  if (action === 'VIEW') return 'Opened details';
  if (action === 'PREVIEW') return 'Opened file';
  return 'Downloaded file';
}

export function classificationLabel(level: LibraryClassification): string {
  return LIBRARY_CLASSIFICATION_LABELS[level];
}

export function isAccessAction(value: string): value is LibraryAccessAction {
  return (LIBRARY_ACCESS_ACTIONS as readonly string[]).includes(value);
}
