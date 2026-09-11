'use client';

import { useEffect, useState } from 'react';
import {
  applyColorMode,
  colorModeLabel,
  nextColorMode,
  persistColorMode,
  readStoredColorMode,
  type ColorMode,
  type ColorTheme,
} from '@/lib/color-mode';

export function ColorModeToggle() {
  const [mode, setMode] = useState<ColorMode>('system');
  const [theme, setTheme] = useState<ColorTheme>('light');

  useEffect(() => {
    const stored = readStoredColorMode();
    setMode(stored);
    setTheme(applyColorMode(stored));

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      const current = readStoredColorMode();
      setMode(current);
      setTheme(applyColorMode(current));
    };
    media.addEventListener('change', sync);
    window.addEventListener('storage', sync);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const label = colorModeLabel(mode, theme);

  return (
    <button
      type="button"
      className="color-mode-toggle"
      aria-label={label}
      title={label}
      onClick={() => {
        const next = nextColorMode(mode);
        persistColorMode(next);
        setMode(next);
        setTheme(applyColorMode(next));
      }}
    >
      {mode === 'system' ? <IconSystem /> : theme === 'dark' ? <IconMoon /> : <IconSun />}
    </button>
  );
}

function IconSun() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 3.5v1.6M12 18.9v1.6M4.6 12H3M21 12h-1.6M6.1 6.1l1.1 1.1M16.8 16.8l1.1 1.1M6.1 17.9l1.1-1.1M16.8 7.2l1.1-1.1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16.8 13.6A6.4 6.4 0 0 1 10.4 5.2 7 7 0 1 0 18.8 15a6.3 6.3 0 0 1-2-.4Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSystem() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="11.5" rx="1.8" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 19.5h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
