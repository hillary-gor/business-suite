import { describe, expect, it } from 'vitest';
import {
  SUITE_DRAWER_MEDIA,
  SUITE_LAPTOP_MEDIA,
  SUITE_PHONE_MEDIA,
  SUITE_SCREENS,
  suiteScreenName,
} from '@/app/(app)/layout-media';

describe('Business Suite named screens', () => {
  it('keeps the four named sizes in lockstep with the CSS media queries', () => {
    expect(SUITE_SCREENS.phone).toBe(720);
    expect(SUITE_SCREENS.tablet).toBe(900);
    expect(SUITE_SCREENS.laptop).toBe(1200);
    expect(SUITE_PHONE_MEDIA).toBe('(max-width: 720px)');
    expect(SUITE_DRAWER_MEDIA).toBe('(max-width: 900px)');
    expect(SUITE_LAPTOP_MEDIA).toBe('(max-width: 1200px)');
  });

  it('names a width as phone, tablet, laptop, or desktop', () => {
    expect(suiteScreenName(390)).toBe('phone');
    expect(suiteScreenName(720)).toBe('phone');
    expect(suiteScreenName(768)).toBe('tablet');
    expect(suiteScreenName(900)).toBe('tablet');
    expect(suiteScreenName(1024)).toBe('laptop');
    expect(suiteScreenName(1200)).toBe('laptop');
    expect(suiteScreenName(1440)).toBe('desktop');
  });
});
