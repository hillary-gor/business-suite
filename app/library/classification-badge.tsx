import {
  LIBRARY_CLASSIFICATION_LABELS,
  type LibraryClassification,
} from '@/server/modules/library/types';
import { Badge } from '@/components/ui';

const TONE: Record<LibraryClassification, 'info' | 'warning' | 'danger'> = {
  internal: 'info',
  confidential: 'warning',
  restricted: 'danger',
};

export function ClassificationBadge({ level }: { level: LibraryClassification }) {
  return <Badge tone={TONE[level]}>{LIBRARY_CLASSIFICATION_LABELS[level]}</Badge>;
}
