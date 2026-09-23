// Pure countdown logic (F2), kept out of the component so it can be unit-tested.

/** DESIGN.md: warning color when less than 30 minutes are left. */
export const WARNING_BEFORE_MS = 30 * 60_000;

export type CountdownState = { kind: 'left'; hhmm: string; warning: boolean } | { kind: 'late' };

/**
 * `serverOffsetMs` = server clock − phone clock, measured when /reports/today answered, so a
 * wrong phone clock can't hide the deadline (SPEC §9 row 10).
 */
export function countdownState(
  deadlineIso: string,
  nowMs: number,
  serverOffsetMs = 0,
): CountdownState {
  const left = Date.parse(deadlineIso) - (nowMs + serverOffsetMs);
  if (left <= 0) return { kind: 'late' };
  // Round up: "00:01" until the very last minute has passed.
  const totalMin = Math.ceil(left / 60_000);
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return { kind: 'left', hhmm: `${hh}:${mm}`, warning: left < WARNING_BEFORE_MS };
}

export function serverOffset(serverTimeIso: string, receivedAtMs: number): number {
  const t = Date.parse(serverTimeIso);
  return Number.isNaN(t) ? 0 : t - receivedAtMs;
}
