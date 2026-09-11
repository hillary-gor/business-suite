'use server';

import { revalidatePath } from 'next/cache';
import { PlatformModule } from '@/lib/platform/modules';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { requestOrigin } from '@/server/auth/admin';
import { userMessage } from '@/server/db/errors';
import { libraryDocumentShareEmail } from '@/server/mail/library-share-email';
import { sendTransactionalEmail } from '@/server/mail/send';
import { enqueueAndRunLibraryOcr } from '@/server/modules/library/ocr';
import {
  addLibraryDocumentToCollection,
  addLibraryDocumentComment,
  deleteLibraryCollection,
  decideLibraryDocumentAccess,
  getLibraryDocumentPerson,
  linkLibraryDocument,
  listLibraryShareColleagues,
  markLibraryNotificationRead,
  requestLibraryDocumentAccess,
  removeLibraryDocumentFromCollection,
  saveLibraryCollection,
  searchLibraryLinkTargets,
  shareLibraryDocument,
  toggleLibraryCommentReaction,
  unlinkLibraryDocument,
  getLibraryDocument,
} from '@/server/modules/library/queries';
import {
  addLibraryCommentInput,
  fieldErrors,
  listLibraryShareColleaguesInput,
  saveLibraryCollectionInput,
  shareLibraryDocumentInput,
  toggleLibraryCommentReactionInput,
} from '@/server/modules/library/schemas';
import {
  LIBRARY_LINK_KINDS,
  LIBRARY_SHARE_CHANNEL_LABELS,
  type LibraryColleague,
  type LibraryComment,
  type LibraryDocumentShare,
  type LibraryLinkKind,
} from '@/server/modules/library/types';
import type { ActionResult } from '@/server/actions/library';
import { z } from 'zod';

function revalidateLibrary(documentId?: string, collectionId?: string) {
  revalidatePath('/library', 'layout');
  revalidatePath('/library');
  revalidatePath('/library/documents');
  revalidatePath('/library/collections');
  if (documentId) revalidatePath(`/library/documents/${documentId}`);
  if (collectionId) revalidatePath(`/library/collections/${collectionId}`);
}

export async function saveLibraryCollectionAction(
  raw: unknown,
): Promise<ActionResult<{ collectionId: string }>> {
  try {
    const parsed = saveLibraryCollectionInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      };
    }
    const { context } = await authorise(Permission.LibraryDocumentManage, {
      module: PlatformModule.Library,
    });
    const result = await saveLibraryCollection(context, {
      collectionId: parsed.data.collectionId,
      name: parsed.data.name,
      description: parsed.data.description,
    });
    revalidateLibrary(undefined, result.collectionId);
    return {
      ok: true,
      data: result,
      message: parsed.data.collectionId ? 'Collection saved.' : 'Collection created.',
    };
  } catch (error) {
    console.error('[action:saveLibraryCollection]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function deleteLibraryCollectionAction(
  collectionId: string,
): Promise<ActionResult<{ collectionId: string }>> {
  try {
    if (!collectionId) return { ok: false, error: 'Missing collection.' };
    const { context } = await authorise(Permission.LibraryDocumentManage, {
      module: PlatformModule.Library,
    });
    const result = await deleteLibraryCollection(context, collectionId);
    revalidateLibrary();
    return {
      ok: true,
      data: result,
      message: 'Collection deleted. The files are still in the catalogue.',
    };
  } catch (error) {
    console.error('[action:deleteLibraryCollection]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function addLibraryDocumentToCollectionAction(
  collectionId: string,
  documentId: string,
): Promise<ActionResult> {
  try {
    if (!collectionId || !documentId)
      return { ok: false, error: 'Missing document or collection.' };
    const { context } = await authorise(Permission.LibraryDocumentManage, {
      module: PlatformModule.Library,
    });
    await addLibraryDocumentToCollection(context, collectionId, documentId);
    revalidateLibrary(documentId, collectionId);
    return { ok: true, data: undefined, message: 'Added to collection.' };
  } catch (error) {
    console.error('[action:addLibraryDocumentToCollection]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function removeLibraryDocumentFromCollectionAction(
  collectionId: string,
  documentId: string,
): Promise<ActionResult> {
  try {
    if (!collectionId || !documentId)
      return { ok: false, error: 'Missing document or collection.' };
    const { context } = await authorise(Permission.LibraryDocumentManage, {
      module: PlatformModule.Library,
    });
    await removeLibraryDocumentFromCollection(context, collectionId, documentId);
    revalidateLibrary(documentId, collectionId);
    return { ok: true, data: undefined, message: 'Removed from collection.' };
  } catch (error) {
    console.error('[action:removeLibraryDocumentFromCollection]', error);
    return { ok: false, error: userMessage(error) };
  }
}

const linkKind = z.enum(LIBRARY_LINK_KINDS);

export async function searchLibraryLinkTargetsAction(
  kind: unknown,
  query: unknown,
): Promise<ActionResult<{ recordId: string; label: string; hint: string | null }[]>> {
  try {
    const parsedKind = linkKind.safeParse(kind);
    const parsedQuery = z
      .string()
      .trim()
      .max(80)
      .safeParse(typeof query === 'string' ? query : '');
    if (!parsedKind.success || !parsedQuery.success) {
      return { ok: false, error: 'Choose what to search for.' };
    }
    const { context } = await authorise(Permission.LibraryDocumentManage, {
      module: PlatformModule.Library,
    });
    const rows = await searchLibraryLinkTargets(context, parsedKind.data, parsedQuery.data);
    return { ok: true, data: rows };
  } catch (error) {
    console.error('[action:searchLibraryLinkTargets]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function linkLibraryDocumentAction(
  documentId: string,
  kind: LibraryLinkKind,
  recordId: string,
): Promise<ActionResult> {
  try {
    if (!documentId || !recordId) return { ok: false, error: 'Missing link.' };
    if (!(LIBRARY_LINK_KINDS as readonly string[]).includes(kind)) {
      return { ok: false, error: 'Unknown link type.' };
    }
    const { context } = await authorise(Permission.LibraryDocumentManage, {
      module: PlatformModule.Library,
    });
    await linkLibraryDocument(context, documentId, kind, recordId);
    revalidateLibrary(documentId);
    return { ok: true, data: undefined, message: 'Linked.' };
  } catch (error) {
    console.error('[action:linkLibraryDocument]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function unlinkLibraryDocumentAction(
  documentId: string,
  kind: LibraryLinkKind,
  recordId: string,
): Promise<ActionResult> {
  try {
    if (!documentId || !recordId) return { ok: false, error: 'Missing link.' };
    const { context } = await authorise(Permission.LibraryDocumentManage, {
      module: PlatformModule.Library,
    });
    await unlinkLibraryDocument(context, documentId, kind, recordId);
    revalidateLibrary(documentId);
    return { ok: true, data: undefined, message: 'Link removed.' };
  } catch (error) {
    console.error('[action:unlinkLibraryDocument]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function retryLibraryOcrAction(documentId: string): Promise<ActionResult> {
  try {
    if (!documentId) return { ok: false, error: 'Missing document.' };
    const { context } = await authorise(Permission.LibraryDocumentUpload, {
      module: PlatformModule.Library,
    });
    await enqueueAndRunLibraryOcr(context, documentId, true);
    revalidateLibrary(documentId);
    return { ok: true, data: undefined, message: 'OCR queued. Refresh in a minute.' };
  } catch (error) {
    console.error('[action:retryLibraryOcr]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function requestLibraryDocumentAccessAction(
  documentId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    if (!documentId) return { ok: false, error: 'Missing document.' };
    const { context } = await authorise(Permission.LibraryDocumentRead, {
      module: PlatformModule.Library,
    });
    await requestLibraryDocumentAccess(context, documentId, reason);
    revalidateLibrary(documentId);
    revalidatePath('/library', 'layout');
    return {
      ok: true,
      data: undefined,
      message: 'Request sent. You will be notified when it is decided.',
    };
  } catch (error) {
    console.error('[action:requestLibraryDocumentAccess]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function decideLibraryDocumentAccessAction(
  documentId: string,
  requestId: string,
  approve: boolean,
): Promise<ActionResult> {
  try {
    if (!documentId || !requestId) return { ok: false, error: 'Missing request.' };
    const { context } = await authorise(Permission.LibraryDocumentManage, {
      module: PlatformModule.Library,
    });
    await decideLibraryDocumentAccess(context, requestId, approve);
    revalidateLibrary(documentId);
    revalidatePath('/library', 'layout');
    return {
      ok: true,
      data: undefined,
      message: approve ? 'Access granted for this file.' : 'Request refused.',
    };
  } catch (error) {
    console.error('[action:decideLibraryDocumentAccess]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function markLibraryNotificationReadAction(
  notificationId: string,
): Promise<ActionResult> {
  try {
    if (!notificationId) return { ok: false, error: 'Missing notification.' };
    const { context } = await authorise(Permission.LibraryDocumentRead, {
      module: PlatformModule.Library,
    });
    await markLibraryNotificationRead(context, notificationId);
    revalidatePath('/library', 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    console.error('[action:markLibraryNotificationRead]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function getLibraryDocumentPersonAction(
  documentId: string,
  userId: string,
): Promise<ActionResult<{ person: LibraryColleague }>> {
  try {
    if (!documentId || !userId) return { ok: false, error: 'Missing person.' };
    const { context } = await authorise(Permission.LibraryDocumentRead, {
      module: PlatformModule.Library,
    });
    const person = await getLibraryDocumentPerson(context, documentId, userId);
    return { ok: true, data: { person } };
  } catch (error) {
    console.error('[action:getLibraryDocumentPerson]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function addLibraryDocumentCommentAction(
  raw: unknown,
): Promise<ActionResult<{ comments: LibraryComment[] }>> {
  try {
    const parsed = addLibraryCommentInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'Write a comment.',
        fields: fieldErrors(parsed.error),
      };
    }
    const { context } = await authorise(Permission.LibraryDocumentRead, {
      module: PlatformModule.Library,
    });
    const comments = await addLibraryDocumentComment(
      context,
      parsed.data.documentId,
      parsed.data.body,
    );
    revalidateLibrary(parsed.data.documentId);
    revalidatePath('/library', 'layout');
    return { ok: true, data: { comments } };
  } catch (error) {
    console.error('[action:addLibraryDocumentComment]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function toggleLibraryCommentReactionAction(
  raw: unknown,
): Promise<ActionResult<{ comments: LibraryComment[] }>> {
  try {
    const parsed = toggleLibraryCommentReactionInput.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'That reaction is not allowed.' };
    }
    const { context } = await authorise(Permission.LibraryDocumentRead, {
      module: PlatformModule.Library,
    });
    const comments = await toggleLibraryCommentReaction(
      context,
      parsed.data.documentId,
      parsed.data.commentId,
      parsed.data.emoji,
    );
    revalidateLibrary(parsed.data.documentId);
    return { ok: true, data: { comments } };
  } catch (error) {
    console.error('[action:toggleLibraryCommentReaction]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function listLibraryShareColleaguesAction(
  raw: unknown,
): Promise<ActionResult<{ people: LibraryColleague[] }>> {
  try {
    const parsed = listLibraryShareColleaguesInput.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Choose a file to share.' };
    }
    const { context } = await authorise(Permission.LibraryDocumentRead, {
      module: PlatformModule.Library,
    });
    const people = await listLibraryShareColleagues(
      context,
      parsed.data.documentId,
      parsed.data.query ?? '',
    );
    return { ok: true, data: { people } };
  } catch (error) {
    console.error('[action:listLibraryShareColleagues]', error);
    return { ok: false, error: userMessage(error) };
  }
}

function shareSuccessMessage(input: {
  channel: keyof typeof LIBRARY_SHARE_CHANNEL_LABELS;
  granted: boolean;
  emailed: boolean;
  emailFailed: boolean;
}): string {
  if (input.channel === 'link') {
    return 'Link copied. Opening it still needs a Skyjet sign-in.';
  }
  if (input.channel === 'whatsapp') {
    return 'Recorded. Opening the file still needs a Skyjet sign-in.';
  }
  if (input.emailFailed) {
    return 'Shared in Library, but the email could not be sent.';
  }
  if (input.channel === 'email' && input.emailed) {
    return input.granted
      ? 'Email sent. They can open this file, and they will see a notice in Library.'
      : 'Email sent. They will also see a notice in Library.';
  }
  if (input.granted) {
    return 'Shared in Library. They can open this file, and they will see a notice.';
  }
  return 'Shared in Library. They will see a notice.';
}

export async function shareLibraryDocumentAction(
  raw: unknown,
): Promise<ActionResult<{ shares: LibraryDocumentShare[] }>> {
  try {
    const parsed = shareLibraryDocumentInput.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'Choose how to share.',
        fields: fieldErrors(parsed.error),
      };
    }
    const channel = parsed.data.channel;
    const recipientUserId = parsed.data.recipientUserId ?? null;
    if ((channel === 'internal' || channel === 'email') && !recipientUserId) {
      return { ok: false, error: 'Choose a colleague.' };
    }
    if ((channel === 'link' || channel === 'whatsapp') && recipientUserId) {
      return { ok: false, error: 'A copied link does not name a recipient.' };
    }

    const { context, session, entity } = await authorise(Permission.LibraryDocumentRead, {
      module: PlatformModule.Library,
    });
    const result = await shareLibraryDocument(context, {
      documentId: parsed.data.documentId,
      channel,
      recipientUserId,
      note: parsed.data.note?.trim() ? parsed.data.note.trim() : null,
    });

    let emailed = false;
    let emailFailed = false;
    if (channel === 'email' && recipientUserId) {
      const share = result.shares.find((row) => row.id === result.shareId);
      const to = share?.recipientEmail?.trim();
      if (share && to) {
        try {
          const document = await getLibraryDocument(context, parsed.data.documentId);
          const origin = await requestOrigin();
          const mail = libraryDocumentShareEmail({
            companyName: entity.name,
            recipientName: share.recipientName ?? 'there',
            sharerName: session.fullName,
            documentTitle: document.title,
            documentUrl: `${origin}/library/documents/${parsed.data.documentId}`,
            note: share.note,
          });
          await sendTransactionalEmail({
            to,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            fromName: entity.name,
            tags: [
              { name: 'kind', value: 'library_share' },
              { name: 'document_id', value: parsed.data.documentId },
            ],
          });
          emailed = true;
        } catch (error) {
          console.error('[action:shareLibraryDocument:email]', error);
          emailFailed = true;
        }
      } else {
        emailFailed = true;
      }
    }

    revalidateLibrary(parsed.data.documentId);
    revalidatePath('/library', 'layout');
    return {
      ok: true,
      data: { shares: result.shares },
      message: shareSuccessMessage({
        channel,
        granted: result.granted,
        emailed,
        emailFailed,
      }),
    };
  } catch (error) {
    console.error('[action:shareLibraryDocument]', error);
    return { ok: false, error: userMessage(error) };
  }
}
