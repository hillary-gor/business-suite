'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { SUITE_DRAWER_MEDIA } from './layout-media';
import { IconClose, IconMenu } from './nav-icons';

type SuiteNavValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  close: () => void;
};

const SuiteNavContext = createContext<SuiteNavValue | null>(null);

export function useSuiteNav() {
  const value = useContext(SuiteNavContext);
  if (!value) {
    throw new Error('SuiteNavProvider is required');
  }
  return value;
}

export function SuiteNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia(SUITE_DRAWER_MEDIA);
    const closeWhenRailFits = () => {
      if (!media.matches) setOpen(false);
    };
    media.addEventListener('change', closeWhenRailFits);
    return () => media.removeEventListener('change', closeWhenRailFits);
  }, []);

  useEffect(() => {
    document.querySelector('.shell')?.classList.toggle('is-nav-open', open);
    return () => document.querySelector('.shell')?.classList.remove('is-nav-open');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, setOpen, close }), [open, close]);

  return <SuiteNavContext.Provider value={value}>{children}</SuiteNavContext.Provider>;
}

export function SuiteNavToggle() {
  const { open, setOpen } = useSuiteNav();

  return (
    <>
      <button
        type="button"
        className="shell__nav-toggle"
        aria-expanded={open}
        aria-controls="app-nav"
        onClick={() => setOpen(!open)}
      >
        <IconMenu />
        Menu
      </button>
      {open ? (
        <button
          type="button"
          className="shell__nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function SuiteNavClose({ showLabel = true }: { showLabel?: boolean }) {
  const { close } = useSuiteNav();

  return (
    <button
      type="button"
      className="rail__item shell__nav-close"
      title="Close menu"
      aria-label="Close navigation"
      onClick={close}
    >
      <span className="rail__icon">
        <IconClose />
      </span>
      {showLabel ? 'Close' : null}
    </button>
  );
}
