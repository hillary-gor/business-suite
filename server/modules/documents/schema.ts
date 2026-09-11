import { z } from 'zod';
import { DOCUMENT_KINDS } from '@/lib/documents/kinds';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const partySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(80).nullable().optional(),
  address: z.string().trim().max(2000).nullable().optional(),
});

const metaSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().max(200),
});

const lineSchema = z.object({
  description: z.string().trim().max(500),
  sku: z.string().trim().max(80).nullable().optional(),
  quantity: z.string().max(40).nullable().optional(),
  unitPrice: z.string().max(40).nullable().optional(),
  taxLabel: z.string().trim().max(80).nullable().optional(),
  taxAmount: z.string().max(40).nullable().optional(),
  amount: z.string().max(40).nullable().optional(),
  extra: z.string().trim().max(200).nullable().optional(),
});

export const documentDraftSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  number: z.string().trim().max(80).nullable().optional(),
  issueDate: isoDate,
  dueDate: isoDate.nullable().optional(),
  party: partySchema,
  shipTo: partySchema.nullable().optional(),
  meta: z.array(metaSchema).max(20).optional(),
  lines: z.array(lineSchema).max(200),
  currency: z.string().trim().min(1).max(8),
  subtotal: z.string().max(40).nullable().optional(),
  tax: z.string().max(40).nullable().optional(),
  total: z.string().max(40).nullable().optional(),
  balance: z.string().max(40).nullable().optional(),
  terms: z.string().trim().max(4000).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  references: z.array(metaSchema).max(20).optional(),
});

export const documentIdSchema = z.string().uuid();
export const asOfSchema = isoDate.optional();
