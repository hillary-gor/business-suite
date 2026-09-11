import { NextResponse } from 'next/server';
import { NotFoundError, PermissionDeniedError } from '@/server/db/errors';

export function pdfFileResponse(
  buffer: Buffer,
  filename: string,
  disposition: 'inline' | 'attachment' = 'inline',
) {
  const safeName = filename.replace(/["\r\n]+/g, '');
  return new NextResponse(Uint8Array.from(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${safeName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export function pdfRouteError(error: unknown) {
  if (error instanceof PermissionDeniedError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  console.error('[documents/pdf]', error);
  return NextResponse.json({ error: 'The PDF could not be generated.' }, { status: 500 });
}
