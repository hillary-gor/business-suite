'use client';

import { useEffect } from 'react';

const KEY = 'skyjet-library-recent-docs';
const LIMIT = 8;

export type RecentLibraryDocument = {
  id: string;
  title: string;
};

export function readRecentLibraryDocuments(): RecentLibraryDocument[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is RecentLibraryDocument =>
        typeof row === 'object' &&
        row !== null &&
        typeof (row as RecentLibraryDocument).id === 'string' &&
        typeof (row as RecentLibraryDocument).title === 'string',
    );
  } catch {
    return [];
  }
}

export function rememberLibraryDocument(id: string, title: string) {
  if (typeof window === 'undefined') return;
  const next = [
    { id, title },
    ...readRecentLibraryDocuments().filter((row) => row.id !== id),
  ].slice(0, LIMIT);
  window.sessionStorage.setItem(KEY, JSON.stringify(next));
}

export function LibraryVisitBeacon({ id, title }: { id: string; title: string }) {
  useEffect(() => {
    rememberLibraryDocument(id, title);
  }, [id, title]);
  return null;
}
