export const LIBRARY_DOCUMENT_TYPES = [
  'manuals',
  'certificates',
  'technical',
  'inspection',
  'aircraft',
  'part',
  'other',
] as const;

export type LibraryDocumentType = (typeof LIBRARY_DOCUMENT_TYPES)[number];

export const LIBRARY_DOCUMENT_TYPE_LABELS: Record<LibraryDocumentType, string> = {
  manuals: 'Manuals',
  certificates: 'Certificates',
  technical: 'Technical documents',
  inspection: 'Inspection documents',
  aircraft: 'Aircraft records',
  part: 'Part documents',
  other: 'Other company documents',
};

export const LIBRARY_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type LibraryDocumentStatus = (typeof LIBRARY_STATUSES)[number];

export const LIBRARY_CLASSIFICATIONS = ['internal', 'confidential', 'restricted'] as const;
export type LibraryClassification = (typeof LIBRARY_CLASSIFICATIONS)[number];

export const LIBRARY_CLASSIFICATION_LABELS: Record<LibraryClassification, string> = {
  internal: 'Internal',
  confidential: 'Confidential',
  restricted: 'Restricted',
};

export const LIBRARY_CLASSIFICATION_HINTS: Record<LibraryClassification, string> = {
  internal: 'Anyone with Library access in this organisation.',
  confidential: 'Requires confidential clearance.',
  restricted: 'Highest clearance. Need-to-know and export-controlled material.',
};

export const LIBRARY_ROLE_CLEARANCE = [
  {
    roles: 'Owner, Super admin, Manager',
    access: 'Internal, Confidential, Restricted',
    audit: 'Can read the access log',
  },
  {
    roles: 'Inventory, Accountant, Procurement',
    access: 'Internal, Confidential',
    audit: 'No access log',
  },
  {
    roles: 'Viewer, Sales, Warehouse',
    access: 'Internal only',
    audit: 'No access log',
  },
] as const;

export const LIBRARY_ACCESS_ACTIONS = ['VIEW', 'PREVIEW', 'DOWNLOAD'] as const;
export type LibraryAccessAction = (typeof LIBRARY_ACCESS_ACTIONS)[number];

export const LIBRARY_BUCKET = 'library-documents';
export const LIBRARY_MAX_FILE_BYTES = 33_554_432;

export const LIBRARY_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/tiff',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/zip',
] as const;

export type LibraryMimeType = (typeof LIBRARY_MIME_TYPES)[number];

export interface LibraryDocumentSummary {
  id: string;
  title: string;
  documentType: LibraryDocumentType;
  partNumber: string | null;
  manufacturer: string | null;
  aircraftType: string | null;
  aircraftModel: string | null;
  revision: string | null;
  version: string | null;
  effectiveDate: string | null;
  fileName: string;
  fileSize: string;
  mimeType: string;
  status: LibraryDocumentStatus;
  classification: LibraryClassification;
  uploadedByName: string | null;
  createdAt: string;
  tags: readonly string[];
  canOpen: boolean;
}

export interface LibraryDocument extends LibraryDocumentSummary {
  description: string | null;
  storagePath: string;
  sha256: string;
  updatedAt: string;
  hasExtractedText: boolean;
  canOpen: boolean;
}

export const LIBRARY_OCR_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/tiff',
] as const;

export const LIBRARY_OCR_STATUSES = ['queued', 'running', 'done', 'failed', 'skipped'] as const;
export type LibraryOcrStatus = (typeof LIBRARY_OCR_STATUSES)[number];

export interface LibraryOcrJob {
  id: string;
  status: LibraryOcrStatus;
  lastError: string | null;
  createdAt: string;
}

export const LIBRARY_LINK_KINDS = ['item', 'user', 'employee', 'supplier'] as const;
export type LibraryLinkKind = (typeof LIBRARY_LINK_KINDS)[number];

export const LIBRARY_LINK_KIND_LABELS: Record<LibraryLinkKind, string> = {
  item: 'Item',
  user: 'User',
  employee: 'Employee',
  supplier: 'Supplier',
};

export interface LibraryDocumentLink {
  kind: LibraryLinkKind;
  recordId: string;
  label: string;
  hint: string | null;
  createdAt: string;
}

export interface LibraryCollectionSummary {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
  createdAt: string;
}

export interface LibraryCollection extends LibraryCollectionSummary {
  updatedAt: string;
}

export interface LibraryDocumentRevision {
  id: string;
  revisionNo: number;
  fileName: string;
  fileSize: string;
  mimeType: string;
  sha256: string;
  isCurrent: boolean;
  createdByName: string | null;
  createdAt: string;
}

export interface LibraryCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  documentCount: number;
}

export interface LibraryAccessEvent {
  id: string;
  documentId: string;
  documentTitle: string;
  classification: LibraryClassification;
  action: LibraryAccessAction;
  actorName: string | null;
  actorEmail: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface LibraryDocumentHit extends LibraryDocumentSummary {
  snippet: string | null;
}

export interface LibrarySeriesPoint {
  period: string;
  label: string;
  count: number;
}

export interface LibraryDashboard {
  totalActive: number;
  storageBytes: string;
  needsOcr: number;
  collectionCount: number;
  byType: readonly { documentType: LibraryDocumentType; count: number }[];
  byClassification: readonly { classification: LibraryClassification; count: number }[];
  uploadsByWeek: readonly LibrarySeriesPoint[];
  recent: readonly LibraryDocumentSummary[];
  categories: readonly LibraryCategory[];
}

export interface LibraryAccessPulse {
  opensLast28Days: number;
  byDay: readonly LibrarySeriesPoint[];
  topDocuments: readonly { id: string; title: string; count: number }[];
}

export interface LibraryAccessRequest {
  id: string;
  documentId: string;
  documentTitle: string;
  requesterName: string | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  createdAt: string;
}

export interface LibraryNotification {
  id: string;
  kind:
    'access_requested' | 'access_approved' | 'access_denied' | 'comment_added' | 'document_shared';
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export const LIBRARY_SHARE_CHANNELS = ['internal', 'email', 'link', 'whatsapp'] as const;

export type LibraryShareChannel = (typeof LIBRARY_SHARE_CHANNELS)[number];

export const LIBRARY_SHARE_CHANNEL_LABELS: Record<LibraryShareChannel, string> = {
  internal: 'In Library',
  email: 'Email',
  link: 'Copied link',
  whatsapp: 'WhatsApp',
};

export interface LibraryDocumentShare {
  id: string;
  sharedBy: string;
  sharedByName: string | null;
  channel: LibraryShareChannel;
  recipientUserId: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  note: string | null;
  grantedAccess: boolean;
  createdAt: string;
}

export const LIBRARY_COMMENT_REACTIONS = [
  { id: 'thumbs', emoji: '👍', label: 'Agree' },
  { id: 'check', emoji: '✅', label: 'Looks good' },
  { id: 'eyes', emoji: '👀', label: 'Seen' },
  { id: 'flag', emoji: '❗', label: 'Needs attention' },
] as const;

export type LibraryCommentReactionId = (typeof LIBRARY_COMMENT_REACTIONS)[number]['id'];

export interface LibraryColleague {
  id: string;
  fullName: string;
  email: string;
  jobTitle: string | null;
}

export interface LibraryComment {
  id: string;
  authorId: string;
  authorName: string | null;
  body: string;
  createdAt: string;
  reactions: Record<LibraryCommentReactionId, number>;
  mine: readonly LibraryCommentReactionId[];
}

export function isPreviewable(mimeType: string): boolean {
  return mimeType === 'application/pdf' || mimeType.startsWith('image/');
}
