'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { issueAccessLink, requestOrigin, supabaseSecretKey } from '@/server/auth/admin';
import { Permission } from '@/server/auth/permissions';
import { authorise, requireSession, resolveEntity } from '@/server/auth/session';
import { userMessage } from '@/server/db/errors';
import { sendAccessEmail } from '@/server/mail/access';
import { sendFeedbackEmail } from '@/server/mail/feedback';
import { saveEntity, saveEntityLogo } from '@/server/modules/settings/company';
import {
  provisionUserInput,
  resendAccessEmailInput,
  saveEntityInput,
  saveSalesSurveySettingsInput,
  sendFeedbackInput,
  setUserActiveInput,
  setUserRoleInput,
} from '@/server/modules/settings/schemas';
import { saveSalesSurveySettings } from '@/server/modules/settings/survey';
import {
  listAssignableRoles,
  listEntityUsers,
  lookupAuthUserId,
  provisionEntityUser,
  setEntityUserActive,
  setEntityUserRole,
} from '@/server/modules/settings/users';

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fields?: Record<string, string> };

export async function saveEntityAction(raw: unknown): Promise<ActionResult<{ entityId: string }>> {
  try {
    const parsed = saveEntityInput.safeParse(raw);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '_form';
        if (!fields[key]) fields[key] = issue.message;
      }
      return { ok: false, error: 'Check the highlighted fields.', fields };
    }
    const { context } = await authorise(Permission.SettingsManage);
    const result = await saveEntity(context, parsed.data);
    revalidatePath('/settings/company');
    revalidatePath('/settings/additional');
    return { ok: true, data: result, message: 'Company details saved.' };
  } catch (error) {
    console.error('[action:saveEntity]', error);
    return { ok: false, error: userMessage(error) };
  }
}

const logoInput = z.object({
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  base64: z.string().min(1).max(1_600_000),
});

export async function saveEntityLogoAction(
  raw: unknown,
): Promise<ActionResult<{ entityId: string }>> {
  try {
    const parsed = logoInput.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Choose a PNG, JPEG, WebP or GIF under 1 MB.' };
    }
    const { context } = await authorise(Permission.SettingsManage);
    const bytes = Buffer.from(parsed.data.base64, 'base64');
    if (bytes.length > 1_048_576) {
      return { ok: false, error: 'Logo must be 1 MB or smaller.' };
    }
    const result = await saveEntityLogo(context, {
      mimeType: parsed.data.mimeType,
      bytes,
    });
    revalidatePath('/settings/company');
    revalidatePath('/');
    revalidatePath('/sales');
    return { ok: true, data: result, message: 'Company logo saved.' };
  } catch (error) {
    console.error('[action:saveEntityLogo]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function clearEntityLogoAction(): Promise<ActionResult<{ entityId: string }>> {
  try {
    const { context } = await authorise(Permission.SettingsManage);
    const result = await saveEntityLogo(context, { clear: true });
    revalidatePath('/settings/company');
    revalidatePath('/');
    revalidatePath('/sales');
    return { ok: true, data: result, message: 'Company logo reset to the default mark.' };
  } catch (error) {
    console.error('[action:clearEntityLogo]', error);
    return { ok: false, error: userMessage(error) };
  }
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function inviteUserAction(
  raw: unknown,
): Promise<ActionResult<{ userId: string; emailed: boolean; actionLink: string | null }>> {
  try {
    const parsed = provisionUserInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const { context, entity } = await authorise(Permission.UsersManage);
    const email = parsed.data.email.trim().toLowerCase();
    const origin = await requestOrigin();
    const roles = await listAssignableRoles(context);
    const roleName =
      roles.find((role) => role.code === parsed.data.roleCode)?.name ?? parsed.data.roleCode;

    let userId: string | null = null;
    let actionLink: string | null = null;
    let kind: 'invite' | 'recovery' = 'invite';

    if (supabaseSecretKey()) {
      const issued = await issueAccessLink({
        email,
        fullName: parsed.data.fullName,
        origin,
      });
      userId = issued.userId;
      actionLink = issued.actionLink;
      kind = issued.kind;
    } else {
      userId = await lookupAuthUserId(context, email);
      if (!userId) {
        return {
          ok: false,
          error:
            'That email does not have an Auth account yet. Add SUPABASE_SECRET_KEY on this host to send invites from here.',
        };
      }
    }

    await provisionEntityUser(context, {
      userId,
      email,
      fullName: parsed.data.fullName,
      roleCode: parsed.data.roleCode,
    });
    revalidatePath('/settings/users');
    revalidatePath('/');

    if (!actionLink) {
      return {
        ok: true,
        data: { userId, emailed: false, actionLink: null },
        message: 'Role saved. They can sign in if they already have a password.',
      };
    }

    try {
      await sendAccessEmail({
        kind,
        to: email,
        recipientName: parsed.data.fullName,
        companyName: entity.name,
        roleName,
        actionUrl: actionLink,
      });
    } catch (mailError) {
      console.error('[action:inviteUser:mail]', mailError);
      return {
        ok: true,
        data: { userId, emailed: false, actionLink },
        message: `Access was granted, but the email could not be sent. ${userMessage(mailError)}`,
      };
    }

    return {
      ok: true,
      data: { userId, emailed: true, actionLink: null },
      message: `Invite emailed to ${email}. They have 24 hours to set a password.`,
    };
  } catch (error) {
    console.error('[action:inviteUser]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function resendAccessEmailAction(
  raw: unknown,
): Promise<ActionResult<{ userId: string; emailed: boolean; actionLink: string | null }>> {
  try {
    const parsed = resendAccessEmailInput.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'That person was not found.' };
    }
    const { context, entity } = await authorise(Permission.UsersManage);
    const people = await listEntityUsers(context);
    const target = people.find((person) => person.id === parsed.data.userId);
    if (!target) {
      return { ok: false, error: 'That person is not in this entity.' };
    }
    if (!supabaseSecretKey()) {
      return {
        ok: false,
        error: 'Sending access email needs SUPABASE_SECRET_KEY on this host.',
      };
    }

    const origin = await requestOrigin();
    const issued = await issueAccessLink({
      email: target.email,
      fullName: target.fullName,
      origin,
    });

    try {
      await sendAccessEmail({
        kind: issued.kind,
        to: target.email,
        recipientName: target.fullName,
        companyName: entity.name,
        roleName: target.roleNames[0] ?? null,
        actionUrl: issued.actionLink,
      });
    } catch (mailError) {
      console.error('[action:resendAccessEmail:mail]', mailError);
      return {
        ok: true,
        data: { userId: target.id, emailed: false, actionLink: issued.actionLink },
        message: `The email could not be sent. ${userMessage(mailError)}`,
      };
    }

    return {
      ok: true,
      data: { userId: target.id, emailed: true, actionLink: null },
      message: `Access email sent to ${target.email}.`,
    };
  } catch (error) {
    console.error('[action:resendAccessEmail]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function setUserRoleAction(raw: unknown): Promise<ActionResult<{ userId: string }>> {
  try {
    const parsed = setUserRoleInput.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Choose a role from the list.' };
    }
    const { context } = await authorise(Permission.UsersManage);
    const people = await listEntityUsers(context);
    const target = people.find((person) => person.id === parsed.data.userId);
    if (!target) {
      return { ok: false, error: 'That person is not in this entity.' };
    }
    await setEntityUserRole(context, {
      userId: parsed.data.userId,
      roleCode: parsed.data.roleCode,
      email: target.email,
      fullName: target.fullName,
    });
    revalidatePath('/settings/users');
    revalidatePath('/');
    return { ok: true, data: { userId: parsed.data.userId }, message: 'Role saved.' };
  } catch (error) {
    console.error('[action:setUserRole]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function setUserActiveAction(raw: unknown): Promise<ActionResult<{ userId: string }>> {
  try {
    const parsed = setUserActiveInput.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'That person was not found.' };
    }
    const { context, session } = await authorise(Permission.UsersManage);
    if (parsed.data.userId === session.userId && !parsed.data.isActive) {
      return { ok: false, error: 'You cannot deactivate your own account.' };
    }
    await setEntityUserActive(context, parsed.data);
    revalidatePath('/settings/users');
    revalidatePath('/');
    return {
      ok: true,
      data: { userId: parsed.data.userId },
      message: parsed.data.isActive ? 'Access restored.' : 'Access revoked.',
    };
  } catch (error) {
    console.error('[action:setUserActive]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function saveSalesSurveySettingsAction(
  raw: unknown,
): Promise<ActionResult<undefined>> {
  try {
    const parsed = saveSalesSurveySettingsInput.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the survey options and try again.' };
    }
    const { context } = await authorise(Permission.SettingsManage);
    await saveSalesSurveySettings(context, parsed.data);
    revalidatePath('/settings/sales');
    revalidatePath('/customers');
    revalidatePath('/customers/reviews');
    return { ok: true, data: undefined, message: 'Survey settings saved.' };
  } catch (error) {
    console.error('[action:saveSalesSurveySettings]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function sendFeedbackAction(raw: unknown): Promise<ActionResult> {
  try {
    const parsed = sendFeedbackInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const session = await requireSession();
    const entity = await resolveEntity(session);
    await sendFeedbackEmail({
      senderName: session.fullName,
      senderEmail: session.email,
      companyName: entity.name,
      topic: parsed.data.topic,
      scope: parsed.data.scope,
      message: parsed.data.message,
      page: parsed.data.page ?? '',
      pageTitle: parsed.data.pageTitle ?? '',
    });
    return { ok: true, data: undefined, message: 'Thanks — we have the message.' };
  } catch (error) {
    console.error('[action:sendFeedback]', error);
    return { ok: false, error: userMessage(error) };
  }
}
