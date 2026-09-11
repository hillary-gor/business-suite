import { NextResponse } from 'next/server';
import { authorise } from '@/server/auth/session';
import { DOCUMENT_KIND_CONFIG, parseDocumentKind } from '@/lib/documents/kinds';
import { renderSavedDocumentPdf } from '@/server/modules/documents/print';
import { documentIdSchema } from '@/server/modules/documents/schema';
import { pdfFileResponse, pdfRouteError } from '@/server/pdf/http';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const { kind: kindRaw, id: idRaw } = await context.params;
    const kind = parseDocumentKind(kindRaw);
    if (!kind) {
      return NextResponse.json({ error: 'Unknown document type.' }, { status: 404 });
    }

    const id = documentIdSchema.safeParse(idRaw);
    if (!id.success) {
      return NextResponse.json({ error: 'That document could not be found.' }, { status: 400 });
    }

    const asOfRaw = new URL(request.url).searchParams.get('asOf');
    let asOf: string | undefined;
    if (asOfRaw) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfRaw)) {
        return NextResponse.json({ error: 'Use an as-of date like 2026-09-06.' }, { status: 400 });
      }
      asOf = asOfRaw;
    }

    const { context: requestContext } = await authorise(DOCUMENT_KIND_CONFIG[kind].permission);
    const pdf = await renderSavedDocumentPdf(requestContext, kind, id.data, asOf);
    return pdfFileResponse(pdf.buffer, pdf.filename);
  } catch (error) {
    return pdfRouteError(error);
  }
}
