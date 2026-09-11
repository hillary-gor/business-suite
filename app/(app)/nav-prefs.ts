import type { AppNavGroupId } from './nav-model';

export const NAV_PREFS_KEY = 'skyjet.nav-prefs';

const GROUP_IDS: readonly AppNavGroupId[] = [
  'customers',
  'sales',
  'purchasing',
  'inventory',
  'accounting',
  'team',
  'reports',
  'compliance',
];

/** Pins from before Customer Hub existed. Used to place the new rail item. */
const LEGACY_DEFAULT_PINNED: readonly string[] = [
  'sales',
  'purchasing',
  'inventory',
  'accounting',
  'reports',
];

export const DEFAULT_PINNED: readonly AppNavGroupId[] = [
  'sales',
  'customers',
  'purchasing',
  'inventory',
  'accounting',
  'reports',
];

export type NavPrefs = {
  labels: boolean;
  pinned: AppNavGroupId[];
  paneHidden: boolean;
};

export function defaultNavPrefs(): NavPrefs {
  return {
    labels: true,
    pinned: [...DEFAULT_PINNED],
    paneHidden: false,
  };
}

export function parseNavPrefs(raw: unknown): NavPrefs {
  const fallback = defaultNavPrefs();
  if (!raw || typeof raw !== 'object') return fallback;
  const row = raw as Partial<NavPrefs>;
  const pinned = Array.isArray(row.pinned)
    ? withCustomerHubPin(
        row.pinned.filter(
          (id): id is AppNavGroupId =>
            typeof id === 'string' && GROUP_IDS.includes(id as AppNavGroupId),
        ),
      )
    : fallback.pinned;
  return {
    labels: row.labels !== false,
    pinned,
    paneHidden: row.paneHidden === true,
  };
}

export function loadNavPrefs(): NavPrefs {
  if (typeof window === 'undefined') return defaultNavPrefs();
  try {
    const stored = window.localStorage.getItem(NAV_PREFS_KEY);
    if (!stored) return defaultNavPrefs();
    return parseNavPrefs(JSON.parse(stored));
  } catch {
    return defaultNavPrefs();
  }
}

export function saveNavPrefs(prefs: NavPrefs): void {
  window.localStorage.setItem(NAV_PREFS_KEY, JSON.stringify(prefs));
}

function withCustomerHubPin(pinned: AppNavGroupId[]): AppNavGroupId[] {
  if (pinned.includes('customers')) return pinned;
  const isLegacyDefault =
    pinned.length === LEGACY_DEFAULT_PINNED.length &&
    LEGACY_DEFAULT_PINNED.every((id, index) => pinned[index] === id);
  if (!isLegacyDefault) return pinned;
  return ['sales', 'customers', ...pinned.slice(1)];
}
