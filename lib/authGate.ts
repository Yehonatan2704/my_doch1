// Pure decision: what to do with the answer (or error) from GET /me. Unit-tested.
import type { ErrorCode } from '@doch1/shared';

export type Gate = 'ok' | 'not-registered' | 'signed-out' | 'error';

export function gateFor(error: { code?: ErrorCode } | null | undefined): Gate {
  if (!error) return 'ok';
  switch (error.code) {
    case 'NOT_REGISTERED':
    case 'INACTIVE_USER':
      return 'not-registered'; // SPEC F1: no self-registration, show the support screen
    case 'UNAUTHORIZED':
      return 'signed-out'; // expired/revoked session → back to login
    default:
      return 'error'; // network etc. — retryable, don't log the user out
  }
}
