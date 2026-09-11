/**
 * Product modules the platform can entitle an organisation to.
 *
 * Authentication answers "is this person signed in?". Entitlement answers
 * "may this organisation open this product?". The two are not the same, and a
 * signed-in user whose organisation is not entitled still has a valid session.
 *
 * Adding a future module (inventory, HR, fleet) means a catalogue row and a
 * code here. It does not mean a second login.
 */
import { BUSINESS_SUITE_HOME } from '@/lib/platform/entry';

export const PlatformModule = {
  BusinessSuite: 'business_suite',
  Library: 'library',
} as const;

export type PlatformModuleCode = (typeof PlatformModule)[keyof typeof PlatformModule];

export interface PlatformModuleDefinition {
  readonly code: PlatformModuleCode;
  readonly name: string;
  readonly description: string;
  readonly href: string;
  readonly highlights: readonly string[];
}

export const PLATFORM_MODULE_CATALOG: readonly PlatformModuleDefinition[] = [
  {
    code: PlatformModule.BusinessSuite,
    name: 'Skyjet Business Suite',
    description: 'Accounting, sales, purchases and reports for the organisation.',
    href: BUSINESS_SUITE_HOME,
    highlights: ['Sales and purchasing', 'Ledgers and financial reports', 'Inventory and cash'],
  },
  {
    code: PlatformModule.Library,
    name: 'Skyjet Library',
    description: 'Aircraft-spares manuals, certificates and technical records.',
    href: '/library',
    highlights: [
      'AMM, CMM and component manuals',
      'Certificates and inspection files',
      'Part and aircraft documents',
    ],
  },
];

export function moduleDefinition(code: PlatformModuleCode): PlatformModuleDefinition {
  const found = PLATFORM_MODULE_CATALOG.find((entry) => entry.code === code);
  if (!found) {
    throw new Error(`Unknown platform module: ${code}`);
  }
  return found;
}

export function isModuleEnabled(
  enabled: ReadonlySet<string> | undefined,
  code: PlatformModuleCode,
): boolean {
  return enabled?.has(code) ?? false;
}
