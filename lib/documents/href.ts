import type { DocumentKind } from './kinds';

export function documentPdfPath(
  kind: DocumentKind,
  id: string,
  query?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return `/documents/${kind}/${id}/pdf${suffix}`;
}
