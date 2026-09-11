/** Sidebar becomes a drawer at this width and below (tablets and phones). */
export const LIBRARY_DRAWER_MEDIA = '(max-width: 1100px)';

export function libraryPathIsCurrent(
  pathname: string,
  href: string,
  match: 'exact' | 'prefix',
): boolean {
  if (match === 'exact') return pathname === href;
  if (href === '/library/documents') {
    return (
      pathname === '/library/documents' ||
      (pathname.startsWith('/library/documents/') && pathname !== '/library/documents/new')
    );
  }
  if (href === '/library/collections') {
    return pathname === '/library/collections' || pathname.startsWith('/library/collections/');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
