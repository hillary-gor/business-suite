export const DEFAULT_COMPANY_LOGO = '/brand/surge-innovations.png';
export const SURGE_LOGO = '/brand/surge-innovations.png';
export const SKYJET_MARK = '/brand/skyjet-mark.png';

export function entityLogoSrc(hasCustomLogo: boolean, cacheKey?: string | null): string {
  if (!hasCustomLogo) return DEFAULT_COMPANY_LOGO;
  const stamp = cacheKey ? `?v=${encodeURIComponent(cacheKey)}` : '';
  return `/entity-logo${stamp}`;
}
