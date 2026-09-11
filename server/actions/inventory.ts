'use server';

import { revalidatePath } from 'next/cache';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { userMessage } from '@/server/db/errors';
import * as masters from '@/server/modules/inventory/masters';
import * as ops from '@/server/modules/inventory/ops';
import {
  fieldErrors,
  saveAdjustmentInput,
  saveItemCategoryInput,
  saveItemInput,
  saveManufacturerInput,
  saveSupplierInput,
  saveTransferInput,
  saveWarehouseInput,
} from '@/server/modules/inventory/schemas';

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fields?: Record<string, string> };

async function run<T>(
  label: string,
  work: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await work();
  } catch (error) {
    console.error(`[action:${label}]`, error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function saveSupplierAction(
  raw: unknown,
): Promise<ActionResult<{ supplierId: string }>> {
  return run('saveSupplier', async () => {
    const parsed = saveSupplierInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const permission =
      parsed.data.approvalStatus === 'APPROVED'
        ? [Permission.MastersManageSuppliers, Permission.MastersApproveSupplier]
        : Permission.MastersManageSuppliers;
    const { context } = await authorise(permission);
    const result = await masters.saveSupplier(context, parsed.data);
    revalidatePath('/purchasing/vendors');
    revalidatePath(`/purchasing/vendors/${result.supplierId}`);
    revalidatePath('/purchasing/orders');
    revalidatePath('/inventory/products');
    return { ok: true, data: result, message: 'Vendor saved.' };
  });
}

export async function saveItemCategoryAction(
  raw: unknown,
): Promise<ActionResult<{ categoryId: string }>> {
  return run('saveItemCategory', async () => {
    const { context } = await authorise(Permission.MastersManageItems);
    const parsed = saveItemCategoryInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const result = await masters.saveItemCategory(context, parsed.data);
    revalidatePath('/inventory/categories');
    return { ok: true, data: result, message: 'Category saved.' };
  });
}

export async function saveManufacturerAction(
  raw: unknown,
): Promise<ActionResult<{ manufacturerId: string }>> {
  return run('saveManufacturer', async () => {
    const { context } = await authorise(Permission.MastersManageItems);
    const parsed = saveManufacturerInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const result = await masters.saveManufacturer(context, parsed.data);
    revalidatePath('/inventory/manufacturers');
    revalidatePath('/inventory/products');
    return { ok: true, data: result, message: 'Manufacturer saved.' };
  });
}

export async function saveWarehouseAction(
  raw: unknown,
): Promise<ActionResult<{ warehouseId: string }>> {
  return run('saveWarehouse', async () => {
    const { context } = await authorise(Permission.MastersManageItems);
    const parsed = saveWarehouseInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const result = await masters.saveWarehouse(context, parsed.data);
    revalidatePath('/inventory/warehouses');
    return { ok: true, data: result, message: 'Warehouse saved.' };
  });
}

export async function saveItemAction(raw: unknown): Promise<ActionResult<{ itemId: string }>> {
  return run('saveItem', async () => {
    const { context, session, entity } = await authorise(Permission.MastersManageItems);
    const parsed = saveItemInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const openingQty = Number(parsed.data.openingQuantity ?? '0');
    if (openingQty > 0 && !can(session, entity.entityId, Permission.InvAdjustStock)) {
      return {
        ok: false,
        error: 'Opening quantity on hand requires permission to adjust stock.',
        fields: {
          openingQuantity: 'Opening quantity on hand requires permission to adjust stock.',
        },
      };
    }
    const result = await masters.saveItem(context, parsed.data);
    revalidatePath('/inventory/items');
    revalidatePath('/inventory/products');
    revalidatePath('/inventory/stock');
    revalidatePath('/inventory/adjustments');
    revalidatePath('/inventory');
    return { ok: true, data: result, message: 'Product saved.' };
  });
}

export async function saveAdjustmentAction(
  raw: unknown,
): Promise<ActionResult<{ ledgerId: string }>> {
  return run('saveAdjustment', async () => {
    const { context } = await authorise(Permission.InvAdjustStock);
    const parsed = saveAdjustmentInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const result = await ops.saveAdjustment(context, parsed.data);
    revalidatePath('/inventory/stock');
    revalidatePath('/inventory/ledger');
    revalidatePath('/inventory/units');
    revalidatePath('/inventory/adjustments');
    revalidatePath('/inventory/products');
    revalidatePath('/inventory');
    return { ok: true, data: result, message: 'Stock adjustment posted.' };
  });
}

export async function saveTransferAction(
  raw: unknown,
): Promise<ActionResult<{ transferId: string; transferOutId: string; transferInId: string }>> {
  return run('saveTransfer', async () => {
    const { context } = await authorise(Permission.InvManageStock);
    const parsed = saveTransferInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const result = await ops.saveTransfer(context, parsed.data);
    revalidatePath('/inventory/stock');
    revalidatePath('/inventory/ledger');
    revalidatePath('/inventory/units');
    revalidatePath('/inventory');
    return { ok: true, data: result, message: 'Stock transfer posted.' };
  });
}
