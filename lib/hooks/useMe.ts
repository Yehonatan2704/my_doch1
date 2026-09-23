import { useQuery } from '@tanstack/react-query';
import { api, type ApiError } from '../api';
import { gateFor } from '../authGate';

export const meKey = ['me'] as const;

/** GET /me — who am I, am I a commander, my group. Only runs once signed in. */
export function useMe(enabled = true) {
  return useQuery({
    queryKey: meKey,
    queryFn: api.me,
    enabled,
    staleTime: 5 * 60_000,
    // Retry only transient failures; a 401/403 answer won't change on retry.
    retry: (count, err) => count < 1 && gateFor(err as ApiError) === 'error',
  });
}
