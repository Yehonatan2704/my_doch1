import { randomUUID } from 'node:crypto';
import { db } from '../../db/client';
import { documents } from '../../db/schema';
import { ApiError } from '../../plugins/errors';
import { sniff, stripMetadata } from './filetype';

const BUCKET = 'sick-documents';

/**
 * Store a sick note for `userId` (always request.user.id) and return its id.
 * The path is generated here — the uploaded filename is never used (SECURITY.md §6).
 * The row and the object are written together: if the upload fails, the row rolls back.
 */
export async function saveDocument(userId: string, raw: Buffer): Promise<string> {
  if (raw.length === 0) throw new ApiError('VALIDATION_ERROR');
  const type = sniff(raw);
  if (!type) throw new ApiError('FILE_TYPE_NOT_ALLOWED');
  const file = stripMetadata(raw, type);

  const id = randomUUID();
  const storagePath = `${userId}/${id}.${type.ext}`;
  await db.transaction(async (tx) => {
    await tx.insert(documents).values({
      id,
      ownerId: userId,
      storagePath,
      mimeType: type.mime,
      sizeBytes: file.length,
    });
    await uploadObject(storagePath, file, type.mime);
  });
  return id;
}

// Supabase Storage REST with the service-role key, which never leaves the server. The URL comes
// from server config only (no user-supplied URLs — SECURITY.md §8).
async function uploadObject(path: string, body: Buffer, contentType: string): Promise<void> {
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new ApiError('INTERNAL');

  const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': contentType,
      'x-upsert': 'false',
    },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`storage upload failed: ${res.status}`);
}
