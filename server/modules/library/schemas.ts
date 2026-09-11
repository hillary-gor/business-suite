import { z } from 'zod';
import { LIBRARY_CLASSIFICATIONS, LIBRARY_DOCUMENT_TYPES, LIBRARY_STATUSES } from './types';

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

const optional = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));
const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker.')
  .optional()
  .or(z.literal(''));

export const libraryMetadataFields = {
  title: z.string().trim().min(1, 'A title is required.').max(240),
  description: optional(4000),
  documentType: z.enum(LIBRARY_DOCUMENT_TYPES),
  classification: z.enum(LIBRARY_CLASSIFICATIONS),
  aircraftType: optional(80),
  aircraftModel: optional(80),
  partNumber: optional(80),
  manufacturer: optional(120),
  revision: optional(40),
  version: optional(40),
  effectiveDate: optionalDate,
  tags: z.string().trim().max(400).optional().or(z.literal('')),
};

export const saveLibraryMetadataInput = z.object({
  documentId: z.string().uuid(),
  ...libraryMetadataFields,
});

export const listLibraryInput = z.object({
  q: optional(200),
  documentType: z.enum(LIBRARY_DOCUMENT_TYPES).optional().or(z.literal('')),
  status: z.enum(LIBRARY_STATUSES).optional().or(z.literal('')),
  tag: optional(80),
  classification: z.enum(LIBRARY_CLASSIFICATIONS).optional().or(z.literal('')),
});

export type SaveLibraryMetadataInput = z.infer<typeof saveLibraryMetadataInput>;
export type ListLibraryInput = z.infer<typeof listLibraryInput>;

export const saveLibraryCollectionInput = z.object({
  collectionId: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'A name is required.').max(80),
  description: z.string().trim().max(400).optional().or(z.literal('')),
});

export type SaveLibraryCollectionInput = z.infer<typeof saveLibraryCollectionInput>;

export const LIBRARY_COMMENT_REACTION_IDS = ['thumbs', 'check', 'eyes', 'flag'] as const;

export const addLibraryCommentInput = z.object({
  documentId: z.string().uuid(),
  body: z.string().trim().min(1, 'Write a comment.').max(2000, 'Comment is too long.'),
});

export const toggleLibraryCommentReactionInput = z.object({
  documentId: z.string().uuid(),
  commentId: z.string().uuid(),
  emoji: z.enum(LIBRARY_COMMENT_REACTION_IDS),
});

export type AddLibraryCommentInput = z.infer<typeof addLibraryCommentInput>;
export type ToggleLibraryCommentReactionInput = z.infer<typeof toggleLibraryCommentReactionInput>;

export const LIBRARY_SHARE_CHANNEL_IDS = ['internal', 'email', 'link', 'whatsapp'] as const;

export const shareLibraryDocumentInput = z.object({
  documentId: z.string().uuid(),
  channel: z.enum(LIBRARY_SHARE_CHANNEL_IDS),
  recipientUserId: z.string().uuid().optional().nullable(),
  note: z.string().trim().max(400, 'The note is too long.').optional().or(z.literal('')),
});

export const listLibraryShareColleaguesInput = z.object({
  documentId: z.string().uuid(),
  query: z.string().trim().max(80).optional().or(z.literal('')),
});

export type ShareLibraryDocumentInput = z.infer<typeof shareLibraryDocumentInput>;
export type ListLibraryShareColleaguesInput = z.infer<typeof listLibraryShareColleaguesInput>;
