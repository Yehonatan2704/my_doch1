import { TZ } from '@doch1/shared';

// Asia/Jerusalem wall-clock helpers (CLAUDE.md rule 7) — never the server's local time zone.
// Built on Intl so the API needs no extra dependency; DST is handled by the ICU tz database.

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function parts(d: Date) {
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(d)) p[type] = value;
  return p as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>;
}

/** The one place "now" comes from, so tests can move the clock. */
export const clock = { now: () => new Date() };

/** Calendar date in Israel, `YYYY-MM-DD`. */
export function jerusalemDate(d: Date): string {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Wall-clock time in Israel, `HH:MM`. */
export function jerusalemHHMM(d: Date): string {
  const p = parts(d);
  return `${p.hour}:${p.minute}`;
}

// Israel's UTC offset at an instant, in ms (+2h or +3h).
function offsetMs(d: Date): number {
  const p = parts(d);
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wall - Math.floor(d.getTime() / 1000) * 1000;
}

/** The instant (ISO 8601, UTC) of `HH:MM` on `date` in Israel. */
export function atJerusalem(date: string, hhmm: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(':').map(Number) as [number, number];
  const wall = Date.UTC(y, m - 1, d, h, mi);
  // Two passes settle the offset even when the guess lands across a DST change.
  let t = wall - offsetMs(new Date(wall));
  t = wall - offsetMs(new Date(t));
  return new Date(t).toISOString();
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`). */
export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
