import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import {
  INTEGRATION_KEY_HEADER,
  INTEGRATION_KEY_MIN_LENGTH,
  type IntegrationSystem,
} from '@doch1/shared';
import { ApiError } from '../../plugins/errors';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set only by `requireIntegration` — the external system whose key was presented. */
    integration?: IntegrationSystem;
  }
}

// One secret per system (SECURITY.md §15): a CPR key can never write annual leave, and back.
const ENV_KEY: Record<IntegrationSystem, string> = {
  cpr: 'INTEGRATION_CPR_KEY',
  people_digital: 'INTEGRATION_PEOPLE_DIGITAL_KEY',
};

// Read per request, not at import, so a rotated key needs only an env change + restart and tests
// can switch keys. A missing or short key disables that system (every call is a 401).
function configuredKey(system: IntegrationSystem): string | null {
  const key = process.env[ENV_KEY[system]];
  return key && key.length >= INTEGRATION_KEY_MIN_LENGTH ? key : null;
}

// Hashing first gives equal-length buffers, so timingSafeEqual never throws and the comparison
// leaks neither the key nor its length.
const digest = (v: string) => createHash('sha256').update(v).digest();

/**
 * onRequest hook for the integration routes, which are `public` (no Supabase user): they are
 * authenticated by `X-Integration-Key` instead. Runs before rate limiting, so the limit is keyed
 * by system.
 */
export function requireIntegration(...allowed: IntegrationSystem[]) {
  return async (request: FastifyRequest): Promise<void> => {
    const header = request.headers[INTEGRATION_KEY_HEADER];
    if (typeof header === 'string' && header.length > 0) {
      const given = digest(header);
      for (const system of allowed) {
        const key = configuredKey(system);
        if (key && timingSafeEqual(given, digest(key))) {
          request.integration = system;
          return;
        }
      }
    }
    request.log.warn({ allowed }, 'integration: key rejected');
    throw new ApiError('INTEGRATION_UNAUTHORIZED');
  };
}
