'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Permission } from '@/server/auth/permissions';
import { authorise, can, requireSession, resolveEntity } from '@/server/auth/session';
import { PermissionDeniedError, userMessage } from '@/server/db/errors';
import { withReadOnlyTransaction, withTransaction } from '@/server/db/transaction';
import type { DocumentLayout, DocumentType } from '@/lib/document-layout';
import { mergeLayout } from '@/lib/document-layout';

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string };

const saveLayoutInput = z.object({
  documentType: z.enum(['INVOICE', 'SALES_RECEIPT', 'ESTIMATE', 'CREDIT_NOTE', 'SALES_ORDER']),
  settings: z.record(z.string(), z.unknown()),
});

export async function getDocumentLayout(
  documentType: DocumentType,
): Promise<DocumentLayout> {
  const session = await requireSession();
  const entity = await resolveEntity(session);
  if (
    !can(session, entity.entityId, Permission.SalesInvoiceCreate) &&
    !can(session, entity.entityId, Permission.SettingsManage)
  ) {
    throw new PermissionDeniedError(
      'You do not have permission to do that (sales.invoice.create or settings.manage required)',
    );
  }
  const context = {
    userId: session.userId,
    entityId: entity.entityId,
    requestId: session.requestId,
  };
  const raw = await withReadOnlyTransaction(context, (tx) =>
    tx.scalar<string>(`select app.get_document_layout($1, $2)::text`, [
      context.entityId,
      documentType,
    ]),
  );
  return mergeLayout(JSON.parse(raw) as Partial<DocumentLayout>);
}

export async function saveDocumentLayoutAction(
  raw: unknown,
): Promise<ActionResult<DocumentLayout>> {
  try {
    const parsed = saveLayoutInput.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Invalid layout settings.' };
    }
    const { context } = await authorise(Permission.SettingsManage);
    const result = await withTransaction(context, (tx) =>
      tx.scalar<string>(`select app.save_document_layout($1, $2, $3::jsonb)::text`, [
        context.entityId,
        parsed.data.documentType,
        JSON.stringify(parsed.data.settings),
      ]),
    );
    revalidatePath('/sales');
    revalidatePath('/settings/form-styles');
    return { ok: true, data: mergeLayout(JSON.parse(result) as Partial<DocumentLayout>) };
  } catch (error) {
    console.error('[action:saveDocumentLayout]', error);
    return { ok: false, error: userMessage(error) };
  }
}
