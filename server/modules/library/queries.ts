import { cache } from 'react';
import {
  withReadOnlyTransaction,
  withTransaction,
  type RequestContext,
  type Transaction,
} from '@/server/db/transaction';
import { NotFoundError } from '@/server/db/errors';
import type {
  LibraryAccessAction,
  LibraryAccessEvent,
  LibraryAccessPulse,
  LibraryNotification,
  LibraryAccessRequest,
  LibraryCategory,
  LibraryClassification,
  LibraryColleague,
  LibraryCollection,
  LibraryCollectionSummary,
  LibraryComment,
  LibraryCommentReactionId,
  LibraryDashboard,
  LibraryDocumentShare,
  LibraryShareChannel,
  LibraryDocument,
  LibraryDocumentHit,
  LibraryDocumentLink,
  LibraryDocumentRevision,
  LibraryDocumentStatus,
  LibraryDocumentSummary,
  LibraryDocumentType,
  LibraryLinkKind,
  LibraryOcrJob,
  LibraryOcrStatus,
} from './types';
import {
  LIBRARY_CLASSIFICATIONS,
  LIBRARY_DOCUMENT_TYPES,
  LIBRARY_OCR_MIME_TYPES,
  LIBRARY_SHARE_CHANNELS,
} from './types';
import type { ListLibraryInput, SaveLibraryMetadataInput } from './schemas';
import { likeContains, parseLibrarySearchQuery } from './search';
import { queryOwnProfile, type OwnProfile } from '@/server/modules/settings/users';

type DocumentQueryRow = {
  id: string;
  title: string;
  document_type: LibraryDocumentType;
  part_number: string | null;
  manufacturer: string | null;
  aircraft_type: string | null;
  aircraft_model: string | null;
  revision: string | null;
  version: string | null;
  effective_date: string | null;
  file_name: string;
  file_size: string;
  mime_type: string;
  status: LibraryDocumentStatus;
  classification: LibraryClassification;
  uploaded_by_name: string | null;
  created_at: string;
  tags: string[] | null;
  snippet?: string | null;
  can_open?: boolean;
};

type DocumentDetailRow = DocumentQueryRow & {
  description: string | null;
  storage_path: string;
  sha256: string;
  updated_at: string;
  has_extracted_text: boolean;
  can_open?: boolean;
};

function toSummary(row: DocumentQueryRow): LibraryDocumentSummary {
  return {
    id: row.id,
    title: row.title,
    documentType: row.document_type,
    partNumber: row.part_number,
    manufacturer: row.manufacturer,
    aircraftType: row.aircraft_type,
    aircraftModel: row.aircraft_model,
    revision: row.revision,
    version: row.version,
    effectiveDate: row.effective_date,
    fileName: row.file_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    status: row.status,
    classification: row.classification,
    uploadedByName: row.uploaded_by_name,
    createdAt: row.created_at,
    tags: row.tags ?? [],
    canOpen: row.can_open !== false,
  };
}

type AccessRequestRow = {
  id: string;
  document_id: string;
  document_title: string;
  requester_name: string | null;
  reason: string | null;
  status: LibraryAccessRequest['status'];
  created_at: string;
};

type CollectionRow = {
  id: string;
  name: string;
  description: string | null;
  document_count: string;
  created_at: string;
};

function toAccessRequest(row: AccessRequestRow): LibraryAccessRequest {
  return {
    id: row.id,
    documentId: row.document_id,
    documentTitle: row.document_title,
    requesterName: row.requester_name,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toCollectionSummary(row: CollectionRow): LibraryCollectionSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    documentCount: Number(row.document_count),
    createdAt: row.created_at,
  };
}

const ACCESS_REQUEST_SQL = `select r.id,
              r.document_id,
              c.title as document_title,
              u.full_name as requester_name,
              r.reason,
              r.status,
              to_char(r.created_at, 'YYYY-MM-DD HH24:MI') as created_at
         from library.access_requests r
         join library.get_catalogue_document($1, $2::uuid) c on c.id = r.document_id
         left join app.users u on u.id = r.requester_id
        where r.entity_id = $1
          and r.document_id = $2`;

const COLLECTION_COUNT_SQL = `(
                select count(*)::text
                  from library.collection_documents cd
                  join library.documents d on d.id = cd.document_id
                 where cd.collection_id = c.id
              ) as document_count`;

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

type NotificationRow = {
  id: string;
  kind: LibraryNotification['kind'];
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

type RevisionRow = {
  id: string;
  revision_no: number;
  file_name: string;
  file_size: string;
  mime_type: string;
  sha256: string;
  is_current: boolean;
  created_by_name: string | null;
  created_at: string;
};

type LinkRow = {
  kind: LibraryLinkKind;
  record_id: string;
  label: string;
  hint: string | null;
  created_at: string;
};

type AccessEventRow = {
  id: string;
  document_id: string;
  document_title: string;
  classification: LibraryClassification;
  action: LibraryAccessAction;
  actor_name: string | null;
  actor_email: string | null;
  request_id: string | null;
  created_at: string;
};

function toNotification(row: NotificationRow): LibraryNotification {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

type ColleagueRow = {
  id: string;
  full_name: string;
  email: string;
  job_title: string | null;
};

function toColleague(row: ColleagueRow): LibraryColleague {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    jobTitle: row.job_title,
  };
}

const COMMENT_REACTION_IDS: readonly LibraryCommentReactionId[] = [
  'thumbs',
  'check',
  'eyes',
  'flag',
];

type CommentRow = {
  id: string;
  author_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
  reaction_thumbs: number;
  reaction_check: number;
  reaction_eyes: number;
  reaction_flag: number;
  mine: string[] | null;
};

function toComment(row: CommentRow): LibraryComment {
  const mine = (row.mine ?? []).filter((value): value is LibraryCommentReactionId =>
    COMMENT_REACTION_IDS.includes(value as LibraryCommentReactionId),
  );
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
    reactions: {
      thumbs: Number(row.reaction_thumbs),
      check: Number(row.reaction_check),
      eyes: Number(row.reaction_eyes),
      flag: Number(row.reaction_flag),
    },
    mine,
  };
}

function toRevision(row: RevisionRow): LibraryDocumentRevision {
  return {
    id: row.id,
    revisionNo: row.revision_no,
    fileName: row.file_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    sha256: row.sha256,
    isCurrent: row.is_current,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  };
}

function toDocumentLink(row: LinkRow): LibraryDocumentLink {
  return {
    kind: row.kind,
    recordId: row.record_id,
    label: row.label,
    hint: row.hint,
    createdAt: row.created_at,
  };
}

function toAccessEvent(row: AccessEventRow): LibraryAccessEvent {
  return {
    id: row.id,
    documentId: row.document_id,
    documentTitle: row.document_title,
    classification: row.classification,
    action: row.action,
    actorName: row.actor_name,
    actorEmail: row.actor_email,
    requestId: row.request_id,
    createdAt: row.created_at,
  };
}

function toDocument(row: DocumentDetailRow): LibraryDocument {
  return {
    ...toSummary(row),
    description: row.description,
    storagePath: row.storage_path,
    sha256: row.sha256,
    updatedAt: row.updated_at,
    hasExtractedText: row.has_extracted_text,
  };
}

/**
 * Layout and page run in parallel and each used to open their own write.
 * Cache on primitives so both share one `ensure_default_categories` call.
 */
export async function ensureLibraryCategories(context: RequestContext): Promise<void> {
  await ensureLibraryCategoriesOnce(context.userId, context.entityId, context.requestId);
}

const ensureLibraryCategoriesOnce = cache(
  async (userId: string, entityId: string, requestId: string): Promise<void> => {
    await withTransaction({ userId, entityId, requestId }, async (tx) => {
      await tx.query(`select library.ensure_default_categories($1)`, [entityId]);
    });
  },
);

export async function listLibraryCategories(context: RequestContext): Promise<LibraryCategory[]> {
  await ensureLibraryCategories(context);
  return withReadOnlyTransaction(context, (tx) => queryLibraryCategories(tx, context.entityId));
}

export async function loadLibraryChrome(context: RequestContext): Promise<{
  categories: LibraryCategory[];
  collections: LibraryCollectionSummary[];
  notifications: LibraryNotification[];
  profile: OwnProfile;
}> {
  await ensureLibraryCategories(context);
  return withReadOnlyTransaction(context, async (tx) => {
    const categories = await queryLibraryCategories(tx, context.entityId);
    const collections = await queryLibraryCollections(tx, context.entityId);
    const notifications = await queryLibraryNotifications(tx, context.entityId, context.userId);
    const profile = await queryOwnProfile(tx, context.userId);
    return { categories, collections, notifications, profile };
  });
}

async function queryLibraryCategories(
  tx: Transaction,
  entityId: string,
): Promise<LibraryCategory[]> {
  const rows = await tx.query<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    document_count: string;
  }>(
    `select c.id,
            c.code,
            c.name,
            c.description,
            coalesce(s.n, 0)::text as document_count
       from library.categories c
       left join (
         select document_type, sum(n) as n
           from library.peek_stats($1)
          group by document_type
       ) s on s.document_type = c.code
      where c.entity_id = $1
      order by c.sort_order, c.name`,
    [entityId],
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    documentCount: Number(row.document_count),
  }));
}

async function queryLibraryCollections(
  tx: Transaction,
  entityId: string,
): Promise<LibraryCollectionSummary[]> {
  const rows = await tx.query<CollectionRow>(
    `select c.id,
            c.name,
            c.description,
            ${COLLECTION_COUNT_SQL},
            to_char(c.created_at, 'YYYY-MM-DD HH24:MI') as created_at
       from library.collections c
      where c.entity_id = $1
      order by lower(c.name)`,
    [entityId],
  );
  return rows.map(toCollectionSummary);
}

async function queryLibraryNotifications(
  tx: Transaction,
  entityId: string,
  userId: string,
): Promise<LibraryNotification[]> {
  const rows = await tx.query<NotificationRow>(
    `select id,
            kind,
            title,
            body,
            href,
            to_char(read_at, 'YYYY-MM-DD HH24:MI') as read_at,
            to_char(created_at, 'YYYY-MM-DD HH24:MI') as created_at
       from library.notifications
      where entity_id = $1
        and user_id = $2
      order by created_at desc
      limit 40`,
    [entityId, userId],
  );
  return rows.map(toNotification);
}

async function queryLibraryDocument(
  tx: Transaction,
  entityId: string,
  documentId: string,
): Promise<LibraryDocument | null> {
  const row = await tx.maybeOne<DocumentDetailRow>(
    `select id,
            title,
            document_type,
            part_number,
            manufacturer,
            aircraft_type,
            aircraft_model,
            revision,
            version,
            effective_date,
            file_name,
            file_size,
            mime_type,
            status,
            classification,
            uploaded_by_name,
            created_at,
            tags,
            description,
            storage_path,
            sha256,
            updated_at,
            has_extracted_text,
            can_open
       from library.get_catalogue_document($1, $2::uuid)`,
    [entityId, documentId],
  );
  return row ? toDocument(row) : null;
}

async function queryLibraryAccessRequests(
  tx: Transaction,
  entityId: string,
  documentId: string,
): Promise<LibraryAccessRequest[]> {
  const rows = await tx.query<AccessRequestRow>(
    `${ACCESS_REQUEST_SQL}
        order by r.created_at desc`,
    [entityId, documentId],
  );
  return rows.map(toAccessRequest);
}

async function queryOwnLibraryAccessRequest(
  tx: Transaction,
  entityId: string,
  documentId: string,
  userId: string,
): Promise<LibraryAccessRequest | null> {
  const row = await tx.maybeOne<AccessRequestRow>(
    `${ACCESS_REQUEST_SQL}
          and r.requester_id = $3
        order by r.created_at desc
        limit 1`,
    [entityId, documentId, userId],
  );
  return row ? toAccessRequest(row) : null;
}

async function queryLibraryRevisions(
  tx: Transaction,
  entityId: string,
  documentId: string,
): Promise<LibraryDocumentRevision[]> {
  const rows = await tx.query<RevisionRow>(
    `select r.id,
            r.revision_no,
            r.file_name,
            r.file_size::text as file_size,
            r.mime_type,
            r.sha256,
            r.is_current,
            u.full_name as created_by_name,
            to_char(r.created_at, 'YYYY-MM-DD HH24:MI') as created_at
       from library.document_revisions r
       left join app.users u on u.id = r.created_by
      where r.entity_id = $1
        and r.document_id = $2
      order by r.revision_no desc`,
    [entityId, documentId],
  );
  return rows.map(toRevision);
}

async function queryLatestLibraryOcrJob(
  tx: Transaction,
  entityId: string,
  documentId: string,
): Promise<LibraryOcrJob | null> {
  const row = await tx.maybeOne<{
    id: string;
    status: LibraryOcrStatus;
    last_error: string | null;
    created_at: string;
  }>(
    `select id,
            status,
            last_error,
            to_char(created_at, 'YYYY-MM-DD HH24:MI') as created_at
       from library.ocr_jobs
      where entity_id = $1
        and document_id = $2
      order by created_at desc
      limit 1`,
    [entityId, documentId],
  );
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
  };
}

async function queryLibraryDocumentLinks(
  tx: Transaction,
  entityId: string,
  documentId: string,
): Promise<LibraryDocumentLink[]> {
  const rows = await tx.query<LinkRow>(
    `select kind,
            record_id,
            label,
            hint,
            to_char(created_at, 'YYYY-MM-DD HH24:MI') as created_at
       from library.list_document_links($1, $2::uuid)`,
    [entityId, documentId],
  );
  return rows.map(toDocumentLink);
}

async function queryLibraryDocumentCollections(
  tx: Transaction,
  entityId: string,
  documentId: string,
): Promise<LibraryCollectionSummary[]> {
  const rows = await tx.query<CollectionRow>(
    `select c.id,
            c.name,
            c.description,
            ${COLLECTION_COUNT_SQL},
            to_char(c.created_at, 'YYYY-MM-DD HH24:MI') as created_at
       from library.collections c
       join library.collection_documents cd on cd.collection_id = c.id
      where c.entity_id = $1
        and cd.document_id = $2
      order by lower(c.name)`,
    [entityId, documentId],
  );
  return rows.map(toCollectionSummary);
}

async function queryLibraryAccessEvents(
  tx: Transaction,
  entityId: string,
  documentId: string | null,
  limit: number,
): Promise<LibraryAccessEvent[]> {
  const rows = await tx.query<AccessEventRow>(
    `select id,
            document_id,
            document_title,
            classification,
            action,
            actor_name,
            actor_email,
            request_id,
            to_char(created_at, 'YYYY-MM-DD HH24:MI') as created_at
       from library.list_access_events($1, $2::uuid, $3)`,
    [entityId, documentId, limit],
  );
  return rows.map(toAccessEvent);
}

export async function listLibraryDocuments(
  context: RequestContext,
  filters: ListLibraryInput,
): Promise<LibraryDocumentSummary[]> {
  const parsed = parseLibrarySearchQuery(filters.q ?? '');
  const rows = await queryLibraryCatalogue(context, {
    text: parsed.text || null,
    part: parsed.part || null,
    documentType: filters.documentType || parsed.documentType || null,
    status: filters.status || parsed.status || 'ACTIVE',
    tag: filters.tag?.trim() || parsed.tag || null,
    classification: filters.classification || parsed.classification || null,
    limit: 200,
  });
  return rows.map(toSummary);
}

export async function searchLibraryDocuments(
  context: RequestContext,
  rawQuery: string,
  limit = 8,
): Promise<LibraryDocumentHit[]> {
  const parsed = parseLibrarySearchQuery(rawQuery);
  const rows = await queryLibraryCatalogue(context, {
    text: parsed.text || null,
    part: parsed.part || null,
    documentType: parsed.documentType || null,
    status: parsed.status || 'ACTIVE',
    tag: parsed.tag || null,
    classification: parsed.classification || null,
    limit,
  });
  return rows.map((row) => ({
    ...toSummary(row),
    snippet: row.snippet ?? null,
  }));
}

async function queryLibraryCatalogue(
  context: RequestContext,
  filters: {
    text: string | null;
    part: string | null;
    documentType: string | null;
    status: string;
    tag: string | null;
    classification: string | null;
    limit: number;
  },
): Promise<DocumentQueryRow[]> {
  const text = filters.text ? likeContains(filters.text) : null;
  const part = filters.part ? likeContains(filters.part) : null;
  const fts = filters.text || null;

  return withReadOnlyTransaction(context, (tx) =>
    tx.query<DocumentQueryRow>(
      `select id,
              title,
              document_type,
              part_number,
              manufacturer,
              aircraft_type,
              aircraft_model,
              revision,
              version,
              effective_date,
              file_name,
              file_size,
              mime_type,
              status,
              classification,
              uploaded_by_name,
              created_at,
              tags,
              snippet,
              can_open
         from library.list_catalogue($1, $2::jsonb)`,
      [
        context.entityId,
        JSON.stringify({
          status: filters.status,
          document_type: filters.documentType,
          classification: filters.classification,
          q: fts,
          like: text,
          tag: filters.tag,
          part,
          limit: filters.limit,
        }),
      ],
    ),
  );
}

export async function getLibraryDocument(
  context: RequestContext,
  documentId: string,
): Promise<LibraryDocument> {
  const document = await withReadOnlyTransaction(context, (tx) =>
    queryLibraryDocument(tx, context.entityId, documentId),
  );

  if (!document) throw new NotFoundError('That document was not found in this organisation.');
  return document;
}

export async function loadLibraryDocumentWorkspace(
  context: RequestContext,
  documentId: string,
  options: { includeAccessEvents: boolean; includeAccessRequests: boolean },
): Promise<{
  document: LibraryDocument;
  ownRequest: LibraryAccessRequest | null;
  accessRequests: LibraryAccessRequest[];
  revisions: LibraryDocumentRevision[];
  ocrJob: LibraryOcrJob | null;
  links: LibraryDocumentLink[];
  memberships: LibraryCollectionSummary[];
  collections: LibraryCollectionSummary[];
  accessEvents: LibraryAccessEvent[];
  comments: LibraryComment[];
  shares: LibraryDocumentShare[];
  uploader: LibraryColleague | null;
}> {
  return withReadOnlyTransaction(context, async (tx) => {
    const document = await queryLibraryDocument(tx, context.entityId, documentId);
    if (!document) throw new NotFoundError('That document was not found in this organisation.');

    const accessRequests = options.includeAccessRequests
      ? await queryLibraryAccessRequests(tx, context.entityId, documentId)
      : [];

    if (!document.canOpen) {
      return {
        document,
        ownRequest: await queryOwnLibraryAccessRequest(
          tx,
          context.entityId,
          documentId,
          context.userId,
        ),
        accessRequests,
        revisions: [],
        ocrJob: null,
        links: [],
        memberships: [],
        collections: [],
        accessEvents: [],
        comments: [],
        shares: [],
        uploader: null,
      };
    }

    return {
      document,
      ownRequest: null,
      accessRequests,
      revisions: await queryLibraryRevisions(tx, context.entityId, documentId),
      ocrJob: await queryLatestLibraryOcrJob(tx, context.entityId, documentId),
      links: await queryLibraryDocumentLinks(tx, context.entityId, documentId),
      memberships: await queryLibraryDocumentCollections(tx, context.entityId, documentId),
      collections: await queryLibraryCollections(tx, context.entityId),
      accessEvents: options.includeAccessEvents
        ? await queryLibraryAccessEvents(tx, context.entityId, documentId, 50)
        : [],
      comments: await queryLibraryComments(tx, context.entityId, documentId),
      shares: await queryLibraryShares(tx, context.entityId, documentId),
      uploader: await queryLibraryUploader(tx, context.entityId, documentId),
    };
  });
}

export async function findLibraryDuplicateByHash(
  context: RequestContext,
  sha256: string,
  exceptDocumentId?: string,
): Promise<{ id: string; title: string } | null> {
  return withReadOnlyTransaction(context, (tx) =>
    tx.maybeOne<{ id: string; title: string }>(
      `select id, title
         from library.documents
        where entity_id = $1
          and sha256 = $2
          and status = 'ACTIVE'
          and ($3::uuid is null or id <> $3)
        limit 1`,
      [context.entityId, sha256, exceptDocumentId ?? null],
    ),
  );
}

export async function getLibraryDashboard(context: RequestContext): Promise<LibraryDashboard> {
  await ensureLibraryCategories(context);

  return withReadOnlyTransaction(context, async (tx) => {
    const stats = await tx.query<{
      document_type: LibraryDocumentType;
      classification: LibraryClassification;
      week_period: string;
      n: string;
    }>(
      `select document_type,
              classification,
              to_char(week_start, 'YYYY-MM-DD') as week_period,
              n::text as n
         from library.peek_stats($1)`,
      [context.entityId],
    );
    const recent = await tx.query<DocumentQueryRow>(
      `select id,
              title,
              document_type,
              part_number,
              manufacturer,
              aircraft_type,
              aircraft_model,
              revision,
              version,
              effective_date,
              file_name,
              file_size,
              mime_type,
              status,
              classification,
              uploaded_by_name,
              created_at,
              tags,
              can_open
         from library.list_catalogue($1, $2::jsonb)`,
      [context.entityId, JSON.stringify({ status: 'ACTIVE', limit: 8 })],
    );
    const storageRow = await tx.maybeOne<{ bytes: string }>(
      `select coalesce(sum(file_size), 0)::text as bytes
         from library.documents
        where entity_id = $1
          and status = 'ACTIVE'`,
      [context.entityId],
    );
    const ocrRow = await tx.maybeOne<{ n: string }>(
      `select count(*)::text as n
         from library.documents
        where entity_id = $1
          and status = 'ACTIVE'
          and extracted_text is null
          and mime_type = any($2::text[])`,
      [context.entityId, [...LIBRARY_OCR_MIME_TYPES]],
    );
    const collectionRow = await tx.maybeOne<{ n: string }>(
      `select count(*)::text as n
         from library.collections
        where entity_id = $1`,
      [context.entityId],
    );
    const weekAxis = await tx.query<{ period: string; label: string }>(
      `select to_char(gs, 'YYYY-MM-DD') as period,
              to_char(gs, 'DD Mon') as label
         from generate_series(
                date_trunc('week', now()) - interval '11 weeks',
                date_trunc('week', now()),
                interval '1 week'
              ) gs
        order by gs`,
    );
    const categories = await tx.query<{
      id: string;
      code: string;
      name: string;
      description: string | null;
    }>(
      `select id, code, name, description
         from library.categories
        where entity_id = $1
        order by sort_order, name`,
      [context.entityId],
    );

    const typeTotals = new Map<string, number>();
    const classificationTotals = new Map<string, number>();
    const weekTotals = new Map<string, number>();
    for (const row of stats) {
      const n = Number(row.n);
      typeTotals.set(row.document_type, (typeTotals.get(row.document_type) ?? 0) + n);
      classificationTotals.set(
        row.classification,
        (classificationTotals.get(row.classification) ?? 0) + n,
      );
      weekTotals.set(row.week_period, (weekTotals.get(row.week_period) ?? 0) + n);
    }

    const byType = LIBRARY_DOCUMENT_TYPES.map((documentType) => ({
      documentType,
      count: typeTotals.get(documentType) ?? 0,
    }));

    return {
      totalActive: byType.reduce((sum, row) => sum + row.count, 0),
      storageBytes: storageRow?.bytes ?? '0',
      needsOcr: Number(ocrRow?.n ?? 0),
      collectionCount: Number(collectionRow?.n ?? 0),
      byType,
      byClassification: LIBRARY_CLASSIFICATIONS.map((classification) => ({
        classification,
        count: classificationTotals.get(classification) ?? 0,
      })),
      uploadsByWeek: weekAxis.map((row) => ({
        period: row.period,
        label: row.label,
        count: weekTotals.get(row.period) ?? 0,
      })),
      recent: recent.map(toSummary),
      categories: categories.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        documentCount: typeTotals.get(row.code) ?? 0,
      })),
    };
  });
}

export async function getLibraryAccessPulse(context: RequestContext): Promise<LibraryAccessPulse> {
  return withReadOnlyTransaction(context, async (tx) => {
    const [dayRows, topRows] = await Promise.all([
      tx.query<{ period: string; label: string; n: string }>(
        `select to_char(gs::date, 'YYYY-MM-DD') as period,
                to_char(gs, 'DD Mon') as label,
                count(e.id)::text as n
           from generate_series(
                  current_date - 27,
                  current_date,
                  interval '1 day'
                ) gs
           left join library.access_events e
             on e.entity_id = $1
            and e.created_at::date = gs::date
          group by gs
          order by gs`,
        [context.entityId],
      ),
      tx.query<{ id: string; title: string; n: string }>(
        `select d.id, d.title, count(*)::text as n
           from library.access_events e
           join library.documents d on d.id = e.document_id
          where e.entity_id = $1
            and e.created_at >= now() - interval '30 days'
          group by d.id, d.title
          order by count(*) desc
          limit 5`,
        [context.entityId],
      ),
    ]);

    const byDay = dayRows.map((row) => ({
      period: row.period,
      label: row.label,
      count: Number(row.n),
    }));

    return {
      opensLast28Days: byDay.reduce((sum, row) => sum + row.count, 0),
      byDay,
      topDocuments: topRows.map((row) => ({
        id: row.id,
        title: row.title,
        count: Number(row.n),
      })),
    };
  });
}

export async function saveLibraryDocument(
  context: RequestContext,
  input: {
    documentId?: string;
    newDocumentId?: string;
    title: string;
    description?: string;
    documentType: LibraryDocumentType;
    classification?: LibraryClassification;
    aircraftType?: string;
    aircraftModel?: string;
    partNumber?: string;
    manufacturer?: string;
    revision?: string;
    version?: string;
    effectiveDate?: string;
    tags?: string;
    file?: {
      fileName: string;
      mimeType: string;
      fileSize: number;
      sha256: string;
      storagePath: string;
      revisionId?: string;
    };
    extractedText?: string | null;
  },
): Promise<{ documentId: string }> {
  const documentId = await withTransaction(context, (tx) =>
    tx.scalar<string>(`select library.save_document($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        document_id: input.documentId ?? null,
        new_document_id: input.newDocumentId ?? null,
        title: input.title,
        description: input.description || null,
        document_type: input.documentType,
        classification: input.classification ?? 'internal',
        aircraft_type: input.aircraftType || null,
        aircraft_model: input.aircraftModel || null,
        part_number: input.partNumber || null,
        manufacturer: input.manufacturer || null,
        revision: input.revision || null,
        version: input.version || null,
        effective_date: input.effectiveDate || null,
        tags: parseTags(input.tags),
        file_name: input.file?.fileName ?? null,
        mime_type: input.file?.mimeType ?? null,
        file_size: input.file ? String(input.file.fileSize) : null,
        sha256: input.file?.sha256 ?? null,
        storage_path: input.file?.storagePath ?? null,
        storage_bucket: input.file ? 'library-documents' : null,
        revision_id: input.file?.revisionId ?? null,
        extracted_text: input.file ? (input.extractedText ?? '') : undefined,
      }),
    ]),
  );

  return { documentId };
}

export async function updateLibraryMetadata(
  context: RequestContext,
  input: SaveLibraryMetadataInput,
) {
  return saveLibraryDocument(context, {
    documentId: input.documentId,
    title: input.title,
    description: input.description,
    documentType: input.documentType,
    classification: input.classification,
    aircraftType: input.aircraftType,
    aircraftModel: input.aircraftModel,
    partNumber: input.partNumber,
    manufacturer: input.manufacturer,
    revision: input.revision,
    version: input.version,
    effectiveDate: input.effectiveDate,
    tags: input.tags,
  });
}

export async function archiveLibraryDocument(context: RequestContext, documentId: string) {
  await withTransaction(context, (tx) =>
    tx.scalar<string>(`select library.archive_document($1, $2::uuid)`, [
      context.entityId,
      documentId,
    ]),
  );
  return { documentId };
}

export async function deleteLibraryDocument(context: RequestContext, documentId: string) {
  const row = await withTransaction(context, (tx) =>
    tx.one<{ storage_paths: string[] }>(
      `select library.delete_document($1, $2::uuid) as storage_paths`,
      [context.entityId, documentId],
    ),
  );
  return { documentId, storagePaths: row.storage_paths ?? [] };
}

export async function listLibraryRevisions(
  context: RequestContext,
  documentId: string,
): Promise<LibraryDocumentRevision[]> {
  return withReadOnlyTransaction(context, (tx) =>
    queryLibraryRevisions(tx, context.entityId, documentId),
  );
}

export async function getLibraryRevision(
  context: RequestContext,
  documentId: string,
  revisionId: string,
): Promise<{ id: string; fileName: string; mimeType: string; storagePath: string }> {
  const row = await withReadOnlyTransaction(context, (tx) =>
    tx.maybeOne<{
      id: string;
      file_name: string;
      mime_type: string;
      storage_path: string;
    }>(
      `select r.id, r.file_name, r.mime_type, r.storage_path
         from library.document_revisions r
        where r.entity_id = $1
          and r.document_id = $2
          and r.id = $3`,
      [context.entityId, documentId, revisionId],
    ),
  );

  if (!row) throw new NotFoundError('That revision was not found.');

  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    storagePath: row.storage_path,
  };
}

export async function restoreLibraryRevision(
  context: RequestContext,
  documentId: string,
  revisionId: string,
) {
  await withTransaction(context, (tx) =>
    tx.scalar<string>(`select library.restore_revision($1, $2::uuid, $3::uuid)`, [
      context.entityId,
      documentId,
      revisionId,
    ]),
  );
  return { documentId, revisionId };
}

export async function recordLibraryAccess(
  context: RequestContext,
  documentId: string,
  action: LibraryAccessAction,
) {
  await withTransaction(context, (tx) =>
    tx.scalar<string>(`select library.record_access($1, $2::uuid, $3, $4)`, [
      context.entityId,
      documentId,
      action,
      context.requestId,
    ]),
  );
}

export async function listLibraryAccessEvents(
  context: RequestContext,
  documentId?: string,
  limit = 100,
): Promise<LibraryAccessEvent[]> {
  return withReadOnlyTransaction(context, (tx) =>
    queryLibraryAccessEvents(tx, context.entityId, documentId ?? null, limit),
  );
}

export async function getLatestLibraryOcrJob(
  context: RequestContext,
  documentId: string,
): Promise<LibraryOcrJob | null> {
  return withReadOnlyTransaction(context, (tx) =>
    queryLatestLibraryOcrJob(tx, context.entityId, documentId),
  );
}

export async function getLibraryOcrJob(
  context: RequestContext,
  jobId: string,
): Promise<{ id: string; storagePath: string; mimeType: string } | null> {
  const row = await withReadOnlyTransaction(context, (tx) =>
    tx.maybeOne<{ id: string; storage_path: string; mime_type: string }>(
      `select id, storage_path, mime_type
         from library.ocr_jobs
        where entity_id = $1
          and id = $2`,
      [context.entityId, jobId],
    ),
  );
  if (!row) return null;
  return { id: row.id, storagePath: row.storage_path, mimeType: row.mime_type };
}

export async function enqueueLibraryOcr(
  context: RequestContext,
  documentId: string,
  force = false,
): Promise<string | null> {
  return withTransaction(context, (tx) =>
    tx.scalar<string | null>(`select library.enqueue_ocr($1, $2::uuid, $3)`, [
      context.entityId,
      documentId,
      force,
    ]),
  );
}

export async function claimLibraryOcrJob(context: RequestContext, jobId: string): Promise<boolean> {
  const claimed = await withTransaction(context, (tx) =>
    tx.scalar<string | null>(`select library.claim_ocr_job($1::uuid)`, [jobId]),
  );
  return Boolean(claimed);
}

export async function finishLibraryOcrJob(
  context: RequestContext,
  jobId: string,
  status: 'done' | 'failed' | 'skipped',
  error?: string,
) {
  await withTransaction(context, (tx) =>
    tx.scalar<string>(`select library.finish_ocr_job($1::uuid, $2, $3)`, [
      jobId,
      status,
      error ?? null,
    ]),
  );
}

export async function applyLibraryOcrText(
  context: RequestContext,
  jobId: string,
  text: string | null,
) {
  await withTransaction(context, (tx) =>
    tx.scalar<string>(`select library.apply_ocr_text($1, $2::uuid, $3)`, [
      context.entityId,
      jobId,
      text ?? '',
    ]),
  );
}

export async function listLibraryCollections(
  context: RequestContext,
): Promise<LibraryCollectionSummary[]> {
  return withReadOnlyTransaction(context, (tx) => queryLibraryCollections(tx, context.entityId));
}

export async function getLibraryCollection(
  context: RequestContext,
  collectionId: string,
): Promise<LibraryCollection> {
  const row = await withReadOnlyTransaction(context, (tx) =>
    tx.maybeOne<{
      id: string;
      name: string;
      description: string | null;
      document_count: string;
      created_at: string;
      updated_at: string;
    }>(
      `select c.id,
              c.name,
              c.description,
              (
                select count(*)::text
                  from library.collection_documents cd
                  join library.documents d on d.id = cd.document_id
                 where cd.collection_id = c.id
              ) as document_count,
              to_char(c.created_at, 'YYYY-MM-DD HH24:MI') as created_at,
              to_char(c.updated_at, 'YYYY-MM-DD HH24:MI') as updated_at
         from library.collections c
        where c.entity_id = $1
          and c.id = $2`,
      [context.entityId, collectionId],
    ),
  );
  if (!row) throw new NotFoundError('That collection was not found.');
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    documentCount: Number(row.document_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listLibraryCollectionDocuments(
  context: RequestContext,
  collectionId: string,
): Promise<LibraryDocumentSummary[]> {
  const rows = await withReadOnlyTransaction(context, (tx) =>
    tx.query<DocumentQueryRow>(
      `select d.id,
              d.title,
              d.document_type,
              d.part_number,
              d.manufacturer,
              d.aircraft_type,
              d.aircraft_model,
              d.revision,
              d.version,
              d.effective_date::text as effective_date,
              d.file_name,
              d.file_size::text as file_size,
              d.mime_type,
              d.status,
              d.classification,
              u.full_name as uploaded_by_name,
              to_char(d.created_at, 'YYYY-MM-DD HH24:MI') as created_at,
              coalesce((
                select array_agg(t.name order by t.name)
                  from library.document_tags dt
                  join library.tags t on t.id = dt.tag_id
                 where dt.document_id = d.id
              ), '{}') as tags
         from library.collection_documents cd
         join library.documents d on d.id = cd.document_id
         left join app.users u on u.id = d.uploaded_by
        where d.entity_id = $1
          and cd.collection_id = $2
        order by d.title`,
      [context.entityId, collectionId],
    ),
  );
  return rows.map(toSummary);
}

export async function saveLibraryCollection(
  context: RequestContext,
  input: { collectionId?: string; name: string; description?: string },
) {
  const collectionId = await withTransaction(context, (tx) =>
    tx.scalar<string>(`select library.save_collection($1, $2::jsonb)`, [
      context.entityId,
      JSON.stringify({
        collection_id: input.collectionId ?? null,
        name: input.name,
        description: input.description || null,
      }),
    ]),
  );
  return { collectionId };
}

export async function deleteLibraryCollection(context: RequestContext, collectionId: string) {
  await withTransaction(context, (tx) =>
    tx.scalar<string>(`select library.delete_collection($1, $2::uuid)`, [
      context.entityId,
      collectionId,
    ]),
  );
  return { collectionId };
}

export async function addLibraryDocumentToCollection(
  context: RequestContext,
  collectionId: string,
  documentId: string,
) {
  await withTransaction(context, (tx) =>
    tx.scalar<string>(`select library.add_to_collection($1, $2::uuid, $3::uuid)`, [
      context.entityId,
      collectionId,
      documentId,
    ]),
  );
}

export async function removeLibraryDocumentFromCollection(
  context: RequestContext,
  collectionId: string,
  documentId: string,
) {
  await withTransaction(context, (tx) =>
    tx.scalar<string>(`select library.remove_from_collection($1, $2::uuid, $3::uuid)`, [
      context.entityId,
      collectionId,
      documentId,
    ]),
  );
}

export async function listLibraryDocumentCollections(
  context: RequestContext,
  documentId: string,
): Promise<LibraryCollectionSummary[]> {
  return withReadOnlyTransaction(context, (tx) =>
    queryLibraryDocumentCollections(tx, context.entityId, documentId),
  );
}

export async function listLibraryDocumentLinks(
  context: RequestContext,
  documentId: string,
): Promise<LibraryDocumentLink[]> {
  return withReadOnlyTransaction(context, (tx) =>
    queryLibraryDocumentLinks(tx, context.entityId, documentId),
  );
}

export async function searchLibraryLinkTargets(
  context: RequestContext,
  kind: LibraryLinkKind,
  query: string,
) {
  return withReadOnlyTransaction(context, (tx) =>
    tx.query<{ kind: LibraryLinkKind; record_id: string; label: string; hint: string | null }>(
      `select kind, record_id, label, hint
         from library.search_link_targets($1, $2, $3, 20)`,
      [context.entityId, kind, query],
    ),
  ).then((rows) =>
    rows.map((row) => ({
      kind: row.kind,
      recordId: row.record_id,
      label: row.label,
      hint: row.hint,
    })),
  );
}

export async function linkLibraryDocument(
  context: RequestContext,
  documentId: string,
  kind: LibraryLinkKind,
  recordId: string,
) {
  await withTransaction(context, (tx) =>
    tx.scalar<string>(`select library.link_document($1, $2::uuid, $3, $4::uuid)`, [
      context.entityId,
      documentId,
      kind,
      recordId,
    ]),
  );
}

export async function unlinkLibraryDocument(
  context: RequestContext,
  documentId: string,
  kind: LibraryLinkKind,
  recordId: string,
) {
  await withTransaction(context, (tx) =>
    tx.scalar<string>(`select library.unlink_document($1, $2::uuid, $3, $4::uuid)`, [
      context.entityId,
      documentId,
      kind,
      recordId,
    ]),
  );
}

export async function requestLibraryDocumentAccess(
  context: RequestContext,
  documentId: string,
  reason: string,
) {
  const requestId = await withTransaction(context, (tx) =>
    tx.scalar<string>(`select library.request_document_access($1, $2::uuid, $3)`, [
      context.entityId,
      documentId,
      reason,
    ]),
  );
  return { requestId };
}

export async function decideLibraryDocumentAccess(
  context: RequestContext,
  requestId: string,
  approve: boolean,
) {
  await withTransaction(context, (tx) =>
    tx.scalar<string>(`select library.decide_document_access($1, $2::uuid, $3)`, [
      context.entityId,
      requestId,
      approve,
    ]),
  );
}

export async function listLibraryDocumentAccessRequests(
  context: RequestContext,
  documentId: string,
): Promise<LibraryAccessRequest[]> {
  return withReadOnlyTransaction(context, (tx) =>
    queryLibraryAccessRequests(tx, context.entityId, documentId),
  );
}

export async function getOwnLibraryAccessRequest(
  context: RequestContext,
  documentId: string,
): Promise<LibraryAccessRequest | null> {
  return withReadOnlyTransaction(context, (tx) =>
    queryOwnLibraryAccessRequest(tx, context.entityId, documentId, context.userId),
  );
}

export async function listLibraryNotifications(
  context: RequestContext,
): Promise<LibraryNotification[]> {
  return withReadOnlyTransaction(context, (tx) =>
    queryLibraryNotifications(tx, context.entityId, context.userId),
  );
}

export async function markLibraryNotificationRead(context: RequestContext, notificationId: string) {
  await withTransaction(context, (tx) =>
    tx.scalar<string>(`select library.mark_notification_read($1, $2::uuid)`, [
      context.entityId,
      notificationId,
    ]),
  );
}

async function queryLibraryUploader(
  tx: Transaction,
  entityId: string,
  documentId: string,
): Promise<LibraryColleague | null> {
  const row = await tx.maybeOne<ColleagueRow>(
    `select id, full_name, email, job_title
       from library.get_document_uploader($1, $2::uuid)`,
    [entityId, documentId],
  );
  return row ? toColleague(row) : null;
}

async function queryLibraryComments(
  tx: Transaction,
  entityId: string,
  documentId: string,
): Promise<LibraryComment[]> {
  const rows = await tx.query<CommentRow>(
    `select id,
            author_id,
            author_name,
            body,
            created_at,
            reaction_thumbs,
            reaction_check,
            reaction_eyes,
            reaction_flag,
            mine
       from library.list_document_comments($1, $2::uuid)`,
    [entityId, documentId],
  );
  return rows.map(toComment);
}

export async function listLibraryDocumentComments(
  context: RequestContext,
  documentId: string,
): Promise<LibraryComment[]> {
  return withReadOnlyTransaction(context, (tx) =>
    queryLibraryComments(tx, context.entityId, documentId),
  );
}

export async function getLibraryDocumentPerson(
  context: RequestContext,
  documentId: string,
  userId: string,
): Promise<LibraryColleague> {
  const row = await withReadOnlyTransaction(context, (tx) =>
    tx.maybeOne<ColleagueRow>(
      `select id, full_name, email, job_title
         from library.get_document_person($1, $2::uuid, $3::uuid)`,
      [context.entityId, documentId, userId],
    ),
  );
  if (!row) throw new NotFoundError('That person was not found on this document.');
  return toColleague(row);
}

export async function addLibraryDocumentComment(
  context: RequestContext,
  documentId: string,
  body: string,
): Promise<LibraryComment[]> {
  return withTransaction(context, async (tx) => {
    await tx.scalar<string>(`select library.add_document_comment($1, $2::uuid, $3)`, [
      context.entityId,
      documentId,
      body,
    ]);
    return queryLibraryComments(tx, context.entityId, documentId);
  });
}

export async function toggleLibraryCommentReaction(
  context: RequestContext,
  documentId: string,
  commentId: string,
  emoji: LibraryCommentReactionId,
): Promise<LibraryComment[]> {
  return withTransaction(context, async (tx) => {
    await tx.scalar<boolean>(`select library.toggle_comment_reaction($1, $2::uuid, $3::uuid, $4)`, [
      context.entityId,
      documentId,
      commentId,
      emoji,
    ]);
    return queryLibraryComments(tx, context.entityId, documentId);
  });
}

type ShareRow = {
  id: string;
  shared_by: string;
  shared_by_name: string | null;
  channel: string;
  recipient_user_id: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  note: string | null;
  granted_access: boolean;
  created_at: string;
};

function toShareChannel(value: string): LibraryShareChannel {
  if ((LIBRARY_SHARE_CHANNELS as readonly string[]).includes(value)) {
    return value as LibraryShareChannel;
  }
  return 'internal';
}

function toShare(row: ShareRow): LibraryDocumentShare {
  return {
    id: row.id,
    sharedBy: row.shared_by,
    sharedByName: row.shared_by_name,
    channel: toShareChannel(row.channel),
    recipientUserId: row.recipient_user_id,
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    note: row.note,
    grantedAccess: row.granted_access,
    createdAt: row.created_at,
  };
}

async function queryLibraryShares(
  tx: Transaction,
  entityId: string,
  documentId: string,
): Promise<LibraryDocumentShare[]> {
  const rows = await tx.query<ShareRow>(
    `select id,
            shared_by,
            shared_by_name,
            channel,
            recipient_user_id,
            recipient_name,
            recipient_email,
            note,
            granted_access,
            created_at
       from library.list_document_shares($1, $2::uuid)`,
    [entityId, documentId],
  );
  return rows.map(toShare);
}

export async function listLibraryShareColleagues(
  context: RequestContext,
  documentId: string,
  query: string,
): Promise<LibraryColleague[]> {
  return withReadOnlyTransaction(context, async (tx) => {
    const rows = await tx.query<ColleagueRow>(
      `select id, full_name, email, job_title
         from library.list_share_colleagues($1, $2::uuid, $3)`,
      [context.entityId, documentId, query],
    );
    return rows.map(toColleague);
  });
}

export async function shareLibraryDocument(
  context: RequestContext,
  input: {
    documentId: string;
    channel: LibraryShareChannel;
    recipientUserId: string | null;
    note: string | null;
  },
): Promise<{
  shareId: string;
  granted: boolean;
  alreadyOpen: boolean;
  shares: LibraryDocumentShare[];
}> {
  return withTransaction(context, async (tx) => {
    const row = await tx.one<{
      share_id: string;
      granted: boolean;
      already_open: boolean;
    }>(
      `select share_id, granted, already_open
         from library.share_document($1, $2::uuid, $3, $4::uuid, $5)`,
      [context.entityId, input.documentId, input.channel, input.recipientUserId, input.note],
    );
    return {
      shareId: row.share_id,
      granted: row.granted,
      alreadyOpen: row.already_open,
      shares: await queryLibraryShares(tx, context.entityId, input.documentId),
    };
  });
}
