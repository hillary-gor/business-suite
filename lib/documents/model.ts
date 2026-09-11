import type { DocumentColumn, DocumentKind, DocumentProfile, DocumentSignature } from './kinds';

export type DocumentParty = {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type DocumentMeta = {
  label: string;
  value: string;
};

export type DocumentLine = {
  description: string;
  sku?: string | null;
  quantity?: string | null;
  unitPrice?: string | null;
  taxLabel?: string | null;
  taxAmount?: string | null;
  amount?: string | null;
  extra?: string | null;
};

export type DocumentCompany = {
  name: string;
  tradingName?: string | null;
  email?: string | null;
  phone?: string | null;
  registrationNumber?: string | null;
  taxPin?: string | null;
  address?: string | null;
  logoDataUri?: string | null;
};

export type DocumentTotals = {
  subtotal: string;
  tax: string;
  total: string;
  balance?: string | null;
  currency: string;
};

export type DocumentModel = {
  kind: DocumentKind;
  profile: DocumentProfile;
  title: string;
  numberLabel: string;
  number: string;
  issueDate: string;
  dueDate?: string | null;
  company: DocumentCompany;
  partyRole: 'customer' | 'supplier' | 'internal';
  partyLabel: string;
  party: DocumentParty;
  shipTo?: DocumentParty | null;
  meta: DocumentMeta[];
  columns: DocumentColumn[];
  lines: DocumentLine[];
  showMoney: boolean;
  totals?: DocumentTotals | null;
  terms?: string | null;
  notes?: string | null;
  references: DocumentMeta[];
  signatures: DocumentSignature[];
  attachmentsNote?: string | null;
};

/** Client-safe draft used for unsaved composer previews. Server stamps letterhead. */
export type DocumentDraft = {
  kind: DocumentKind;
  number?: string | null;
  issueDate: string;
  dueDate?: string | null;
  party: DocumentParty;
  shipTo?: DocumentParty | null;
  meta?: DocumentMeta[];
  lines: DocumentLine[];
  currency: string;
  subtotal?: string | null;
  tax?: string | null;
  total?: string | null;
  balance?: string | null;
  terms?: string | null;
  notes?: string | null;
  references?: DocumentMeta[];
};

export function formatAddressParts(parts: {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): string | null {
  const locality = [parts.city, parts.postalCode].filter(Boolean).join(' ').trim();
  const lines = [parts.line1, parts.line2, locality || null, parts.region, parts.country]
    .map((value) => value?.trim() || '')
    .filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : null;
}

export function emptyCompany(): DocumentCompany {
  return { name: '' };
}
