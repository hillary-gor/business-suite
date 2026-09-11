export const COLOR_MODE_KEY = 'skyjet.color-mode';

export const COLOR_MODES = ['system', 'light', 'dark'] as const;

export type ColorMode = (typeof COLOR_MODES)[number];

export type ColorTheme = 'light' | 'dark';

export function isColorMode(value: string | null | undefined): value is ColorMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function resolveColorTheme(mode: ColorMode, prefersDark: boolean): ColorTheme {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
}

export function nextColorMode(mode: ColorMode): ColorMode {
  const index = COLOR_MODES.indexOf(mode);
  return COLOR_MODES[(index + 1) % COLOR_MODES.length] ?? 'system';
}

export function colorModeLabel(mode: ColorMode, theme: ColorTheme): string {
  if (mode === 'system') return `Appearance: system (${theme})`;
  return `Appearance: ${mode}`;
}

export function applyColorMode(mode: ColorMode, root: HTMLElement = document.documentElement): ColorTheme {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = resolveColorTheme(mode, prefersDark);
  root.dataset.theme = theme;
  root.dataset.colorMode = mode;
  root.style.colorScheme = theme;
  return theme;
}

export function readStoredColorMode(): ColorMode {
  try {
    const stored = window.localStorage.getItem(COLOR_MODE_KEY);
    return isColorMode(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function persistColorMode(mode: ColorMode): void {
  try {
    window.localStorage.setItem(COLOR_MODE_KEY, mode);
  } catch {
    /* private mode */
  }
}
