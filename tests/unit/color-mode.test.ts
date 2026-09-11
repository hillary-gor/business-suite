import { describe, expect, it } from 'vitest';
import { colorModeLabel, nextColorMode, resolveColorTheme } from '@/lib/color-mode';

describe('color mode', () => {
  it('follows the system preference until the person picks a side', () => {
    expect(resolveColorTheme('system', true)).toBe('dark');
    expect(resolveColorTheme('system', false)).toBe('light');
    expect(resolveColorTheme('light', true)).toBe('light');
    expect(resolveColorTheme('dark', false)).toBe('dark');
  });

  it('cycles system, light, then dark', () => {
    expect(nextColorMode('system')).toBe('light');
    expect(nextColorMode('light')).toBe('dark');
    expect(nextColorMode('dark')).toBe('system');
  });

  it('names the control after the stored choice', () => {
    expect(colorModeLabel('system', 'dark')).toBe('Appearance: system (dark)');
    expect(colorModeLabel('light', 'light')).toBe('Appearance: light');
  });
});
