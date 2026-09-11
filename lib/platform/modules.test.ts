import { describe, expect, it } from 'vitest';
import {
  isModuleEnabled,
  moduleDefinition,
  PlatformModule,
  PLATFORM_MODULE_CATALOG,
} from './modules';

describe('platform modules', () => {
  it('lists the modules the workspace can offer without naming a customer', () => {
    expect(PLATFORM_MODULE_CATALOG.map((entry) => entry.code)).toEqual([
      PlatformModule.BusinessSuite,
      PlatformModule.Library,
    ]);
    expect(moduleDefinition(PlatformModule.Library).name).toBe('Skyjet Library');
    expect(moduleDefinition(PlatformModule.BusinessSuite).name).toBe('Skyjet Business Suite');
    expect(moduleDefinition(PlatformModule.Library).href).toBe('/library');
    expect(moduleDefinition(PlatformModule.BusinessSuite).href).toBe('/business-suite');
    expect(moduleDefinition(PlatformModule.Library).highlights.length).toBeGreaterThan(0);
  });

  it('treats a missing entitlement set as locked, not as an open door', () => {
    expect(isModuleEnabled(undefined, PlatformModule.BusinessSuite)).toBe(false);
    expect(isModuleEnabled(new Set(), PlatformModule.Library)).toBe(false);
    expect(isModuleEnabled(new Set([PlatformModule.Library]), PlatformModule.Library)).toBe(true);
    expect(isModuleEnabled(new Set([PlatformModule.Library]), PlatformModule.BusinessSuite)).toBe(
      false,
    );
  });
});
