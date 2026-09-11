/**
 * Named Business Suite screens.
 *
 * CSS `@media` cannot read custom properties in a portable way, so these
 * pixel values must stay in lockstep with `app/globals.css`. Library uses its
 * own 1100px drawer in `app/library/nav.ts` — do not reuse those numbers here.
 *
 * - Phone   ≤720px  one column, stacked headers, 16px inputs
 * - Tablet  ≤900px  navigation drawer (rail hidden until Menu)
 * - Laptop  ≤1200px dashboards fold from 3–4 columns toward two
 * - Desktop  >1200px full rail, pane, and wide glances
 */
export const SUITE_SCREENS = {
  phone: 720,
  tablet: 900,
  laptop: 1200,
} as const;

export type SuiteScreenName = 'phone' | 'tablet' | 'laptop' | 'desktop';

export const SUITE_PHONE_MEDIA = `(max-width: ${SUITE_SCREENS.phone}px)`;
export const SUITE_DRAWER_MEDIA = `(max-width: ${SUITE_SCREENS.tablet}px)`;
export const SUITE_LAPTOP_MEDIA = `(max-width: ${SUITE_SCREENS.laptop}px)`;

export function suiteScreenName(widthPx: number): SuiteScreenName {
  if (widthPx <= SUITE_SCREENS.phone) return 'phone';
  if (widthPx <= SUITE_SCREENS.tablet) return 'tablet';
  if (widthPx <= SUITE_SCREENS.laptop) return 'laptop';
  return 'desktop';
}
