import { useState } from 'react';
import { useActiveEmergencies, useRespondEmergency } from '../../hooks/commander/useEmergency';
import type { ApiError } from '../../lib/api';
import { EmergencySheet } from './EmergencySheet';

/**
 * F10 soldier side: shows `EmergencySheet` while an open event includes me. Unanswered = can't be
 * closed; once answered it can be closed and the answer changed later. Mount once in a signed-in
 * layout; it disappears when the commander ends the event.
 */
export function EmergencyGate() {
  const active = useActiveEmergencies();
  const respond = useRespondEmergency();
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const event = active.data?.events.find((e) => !e.myResponse || !closed.has(e.id));
  if (!event) return null;

  return (
    <EmergencySheet
      event={event}
      sending={respond.isPending}
      error={error}
      onAnswer={(status) => {
        setError(null);
        respond.mutate(
          { id: event.id, status },
          { onError: (e) => setError((e as ApiError).message) },
        );
      }}
      onClose={event.myResponse ? () => setClosed((c) => new Set(c).add(event.id)) : undefined}
    />
  );
}
