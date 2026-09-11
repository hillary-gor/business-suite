import { after } from 'next/server';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RequestContext } from '@/server/db/transaction';
import { clipExtracted } from './extract';
import {
  applyLibraryOcrText,
  claimLibraryOcrJob,
  enqueueLibraryOcr,
  finishLibraryOcrJob,
  getLibraryOcrJob,
} from './queries';
import { downloadLibraryObject } from './storage';

const MAX_PDF_PAGES = 6;
const OCR_TIMEOUT_MS = 90_000;

export async function enqueueAndRunLibraryOcr(
  context: RequestContext,
  documentId: string,
  force = false,
): Promise<void> {
  const jobId = await enqueueLibraryOcr(context, documentId, force);
  if (!jobId) return;
  after(() => {
    void runLibraryOcrJob(context, jobId).catch((error) => {
      console.error('[library:ocr]', error);
    });
  });
}

export async function runLibraryOcrJob(context: RequestContext, jobId: string): Promise<void> {
  const claimed = await claimLibraryOcrJob(context, jobId);
  if (!claimed) return;

  const job = await getLibraryOcrJob(context, jobId);
  if (!job) {
    await finishLibraryOcrJob(context, jobId, 'failed', 'OCR job was not found after claim.');
    return;
  }

  try {
    const file = await downloadLibraryObject(job.storagePath);
    if (!file) {
      await finishLibraryOcrJob(context, jobId, 'failed', 'The stored file could not be read.');
      return;
    }

    const text = await withTimeout(ocrBytes(file.bytes, job.mimeType), OCR_TIMEOUT_MS);
    await applyLibraryOcrText(context, jobId, text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OCR failed.';
    await finishLibraryOcrJob(context, jobId, 'failed', message).catch((finishError) => {
      console.error('[library:ocr:finish]', finishError);
    });
  }
}

async function ocrBytes(bytes: Buffer, mimeType: string): Promise<string | null> {
  const images = mimeType === 'application/pdf' ? await pdfPageImages(bytes) : [bytes];
  if (images.length === 0) return null;

  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    cachePath: join(tmpdir(), 'skyjet-tessdata'),
    logger: () => undefined,
  });
  try {
    const parts: string[] = [];
    for (const image of images) {
      const result = await worker.recognize(image);
      const piece = clipExtracted(result.data.text);
      if (piece) parts.push(piece);
    }
    return clipExtracted(parts.join('\n\n'));
  } finally {
    await worker.terminate();
  }
}

async function pdfPageImages(bytes: Buffer): Promise<Buffer[]> {
  const { useLibraryPdfjs } = await import('./pdfjs');
  await useLibraryPdfjs();
  const unpdf = await import('unpdf');
  const pdf = await unpdf.getDocumentProxy(new Uint8Array(bytes));
  const pages = Math.min(pdf.numPages || 1, MAX_PDF_PAGES);
  const images: Buffer[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const rendered = await unpdf.renderPageAsImage(pdf, page, {
      canvasImport: () => import('@napi-rs/canvas'),
      scale: 1.5,
    });
    images.push(Buffer.from(rendered));
  }
  return images;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('OCR timed out after 90 seconds.')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
