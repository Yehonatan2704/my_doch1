// Pure helpers for the settings screen (F6) — kept apart from React so they're unit-tested.

export const MINUTE_STEP = 5;

const pad = (n: number) => String(n).padStart(2, '0');

/** "HH:MM" → [hour, minute]. */
export function splitTime(hhmm: string): [number, number] {
  const [h, m] = hhmm.split(':').map(Number);
  return [h ?? 0, m ?? 0];
}

/**
 * Step one part of an "HH:MM" time, wrapping around (23 → 00, 55 → 00). Minutes move on the
 * 5-minute grid, so an off-grid server value like 08:07 snaps to 08:10 / 08:05.
 */
export function stepTime(hhmm: string, part: 'hour' | 'minute', dir: 1 | -1): string {
  const [h, m] = splitTime(hhmm);
  if (part === 'hour') return `${pad((h + dir + 24) % 24)}:${pad(m)}`;
  const snapped = dir === 1 ? Math.floor(m / MINUTE_STEP) + 1 : Math.ceil(m / MINUTE_STEP) - 1;
  const slots = 60 / MINUTE_STEP;
  return `${pad(h)}:${pad((((snapped % slots) + slots) % slots) * MINUTE_STEP)}`;
}
