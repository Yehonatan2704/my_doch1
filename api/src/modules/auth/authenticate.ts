import type { FastifyRequest } from 'fastify';
import { ApiError } from '../../plugins/errors';
import { InvalidTokenError, verifySupabaseJwt, type SupabaseClaims } from './jwt';
import { findUserByEmail } from './service';

// Runs on every non-public route (server.ts). Missing/invalid/expired token → 401;
// valid token but unknown or inactive user → 403. Sets `request.user` — the only source of identity.
export const authenticate: (request: FastifyRequest) => Promise<void> = async (request) => {
  const header = request.headers.authorization;
  const match = typeof header === 'string' ? /^Bearer ([^\s]+)$/.exec(header) : null;
  if (!match) throw new ApiError('UNAUTHORIZED');

  let claims: SupabaseClaims;
  try {
    claims = await verifySupabaseJwt(match[1]!);
  } catch (err) {
    if (err instanceof InvalidTokenError) {
      request.log.warn({ reason: err.message }, 'auth: token rejected');
      throw new ApiError('UNAUTHORIZED');
    }
    throw err; // e.g. JWKS unreachable → 500, not a forced logout
  }

  // SPEC §3: Google sign-in only. Blocks e.g. an unconfirmed email/password sign-up that claims a
  // seeded address.
  const meta = claims.app_metadata;
  if (meta?.provider !== 'google' && !meta?.providers?.includes('google')) {
    request.log.warn('auth: non-google provider');
    throw new ApiError('UNAUTHORIZED');
  }

  request.user = await findUserByEmail(claims.email);
};
