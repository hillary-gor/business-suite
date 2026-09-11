import { createHash } from 'node:crypto';
import { createSupabaseAdminClient } from '@/server/auth/admin';
import { BusinessRuleError, ConfigurationError } from '@/server/db/errors';
import { libraryObjectPath, libraryRevisionObjectPath, sanitizeLibraryFileName } from './paths';
import {
  LIBRARY_BUCKET,
  LIBRARY_MAX_FILE_BYTES,
  LIBRARY_MIME_TYPES,
  type LibraryMimeType,
} from './types';

export { libraryObjectPath, libraryRevisionObjectPath, sanitizeLibraryFileName };

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function assertLibraryFile(file: {
  name: string;
  type: string;
  size: number;
}): asserts file is { name: string; type: LibraryMimeType; size: number } {
  if (file.size <= 0 || file.size > LIBRARY_MAX_FILE_BYTES) {
    throw new BusinessRuleError('File must be between 1 byte and 32 MB.');
  }
  if (!LIBRARY_MIME_TYPES.includes(file.type as LibraryMimeType)) {
    throw new BusinessRuleError('That file type is not accepted.');
  }
}

function storageClient() {
  try {
    return createSupabaseAdminClient().storage.from(LIBRARY_BUCKET);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw new ConfigurationError(
        'Uploading library files needs SUPABASE_SECRET_KEY on the server. Add the service role key from Supabase → Project Settings → API as a Secret — never as NEXT_PUBLIC_.',
      );
    }
    throw error;
  }
}

export async function uploadLibraryObject(
  path: string,
  bytes: Buffer,
  mimeType: string,
): Promise<void> {
  const { error } = await storageClient().upload(path, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) {
    throw new BusinessRuleError(error.message || 'The file could not be stored.');
  }
}

export async function downloadLibraryObject(
  path: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const { data, error } = await storageClient().download(path);
  if (error || !data) return null;
  const buffer = Buffer.from(await data.arrayBuffer());
  return { bytes: buffer, contentType: data.type || 'application/octet-stream' };
}

export async function removeLibraryObject(path: string): Promise<void> {
  await removeLibraryObjects([path]);
}

export async function removeLibraryObjects(paths: readonly string[]): Promise<void> {
  const unique = [...new Set(paths.filter((path) => path.length > 0))];
  if (unique.length === 0) return;
  const { error } = await storageClient().remove(unique);
  if (error) {
    console.error('[library:storage:remove]', error.message);
  }
}
