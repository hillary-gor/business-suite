import { describe, expect, it } from 'vitest';
import { saveItemInput } from '@/server/modules/inventory/schemas';

const warehouseId = '11111111-1111-4111-8111-111111111111';

function inventory(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Brake pads',
    itemType: 'INVENTORY',
    uomCode: 'EA',
    trackingMode: 'NONE',
    ...overrides,
  };
}

function issueOn(
  error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> },
  path: string,
) {
  return error.issues.find((issue) => issue.path.join('.') === path)?.message;
}

describe('saveItemInput opening quantity', () => {
  it('accepts a new inventory item without opening stock', () => {
    const parsed = saveItemInput.safeParse(inventory());
    expect(parsed.success).toBe(true);
  });

  it('accepts opening quantity when warehouse, date and cost are present', () => {
    const parsed = saveItemInput.safeParse(
      inventory({
        warehouseId,
        openingQuantity: '12.5',
        openingDate: '2026-09-05',
        purchaseCost: '40',
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it('refuses opening quantity on a serial-tracked item', () => {
    const parsed = saveItemInput.safeParse(
      inventory({
        trackingMode: 'SERIAL',
        warehouseId,
        openingQuantity: '2',
        openingDate: '2026-09-05',
        purchaseCost: '40',
      }),
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(issueOn(parsed.error, 'trackingMode')).toMatch(/average-cost tracking/i);
  });

  it('requires warehouse, as-of date and purchase cost when quantity is above zero', () => {
    const parsed = saveItemInput.safeParse(inventory({ openingQuantity: '3' }));
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(issueOn(parsed.error, 'warehouseId')).toMatch(/warehouse/i);
    expect(issueOn(parsed.error, 'openingDate')).toMatch(/as of date/i);
    expect(issueOn(parsed.error, 'purchaseCost')).toMatch(/purchase cost/i);
  });

  it('refuses opening quantity on a service', () => {
    const parsed = saveItemInput.safeParse(
      inventory({
        itemType: 'SERVICE',
        warehouseId,
        openingQuantity: '1',
        openingDate: '2026-09-05',
        purchaseCost: '10',
      }),
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(issueOn(parsed.error, 'openingQuantity')).toMatch(/inventory item/i);
  });
});
