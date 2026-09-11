import { NextResponse } from 'next/server';
import { authorise } from '@/server/auth/session';
import { DOCUMENT_KIND_CONFIG } from '@/lib/documents/kinds';
import { renderDraftDocumentPdf } from '@/server/modules/documents/print';
import { documentDraftSchema } from '@/server/modules/documents/schema';
import { pdfFileResponse, pdfRouteError } from '@/server/pdf/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: 'The draft could not be read.' }, { status: 400 });
    }

    const parsed = documentDraftSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Check the document before previewing.' }, { status: 400 });
    }

    const { context } = await authorise(DOCUMENT_KIND_CONFIG[parsed.data.kind].permission);
    const pdf = await renderDraftDocumentPdf(context, parsed.data);
    return pdfFileResponse(pdf.buffer, pdf.filename);
  } catch (error) {
    return pdfRouteError(error);
  }
}
