import {
  LIBRARY_CLASSIFICATIONS,
  LIBRARY_DOCUMENT_TYPES,
  LIBRARY_STATUSES,
  type LibraryClassification,
  type LibraryDocumentStatus,
  type LibraryDocumentType,
} from './types';

export interface ParsedLibrarySearch {
  text: string;
  documentType?: LibraryDocumentType;
  classification?: LibraryClassification;
  status?: LibraryDocumentStatus;
  tag?: string;
  part?: string;
}

export interface LibraryJumpPage {
  href: string;
  title: string;
  hint: string;
  keywords: string;
}

const TYPE_ALIASES: Record<string, LibraryDocumentType> = {
  manuals: 'manuals',
  manual: 'manuals',
  certificates: 'certificates',
  certificate: 'certificates',
  cert: 'certificates',
  technical: 'technical',
  tech: 'technical',
  inspection: 'inspection',
  aircraft: 'aircraft',
  part: 'part',
  parts: 'part',
  other: 'other',
};

const CLASS_ALIASES: Record<string, LibraryClassification> = {
  internal: 'internal',
  confidential: 'confidential',
  restricted: 'restricted',
};

function isDocumentType(value: string): value is LibraryDocumentType {
  return (LIBRARY_DOCUMENT_TYPES as readonly string[]).includes(value);
}

function isClassification(value: string): value is LibraryClassification {
  return (LIBRARY_CLASSIFICATIONS as readonly string[]).includes(value);
}

function isStatus(value: string): value is LibraryDocumentStatus {
  return (LIBRARY_STATUSES as readonly string[]).includes(value);
}

/** Split on whitespace, keeping "quoted phrases" as one token. */
export function tokenizeLibrarySearch(raw: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    tokens.push((match[1] ?? match[2] ?? '').trim());
  }
  return tokens.filter((token) => token.length > 0);
}

/**
 * Filters typed in the box, not a second search engine.
 * type:manuals  level:confidential  status:ARCHIVED  tag:amm  part:737
 */
export function parseLibrarySearchQuery(raw: string): ParsedLibrarySearch {
  const parsed: ParsedLibrarySearch = { text: '' };
  const leftover: string[] = [];

  for (const token of tokenizeLibrarySearch(raw)) {
    const filter = /^([a-z]+):(.+)$/i.exec(token);
    if (!filter) {
      leftover.push(token);
      continue;
    }
    const key = (filter[1] ?? '').toLowerCase();
    const value = (filter[2] ?? '').trim();
    if (!value) {
      leftover.push(token);
      continue;
    }

    if (key === 'type' || key === 'category') {
      const mapped = TYPE_ALIASES[value.toLowerCase()];
      if (mapped) parsed.documentType = mapped;
      else if (isDocumentType(value)) parsed.documentType = value;
      else leftover.push(token);
      continue;
    }
    if (key === 'level' || key === 'class' || key === 'access') {
      const mapped = CLASS_ALIASES[value.toLowerCase()];
      if (mapped) parsed.classification = mapped;
      else {
        const level = value.toLowerCase();
        if (isClassification(level)) parsed.classification = level;
        else leftover.push(token);
      }
      continue;
    }
    if (key === 'status') {
      const status = value.toUpperCase();
      if (isStatus(status)) parsed.status = status;
      else leftover.push(token);
      continue;
    }
    if (key === 'tag') {
      parsed.tag = value.slice(0, 80);
      continue;
    }
    if (key === 'part') {
      parsed.part = value.slice(0, 80);
      continue;
    }

    leftover.push(token);
  }

  parsed.text = leftover.join(' ').trim().slice(0, 200);
  return parsed;
}

/** Escape a user string for use inside ILIKE … ESCAPE '\'. */
export function likeContains(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function libraryJumpPages(caps: {
  mayUpload: boolean;
  mayCompany: boolean;
  mayUsers: boolean;
  mayAccess: boolean;
}): LibraryJumpPage[] {
  const pages: LibraryJumpPage[] = [
    {
      href: '/library',
      title: 'Dashboard',
      hint: 'Overview of this organisation’s library',
      keywords: 'home start overview',
    },
    {
      href: '/library/help',
      title: 'How Library works',
      hint: 'A guide for people new to Skyjet Library',
      keywords: 'help guide learn documentation intro how',
    },
    {
      href: '/library/documents',
      title: 'Documents',
      hint: 'Search and browse the catalogue',
      keywords: 'list files catalogue all',
    },
    {
      href: '/library/collections',
      title: 'Collections',
      hint: 'Mixed piles of documents across categories',
      keywords: 'folder pack bundle group',
    },
  ];
  if (caps.mayUpload) {
    pages.push({
      href: '/library/documents/new',
      title: 'Upload document',
      hint: 'Store a new file',
      keywords: 'add create new file',
    });
  }
  if (caps.mayCompany || caps.mayUsers || caps.mayAccess) {
    pages.push({
      href: '/library/settings',
      title: 'Settings',
      hint: 'Organisation, people, access log',
      keywords: 'admin configure',
    });
  }
  if (caps.mayCompany) {
    pages.push({
      href: '/library/settings/company',
      title: 'Organisation',
      hint: 'Company name, address, logo',
      keywords: 'company legal trading name',
    });
  }
  if (caps.mayUsers) {
    pages.push({
      href: '/library/settings/users',
      title: 'People',
      hint: 'Invite users and set clearance',
      keywords: 'users invite role',
    });
  }
  if (caps.mayAccess) {
    pages.push({
      href: '/library/settings/access',
      title: 'Access log',
      hint: 'Who opened or downloaded files',
      keywords: 'audit trail history',
    });
  }
  return pages;
}

export function matchJumpPages(
  pages: readonly LibraryJumpPage[],
  query: string,
): LibraryJumpPage[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...pages];
  return pages.filter((page) => {
    const hay = `${page.title} ${page.hint} ${page.keywords}`.toLowerCase();
    return words.every((word) => hay.includes(word));
  });
}
