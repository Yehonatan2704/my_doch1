import {
  EMERGENCY_POLL_MS,
  type EmergencyResponseStatus,
  type StartEmergencyBody,
} from '@doch1/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { commanderKeys } from './useCommander';

const keys = {
  detail: (id: string) => ['emergency', id] as const,
  active: ['emergency', 'active'] as const,
};

/** POST /commander/emergencies — the list's `openEmergencyId` flips on after a refetch. */
export function useStartEmergency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StartEmergencyBody) => api.startEmergency(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: commanderKeys.reports }),
  });
}

/** GET /commander/emergencies/:id — live view, polled every 5s while the event is open (F10). */
export function useEmergencyDetail(id: string | undefined) {
  return useQuery({
    queryKey: keys.detail(id ?? ''),
    queryFn: () => api.emergency(id!),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.endedAt ? false : EMERGENCY_POLL_MS),
  });
}

/** POST /commander/emergencies/:id/end */
export function useEndEmergency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.endEmergency(id),
    onSuccess: (_d, id) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.detail(id) }),
        qc.invalidateQueries({ queryKey: commanderKeys.reports }),
        qc.invalidateQueries({ queryKey: keys.active }),
      ]),
  });
}

/**
 * GET /emergencies/active — open events that include me (soldier side). Polled so the sheet
 * appears without a push and disappears once the commander ends the event.
 */
export function useActiveEmergencies() {
  return useQuery({
    queryKey: keys.active,
    queryFn: api.activeEmergencies,
    refetchInterval: EMERGENCY_POLL_MS * 3,
  });
}

/** POST /emergencies/:id/respond — may be changed while the event is open. */
export function useRespondEmergency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: EmergencyResponseStatus }) =>
      api.respondEmergency(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.active }),
  });
}
