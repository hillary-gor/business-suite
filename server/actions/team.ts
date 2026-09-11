'use server';

import { revalidatePath } from 'next/cache';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { userMessage } from '@/server/db/errors';
import { saveEmployee, setEmployeeStatus } from '@/server/modules/team/employees';
import {
  fieldErrors,
  saveEmployeeInput,
  setEmployeeStatusInput,
} from '@/server/modules/team/schemas';

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fields?: Record<string, string> };

async function run<T>(label: string, work: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await work();
  } catch (error) {
    console.error(`[action:${label}]`, error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function saveEmployeeAction(
  raw: unknown,
): Promise<ActionResult<{ employeeId: string }>> {
  return run('saveEmployee', async () => {
    const parsed = saveEmployeeInput.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const { context } = await authorise(Permission.TeamEmployeeManage);
    const result = await saveEmployee(context, parsed.data);
    revalidatePath('/team/employees');
    revalidatePath(`/team/employees/${result.employeeId}`);
    return { ok: true, data: result, message: 'Employee saved.' };
  });
}

export async function setEmployeeStatusAction(
  raw: unknown,
): Promise<ActionResult<{ employeeId: string }>> {
  return run('setEmployeeStatus', async () => {
    const parsed = setEmployeeStatusInput.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const { context } = await authorise(Permission.TeamEmployeeManage);
    const result = await setEmployeeStatus(context, parsed.data);
    revalidatePath('/team/employees');
    revalidatePath(`/team/employees/${result.employeeId}`);
    return { ok: true, data: result, message: 'Employee updated.' };
  });
}
