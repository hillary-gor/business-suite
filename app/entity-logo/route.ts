import { NextResponse } from 'next/server';
import { getSession, resolveEntity } from '@/server/auth/session';
import { withReadOnlyTransaction } from '@/server/db/transaction';
import { getPublicCompanyLogo } from '@/server/modules/settings/company';

export const dynamic = 'force-dynamic';

function logoResponse(mime: string, bytes: Buffer) {
  return new NextResponse(Uint8Array.from(bytes), {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'private, max-age=30',
    },
  });
}

export async function GET() {
  const session = await getSession();

  if (!session) {
    try {
      const publicLogo = await getPublicCompanyLogo();
      if (!publicLogo) return new NextResponse(null, { status: 404 });
      return logoResponse(publicLogo.mime, publicLogo.bytes);
    } catch {
      return new NextResponse(null, { status: 404 });
    }
  }

  try {
    const entity = await resolveEntity(session);
    const row = await withReadOnlyTransaction(
      {
        userId: session.userId,
        entityId: entity.entityId,
        requestId: session.requestId,
      },
      (tx) =>
        tx.maybeOne<{ logo_mime: string | null; logo_bytes: Buffer | null }>(
          `select logo_mime, logo_bytes from app.entities where id = $1`,
          [entity.entityId],
        ),
    );

    if (!row?.logo_bytes || !row.logo_mime) return new NextResponse(null, { status: 404 });

    const body = Buffer.isBuffer(row.logo_bytes)
      ? row.logo_bytes
      : Buffer.from(row.logo_bytes as unknown as Uint8Array);

    return logoResponse(row.logo_mime, body);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
