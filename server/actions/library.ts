'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { PlatformModule } from '@/lib/platform/modules';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { userMessage } from '@/server/db/errors';
import {
  archiveLibraryDocument,
  deleteLibraryDocument,
  findLibraryDuplicateByHash,
  getLibraryDocument,
  restoreLibraryRevision,
  saveLibraryDocument,
  searchLibraryDocuments,
  updateLibraryMetadata,
} from '@/server/modules/library/queries';
import { extractLibraryText, shouldEnqueueLibraryOcr } from '@/server/modules/library/extract';
import { enqueueAndRunLibraryOcr } from '@/server/modules/library/ocr';
import { fieldErrors, saveLibraryMetadataInput } from '@/server/modules/library/schemas';
import {
  assertLibraryFile,
  libraryRevisionObjectPath,
  removeLibraryObject,
  removeLibraryObjects,
  sanitizeLibraryFileName,
  sha256Hex,
  uploadLibraryObject,
} from '@/server/modules/library/storage';
import {
  libraryJumpPages,
  matchJumpPages,
  parseLibrarySearchQuery,
} from '@/server/modules/library/search';
import { listEntityUsers } from '@/server/modules/settings/users';
import { z } from 'zod';
import { LIBRARY_CLASSIFICATIONS } from '@/server/modules/library/types';
import type { LibraryClassification, LibraryDocumentType } from '@/server/modules/library/types';

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fields?: Record<string, string>; duplicate?: LibraryDuplicate };

export type LibraryDuplicate = { id: string; title: string };

function textField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function fileBuffer(file: File): Promise<Buffer> {
  return Buffer.from(await file.arrayBuffer());
}

export async function uploadLibraryDocumentAction(
  formData: FormData,
): Promise<ActionResult<{ documentId: string }>> {
  try {
    const { context } = await authorise(Permission.LibraryDocumentUpload, {
      module: PlatformModule.Library,
    });

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return {
        ok: false,
        error: 'Choose a file to upload.',
        fields: { file: 'A file is required.' },
      };
    }
    assertLibraryFile(file);

    const title = textField(formData, 'title').trim() || file.name.replace(/\.[^.]+$/, '');
    const documentType = (textField(formData, 'documentType') || 'other') as LibraryDocumentType;
    const classificationRaw = textField(formData, 'classification') || 'internal';
    if (!(LIBRARY_CLASSIFICATIONS as readonly string[]).includes(classificationRaw)) {
      return {
        ok: false,
        error: 'Choose a valid access level.',
        fields: { classification: 'Internal, confidential or restricted.' },
      };
    }
    const classification = classificationRaw as LibraryClassification;
    const documentId = randomUUID();
    const fileName = sanitizeLibraryFileName(file.name);
    const bytes = await fileBuffer(file);
    const sha256 = sha256Hex(bytes);
    const acknowledge = textField(formData, 'acknowledgeDuplicate') === '1';
    if (!acknowledge) {
      const duplicate = await findLibraryDuplicateByHash(context, sha256);
      if (duplicate) {
        return {
          ok: false,
          error: 'This file is already stored in the library.',
          duplicate,
        };
      }
    }
    const extractedText = await extractLibraryText(bytes, file.type);
    const revisionId = randomUUID();
    const storagePath = libraryRevisionObjectPath(
      context.entityId,
      documentType,
      documentId,
      revisionId,
      fileName,
    );

    await uploadLibraryObject(storagePath, bytes, file.type);
    try {
      const result = await saveLibraryDocument(context, {
        newDocumentId: documentId,
        title,
        description: textField(formData, 'description'),
        documentType,
        aircraftType: textField(formData, 'aircraftType'),
        aircraftModel: textField(formData, 'aircraftModel'),
        partNumber: textField(formData, 'partNumber'),
        manufacturer: textField(formData, 'manufacturer'),
        revision: textField(formData, 'revision'),
        version: textField(formData, 'version'),
        effectiveDate: textField(formData, 'effectiveDate'),
        tags: textField(formData, 'tags'),
        classification,
        file: {
          fileName,
          mimeType: file.type,
          fileSize: file.size,
          sha256,
          storagePath,
          revisionId,
        },
        extractedText,
      });
      revalidatePath('/library');
      revalidatePath('/library/documents');
      if (shouldEnqueueLibraryOcr(file.type, extractedText)) {
        await enqueueAndRunLibraryOcr(context, result.documentId);
        return {
          ok: true,
          data: result,
          message: 'Document uploaded. OCR will index this scan in the background.',
        };
      }
      return { ok: true, data: result, message: 'Document uploaded.' };
    } catch (error) {
      await removeLibraryObject(storagePath);
      throw error;
    }
  } catch (error) {
    console.error('[action:uploadLibraryDocument]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function saveLibraryMetadataAction(
  raw: unknown,
): Promise<ActionResult<{ documentId: string }>> {
  try {
    const parsed = saveLibraryMetadataInput.safeParse(raw);
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
    const result = await updateLibraryMetadata(context, parsed.data);
    revalidatePath('/library');
    revalidatePath('/library/documents');
    revalidatePath(`/library/documents/${result.documentId}`);
    return { ok: true, data: result, message: 'Document details saved.' };
  } catch (error) {
    console.error('[action:saveLibraryMetadata]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function replaceLibraryFileAction(
  formData: FormData,
): Promise<ActionResult<{ documentId: string }>> {
  try {
    const documentId = textField(formData, 'documentId');
    const file = formData.get('file');
    if (!documentId) return { ok: false, error: 'Missing document.' };
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'Choose a replacement file.' };
    }
    assertLibraryFile(file);

    const { context } = await authorise(Permission.LibraryDocumentManage, {
      module: PlatformModule.Library,
    });
    const existing = await getLibraryDocument(context, documentId);
    const fileName = sanitizeLibraryFileName(file.name);
    const bytes = await fileBuffer(file);
    const sha256 = sha256Hex(bytes);
    const acknowledge = textField(formData, 'acknowledgeDuplicate') === '1';
    if (!acknowledge) {
      const duplicate = await findLibraryDuplicateByHash(context, sha256, documentId);
      if (duplicate) {
        return {
          ok: false,
          error: 'This file is already stored in the library.',
          duplicate,
        };
      }
    }
    const extractedText = await extractLibraryText(bytes, file.type);
    const revisionId = randomUUID();
    const storagePath = libraryRevisionObjectPath(
      context.entityId,
      existing.documentType,
      documentId,
      revisionId,
      fileName,
    );

    await uploadLibraryObject(storagePath, bytes, file.type);
    try {
      await saveLibraryDocument(context, {
        documentId,
        title: existing.title,
        description: existing.description ?? '',
        documentType: existing.documentType,
        aircraftType: existing.aircraftType ?? '',
        aircraftModel: existing.aircraftModel ?? '',
        partNumber: existing.partNumber ?? '',
        manufacturer: existing.manufacturer ?? '',
        revision: existing.revision ?? '',
        version: existing.version ?? '',
        effectiveDate: existing.effectiveDate ?? '',
        tags: existing.tags.join(', '),
        classification: existing.classification,
        file: {
          fileName,
          mimeType: file.type,
          fileSize: file.size,
          sha256,
          storagePath,
          revisionId,
        },
        extractedText,
      });
    } catch (error) {
      await removeLibraryObject(storagePath);
      throw error;
    }

    revalidatePath('/library');
    revalidatePath('/library/documents');
    revalidatePath(`/library/documents/${documentId}`);
    if (shouldEnqueueLibraryOcr(file.type, extractedText)) {
      await enqueueAndRunLibraryOcr(context, documentId);
      return {
        ok: true,
        data: { documentId },
        message: 'File replaced. OCR will index this scan in the background.',
      };
    }
    return {
      ok: true,
      data: { documentId },
      message: 'File replaced. The previous file is kept as a revision.',
    };
  } catch (error) {
    console.error('[action:replaceLibraryFile]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function archiveLibraryDocumentAction(
  documentId: string,
): Promise<ActionResult<{ documentId: string }>> {
  try {
    const { context } = await authorise(Permission.LibraryDocumentManage, {
      module: PlatformModule.Library,
    });
    const result = await archiveLibraryDocument(context, documentId);
    revalidatePath('/library');
    revalidatePath('/library/documents');
    revalidatePath(`/library/documents/${documentId}`);
    return { ok: true, data: result, message: 'Document archived.' };
  } catch (error) {
    console.error('[action:archiveLibraryDocument]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function deleteLibraryDocumentAction(
  documentId: string,
): Promise<ActionResult<{ documentId: string }>> {
  try {
    const { context } = await authorise(Permission.LibraryDocumentManage, {
      module: PlatformModule.Library,
    });
    const result = await deleteLibraryDocument(context, documentId);
    await removeLibraryObjects(result.storagePaths);
    revalidatePath('/library');
    revalidatePath('/library/documents');
    return { ok: true, data: { documentId: result.documentId }, message: 'Document deleted.' };
  } catch (error) {
    console.error('[action:deleteLibraryDocument]', error);
    return { ok: false, error: userMessage(error) };
  }
}

export async function restoreLibraryRevisionAction(
  documentId: string,
  revisionId: string,
): Promise<ActionResult<{ documentId: string }>> {
  try {
    if (!documentId || !revisionId) return { ok: false, error: 'Missing revision.' };
    const { context } = await authorise(Permission.LibraryDocumentManage, {
      module: PlatformModule.Library,
    });
    const result = await restoreLibraryRevision(context, documentId, revisionId);
    revalidatePath('/library');
    revalidatePath('/library/documents');
    revalidatePath(`/library/documents/${documentId}`);
    return {
      ok: true,
      data: { documentId: result.documentId },
      message: 'That file is now current.',
    };
  } catch (error) {
    console.error('[action:restoreLibraryRevision]', error);
    return { ok: false, error: userMessage(error) };
  }
}

const searchInput = z.string().trim().max(200);

export type LibrarySearchPerson = {
  id: string;
  fullName: string;
  email: string;
  roleNames: string[];
};

export type LibrarySearchPage = {
  href: string;
  title: string;
  hint: string;
};

export async function searchLibraryAction(raw: unknown): Promise<
  ActionResult<{
    documents: Awaited<ReturnType<typeof searchLibraryDocuments>>;
    pages: LibrarySearchPage[];
    people: LibrarySearchPerson[];
  }>
> {
  try {
    const parsed = searchInput.safeParse(typeof raw === 'string' ? raw : '');
    if (!parsed.success) {
      return { ok: false, error: 'Search is too long.' };
    }
    const { context, session, entity } = await authorise(Permission.LibraryDocumentRead, {
      module: PlatformModule.Library,
    });
    const mayUpload = can(session, entity.entityId, Permission.LibraryDocumentUpload);
    const mayCompany = can(session, entity.entityId, Permission.SettingsManage);
    const mayUsers = can(session, entity.entityId, Permission.UsersManage);
    const mayAccess = can(session, entity.entityId, Permission.LibraryAccessRead);
    const query = parsed.data;
    const filters = parseLibrarySearchQuery(query);
    const jump = libraryJumpPages({ mayUpload, mayCompany, mayUsers, mayAccess });
    const pages = (!query ? jump : filters.text ? matchJumpPages(jump, filters.text) : []).map(
      (page) => ({ href: page.href, title: page.title, hint: page.hint }),
    );

    const documents = query ? await searchLibraryDocuments(context, query, 8) : [];

    let people: LibrarySearchPerson[] = [];
    if (filters.text && mayUsers) {
      const everyone = await listEntityUsers(context);
      const needle = filters.text.toLowerCase();
      people = everyone
        .filter(
          (person) =>
            person.fullName.toLowerCase().includes(needle) ||
            person.email.toLowerCase().includes(needle),
        )
        .slice(0, 5)
        .map((person) => ({
          id: person.id,
          fullName: person.fullName,
          email: person.email,
          roleNames: person.roleNames,
        }));
    }

    return { ok: true, data: { documents, pages, people } };
  } catch (error) {
    console.error('[action:searchLibrary]', error);
    return { ok: false, error: userMessage(error) };
  }
}
