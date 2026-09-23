import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { db } from '../../db/client';
import { bases, nfcReaders } from '../../db/schema';
import { ApiError } from '../../plugins/errors';
import { hexEquals, sha256Hex } from './crypto';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set only by `requireReader` — the provisioned gate reader that signed this request. */
    reader?: { id: string; baseId: string };
  }
}

// `Authorization: Gate <readerId>.<secret>`. The id is a UUID; the secret is 32 random bytes in
// base64url. Anything else is rejected before touching the database.
const GATE = /^Gate ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i;

/**
 * onRequest hook for the speedgate route, which is `public` (no Supabase user): a reader device
 * authenticates with its own credential. Only an active reader at an active base passes.
 */
export async function requireReader(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization;
  const m = typeof header === 'string' ? GATE.exec(header) : null;
  if (m) {
    const [row] = await db
      .select({ id: nfcReaders.id, baseId: nfcReaders.baseId, keyHash: nfcReaders.keyHash })
      .from(nfcReaders)
      .innerJoin(bases, eq(bases.id, nfcReaders.baseId))
      .where(and(eq(nfcReaders.id, m[1]!.toLowerCase()), eq(nfcReaders.isActive, true), eq(bases.isActive, true)))
      .limit(1);
    if (row && hexEquals(row.keyHash, sha256Hex(m[2]!))) {
      request.reader = { id: row.id, baseId: row.baseId };
      return;
    }
  }
  request.log.warn('speedgate: reader credential rejected');
  throw new ApiError('UNAUTHORIZED');
}
