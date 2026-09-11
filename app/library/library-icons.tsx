import type { ReactNode } from 'react';

export function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.25" stroke="currentColor" strokeWidth="1.75" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function IconMenu() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconBell() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6.2 16.5h11.6M18 10.4a6 6 0 1 0-12 0c0 3.2-1.2 5.1-1.2 5.1h14.4s-1.2-1.9-1.2-5.1Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 16.5a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function strokeIcon(children: ReactNode) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

export function IconHome() {
  return strokeIcon(
    <path
      d="M4.5 10.5 12 4.5l7.5 6V20a1 1 0 0 1-1 1h-5v-6h-3v6h-5a1 1 0 0 1-1-1v-9.5Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    />,
  );
}

export function IconFile() {
  return strokeIcon(
    <path
      d="M7 3.5h7.5L19.5 9v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    />,
  );
}

export function IconStack() {
  return strokeIcon(
    <>
      <path
        d="M4.5 8.5 12 4.5l7.5 4-7.5 4-7.5-4Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="m4.5 12 7.5 4 7.5-4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="m4.5 15.5 7.5 4 7.5-4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </>,
  );
}

export function IconUpload() {
  return strokeIcon(
    <>
      <path d="M12 16.5V7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path
        d="M8 10.5 12 6.5l4 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 18.5h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </>,
  );
}

export function IconFolder() {
  return strokeIcon(
    <path
      d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4.2l1.6 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 20H5A1.5 1.5 0 0 1 3.5 18.5v-11Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    />,
  );
}

export function IconGear() {
  return strokeIcon(
    <>
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 4.2v2.1M12 17.7v2.1M4.2 12h2.1M17.7 12h2.1M6.4 6.4l1.5 1.5M16.1 16.1l1.5 1.5M6.4 17.6l1.5-1.5M16.1 7.9l1.5-1.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </>,
  );
}

export function IconBuilding() {
  return strokeIcon(
    <path
      d="M5 20.5h14M7 20.5V5.5h10v15M10 8.5h.5M13.5 8.5h.5M10 12h.5M13.5 12h.5M10 15.5h.5M13.5 15.5h.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />,
  );
}

export function IconPeople() {
  return strokeIcon(
    <>
      <circle cx="9" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M4.5 18.5c.4-2.8 2.2-4.2 4.5-4.2s4.1 1.4 4.5 4.2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="16.5" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M16.2 14.4c1.8.3 3.3 1.5 3.8 4.1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </>,
  );
}

export function IconShield() {
  return strokeIcon(
    <path
      d="M12 3.5 19 6.5v5.2c0 4.2-2.8 7.2-7 8.8-4.2-1.6-7-4.6-7-8.8V6.5l7-3Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    />,
  );
}

export function IconUser() {
  return strokeIcon(
    <>
      <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M5.5 19c.6-3.2 3-5 6.5-5s5.9 1.8 6.5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </>,
  );
}

export function IconKey() {
  return strokeIcon(
    <path
      d="M8.5 14.5a3.5 3.5 0 1 1 3.2-4.9L20 17.8v2.7h-2.8v-2H15v-2h-2.2l-1.3-1.3A3.5 3.5 0 0 1 8.5 14.5Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    />,
  );
}

export function IconLogout() {
  return strokeIcon(
    <>
      <path d="M10 12h9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path
        d="m16 8.5 3.5 3.5L16 15.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 5.5H6.5A1.5 1.5 0 0 0 5 7v10a1.5 1.5 0 0 0 1.5 1.5H13"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </>,
  );
}

export function IconSwitch() {
  return strokeIcon(
    <path
      d="M7 8.5h11M15.5 5.5 18.5 8.5 15.5 11.5M17 15.5H6M8.5 12.5 5.5 15.5 8.5 18.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
  );
}

export function IconHelp() {
  return strokeIcon(
    <>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M9.6 9.4a2.4 2.4 0 1 1 3.3 2.2c-.7.3-1.2.8-1.2 1.6V14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" />
    </>,
  );
}

export function IconChevron({ down = false }: { down?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={down ? 'library-chevron is-down' : 'library-chevron'}
    >
      <path
        d="m8 10 4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconCollapse() {
  return strokeIcon(
    <path
      d="M9 6.5 4.5 12 9 17.5M15 6.5 19.5 12 15 17.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
  );
}
