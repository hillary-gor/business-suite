import { PlatformModule, type PlatformModuleCode } from '@/lib/platform/modules';

/** Original illustrations for the workspace cards. Not stock photography. */
export function WorkspaceModuleArt({ module }: { module: PlatformModuleCode }) {
  if (module === PlatformModule.Library) return <LibraryArt />;
  return <BusinessSuiteArt />;
}

function LibraryArt() {
  return (
    <svg
      className="workspace-card__svg"
      viewBox="0 0 360 176"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="ws-lib-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cfe4ff" />
          <stop offset="55%" stopColor="#e8f1fc" />
          <stop offset="100%" stopColor="#f7f9fc" />
        </linearGradient>
        <linearGradient id="ws-lib-paper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f3f6fb" />
        </linearGradient>
      </defs>
      <rect width="360" height="176" rx="20" fill="url(#ws-lib-sky)" />
      <path d="M0 124c48-10 96-10 180 0s132 14 180 4v48H0V124z" fill="#dbeafe" opacity="0.9" />
      <path d="M0 138h360" stroke="#93c5fd" strokeWidth="1" opacity="0.55" />
      <g transform="translate(208 34)">
        <path
          d="M6 46 78 38c18-16 38-22 56-20 5 0 5 7-1 10L92 48l52 8v6l-54-2-16 22h-12l8-22-48 4c-14 1-18-6-16-12z"
          fill="#0071e3"
        />
        <path d="M86 36h18" stroke="#1d4ed8" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g transform="translate(28 42)">
        <rect x="22" y="16" width="92" height="108" rx="10" fill="#e8eef8" stroke="#d2d2d7" />
        <rect x="11" y="8" width="92" height="108" rx="10" fill="#f8fafc" stroke="#d2d2d7" />
        <rect
          x="0"
          y="0"
          width="92"
          height="108"
          rx="10"
          fill="url(#ws-lib-paper)"
          stroke="#c7c7cc"
        />
        <path
          d="M16 22h60M16 36h60M16 50h40"
          stroke="#0071e3"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M16 72h32" stroke="#d2d2d7" strokeWidth="3" strokeLinecap="round" />
        <circle cx="24" cy="90" r="7" fill="#0071e3" />
        <path d="M24 86.5v7M20.5 90h7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function BusinessSuiteArt() {
  return (
    <svg
      className="workspace-card__svg"
      viewBox="0 0 360 176"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="360" height="176" rx="20" fill="#ececef" />
      <rect x="24" y="28" width="204" height="120" rx="14" fill="#fff" stroke="#e8e8ed" />
      <path
        d="M52 116V86M86 116V58M120 116V76M154 116V48M188 116V92"
        stroke="#0071e3"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <rect x="248" y="44" width="88" height="88" rx="18" fill="#e8f1fc" />
      <path
        d="M262 96c12-4 32-18 50-22 6-1 10 4 7 9-7 11-22 17-38 22l-7 14c-2 3-7 3-8 0l-3-11c-9 2-18 4-24 2-4-1-4-6 0-8 7-2 14-4 23-6z"
        fill="#0071e3"
      />
    </svg>
  );
}
