import { SIGNED_URL_TTL_SEC } from '@doch1/shared';
import { ApiError } from '../../plugins/errors';

const BUCKET = 'sick-documents';

/**
 * A short-lived signed URL for a file in the private bucket (SECURITY.md §6). The service-role
 * key stays on the server; the client only ever receives the signed URL.
 */
export async function signDocumentUrl(
  storagePath: string,
): Promise<{ url: string; expiresAt: string }> {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new ApiError('INTERNAL');

  const res = await fetch(
    `${base.replace(/\/$/, '')}/storage/v1/object/sign/${BUCKET}/${encodePath(storagePath)}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SEC }),
    },
  );
  if (!res.ok) throw new ApiError(res.status === 404 ? 'NOT_FOUND' : 'INTERNAL');

  const { signedURL } = (await res.json()) as { signedURL?: string };
  if (!signedURL) throw new ApiError('INTERNAL');
  return {
    url: `${base.replace(/\/$/, '')}/storage/v1${signedURL}`,
    expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SEC * 1000).toISOString(),
  };
}

// The path is server-generated ({userId}/{uuid}.{ext}), but encode each segment anyway so a
// stored value can never alter the request's shape.
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
