import { NextResponse } from 'next/server';
import { PlatformModule } from '@/lib/platform/modules';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import {
  getLibraryDocument,
  getLibraryRevision,
  recordLibraryAccess,
} from '@/server/modules/library/queries';
import { downloadLibraryObject } from '@/server/modules/library/storage';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const download = url.searchParams.get('download') === '1';
  const revisionId = url.searchParams.get('revision');

  try {
    const { context } = await authorise(Permission.LibraryDocumentRead, {
      module: PlatformModule.Library,
    });
    const document = await getLibraryDocument(context, id);
    if (!document.canOpen) {
      return new NextResponse(null, { status: 404 });
    }
    const revision =
      revisionId && UUID.test(revisionId)
        ? await getLibraryRevision(context, id, revisionId)
        : null;

    if (revisionId && !revision) {
      return new NextResponse(null, { status: 404 });
    }

    const fileName = revision?.fileName ?? document.fileName;
    const mimeType = revision?.mimeType ?? document.mimeType;
    const storagePath = revision?.storagePath ?? document.storagePath;
    const file = await downloadLibraryObject(storagePath);
    if (!file) return new NextResponse(null, { status: 404 });

    await recordLibraryAccess(context, id, download ? 'DOWNLOAD' : 'PREVIEW');

    const disposition = download ? 'attachment' : 'inline';
    return new NextResponse(Uint8Array.from(file.bytes), {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `${disposition}; filename="${fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'ModuleNotEntitledError' || name === 'PermissionDeniedError') {
      return new NextResponse(null, { status: 403 });
    }
    if (name === 'NotFoundError') return new NextResponse(null, { status: 404 });
    console.error('[library:file]', error);
    return new NextResponse(null, { status: 500 });
  }
}
