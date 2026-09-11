/**
 * Where the platform sends people at the front door.
 *
 * `/` is the Skyjet portal, not Business Suite. Loading the domain (or
 * localhost) must not dump a visitor into a module login or a module home.
 */
export const PLATFORM_HOME = '/workspace';
export const PLATFORM_SIGN_IN = '/sign-in';
export const BUSINESS_SUITE_HOME = '/business-suite';

const PORTAL_ENTRY_PATHS = new Set(['', '/', '/login', '/sign-in']);

/**
 * Path to open after a successful sign-in.
 *
 * Deep links (`/sales`, `/library`) are honoured. The domain root and the
 * login URLs themselves are the portal, so they resolve to the workspace.
 */
export function postSignInPath(requested: string): string {
  const pathOnly = requested.split('?')[0] ?? requested;
  if (PORTAL_ENTRY_PATHS.has(pathOnly)) return PLATFORM_HOME;
  return requested.startsWith('/') ? requested : PLATFORM_HOME;
}
