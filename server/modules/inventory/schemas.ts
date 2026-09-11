import { z } from 'zod';
import { ADJUSTMENT_REASONS } from '@/lib/inventory-list';

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const saveSupplierInput = z.object({
  supplierId: z.string().uuid().optional(),
  code: z.string().trim().max(40).optional(),
  legalName: z.string().trim().min(2).max(200),
  tradingName: z.string().trim().max(200).optional(),
  taxPin: z.string().trim().max(40).optional(),
  currencyCode: z.string().length(3).optional(),
  paymentTermsId: z.string().uuid().optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
  isForeign: z.boolean().optional(),
  approvalStatus: z.enum(['PENDING', 'APPROVED', 'SUSPENDED', 'BLACKLISTED']).optional(),
  isActive: z.boolean().optional(),
});

export const saveItemCategoryInput = z.object({
  categoryId: z.string().uuid().optional(),
  code: z.string().trim().max(40).optional(),
  name: z.string().trim().min(2).max(200),
  parentId: z.string().uuid().optional(),
  ataChapter: z.string().trim().max(10).optional(),
  isActive: z.boolean().optional(),
});

export const saveManufacturerInput = z.object({
  manufacturerId: z.string().uuid().optional(),
  code: z.string().trim().max(40).optional(),
  name: z.string().trim().min(2).max(200),
  cageCode: z.string().trim().max(20).optional(),
  countryCode: z.string().length(2).optional(),
  isActive: z.boolean().optional(),
});

export const saveWarehouseInput = z.object({
  warehouseId: z.string().uuid().optional(),
  code: z.string().trim().max(40).optional(),
  name: z.string().trim().min(2).max(200),
  inventoryAccountId: z.string().uuid().optional(),
  isConsignment: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const saveItemInput = z
  .object({
    itemId: z.string().uuid().optional(),
    partNumber: z.string().trim().max(80).optional(),
    description: z.string().trim().min(2).max(500),
    salesDescription: z.string().trim().max(1000).optional(),
    purchaseDescription: z.string().trim().max(1000).optional(),
    salesPrice: z.string().trim().optional(),
    purchaseCost: z.string().trim().optional(),
    preferredSupplierId: z.string().uuid().optional(),
    itemType: z.enum(['INVENTORY', 'NON_INVENTORY', 'SERVICE']).default('INVENTORY'),
    categoryId: z.string().uuid().optional(),
    manufacturerId: z.string().uuid().optional(),
    manufacturerPartNumber: z.string().trim().max(80).optional(),
    nsn: z.string().trim().max(40).optional(),
    uomCode: z.string().trim().min(1).max(6).default('EA'),
    trackingMode: z.enum(['NONE', 'LOT', 'SERIAL']).optional(),
    costingMethod: z.enum(['WEIGHTED_AVERAGE', 'SPECIFIC']).optional(),
    requiresCertificate: z.boolean().optional(),
    requiresSerialOnReceipt: z.boolean().optional(),
    isLifeLimited: z.boolean().optional(),
    shelfLifeDays: z.number().int().positive().optional(),
    isHazardous: z.boolean().optional(),
    isDangerousGoods: z.boolean().optional(),
    unNumber: z.string().trim().max(20).optional(),
    isExportControlled: z.boolean().optional(),
    eccn: z.string().trim().max(20).optional(),
    defaultTaxCodeId: z.string().uuid().optional(),
    inventoryAccountId: z.string().uuid().optional(),
    cogsAccountId: z.string().uuid().optional(),
    revenueAccountId: z.string().uuid().optional(),
    reorderPoint: z.string().trim().optional(),
    reorderQuantity: z.string().trim().optional(),
    leadTimeDays: z.number().int().nonnegative().optional(),
    isStocked: z.boolean().optional(),
    isSellable: z.boolean().optional(),
    isPurchasable: z.boolean().optional(),
    isActive: z.boolean().optional(),
    image: z
      .object({
        mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
        base64: z.string().min(1).max(1_600_000),
      })
      .nullable()
      .optional(),
    warehouseId: z.string().uuid().optional(),
    openingQuantity: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,4})?$/, 'Enter a quantity with up to four decimal places')
      .optional(),
    openingDate: isoDate.optional(),
  })
  .superRefine((data, ctx) => {
    const qty = Number(data.openingQuantity ?? '0');
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (data.itemId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Opening quantity can only be set when the product is created',
        path: ['openingQuantity'],
      });
    }
    if (data.itemType !== 'INVENTORY') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only an inventory item can start with quantity on hand',
        path: ['openingQuantity'],
      });
    }
    if ((data.trackingMode ?? 'NONE') !== 'NONE') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Opening quantity needs average-cost tracking. Receive serial or lot stock on a goods receipt.',
        path: ['trackingMode'],
      });
    }
    if (!data.warehouseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose a warehouse for the opening quantity',
        path: ['warehouseId'],
      });
    }
    if (!data.openingDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'As of date is required for opening quantity',
        path: ['openingDate'],
      });
    }
    if (!data.purchaseCost) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Purchase cost is the unit cost of the opening quantity',
        path: ['purchaseCost'],
      });
    }
  });

const quantityString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,4})?$/, 'Enter a positive quantity with up to four decimal places')
  .refine((v) => Number(v) > 0, 'Quantity must be greater than zero');

const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,4})?$/, 'Enter an amount with up to four decimal places');

export const saveAdjustmentInput = z
  .object({
    itemId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    quantity: quantityString,
    direction: z.enum(['IN', 'OUT']),
    reference: z.string().trim().max(40).optional(),
    reason: z.enum(ADJUSTMENT_REASONS).default('OTHER'),
    adjustmentAccountId: z.string().uuid().optional(),
    stockUnitId: z.string().uuid().optional(),
    stockLotId: z.string().uuid().optional(),
    unitCostBase: moneyString.optional(),
    notes: z.string().trim().max(2000).optional(),
    movementDate: isoDate.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.direction === 'IN' && (data.unitCostBase === undefined || data.unitCostBase === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unit cost is required for an inbound adjustment',
        path: ['unitCostBase'],
      });
    }
  });

export const saveTransferInput = z
  .object({
    itemId: z.string().uuid(),
    fromWarehouseId: z.string().uuid(),
    toWarehouseId: z.string().uuid(),
    quantity: quantityString,
    stockUnitId: z.string().uuid().optional(),
    stockLotId: z.string().uuid().optional(),
    notes: z.string().trim().max(2000).optional(),
    movementDate: isoDate.optional(),
  })
  .refine((data) => data.fromWarehouseId !== data.toWarehouseId, {
    message: 'Source and destination warehouses must differ',
    path: ['toWarehouseId'],
  });

export type SaveSupplierInput = z.infer<typeof saveSupplierInput>;
export type SaveItemCategoryInput = z.infer<typeof saveItemCategoryInput>;
export type SaveManufacturerInput = z.infer<typeof saveManufacturerInput>;
export type SaveWarehouseInput = z.infer<typeof saveWarehouseInput>;
export type SaveItemInput = z.infer<typeof saveItemInput>;
export type SaveAdjustmentInput = z.infer<typeof saveAdjustmentInput>;
export type SaveTransferInput = z.infer<typeof saveTransferInput>;
