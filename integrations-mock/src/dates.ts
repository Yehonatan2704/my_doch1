import { TZ } from '@doch1/shared';

// All dates are ISO `YYYY-MM-DD` strings. "Today" is always Asia/Jerusalem, never the machine's
// local date: Render runs in UTC, so between 00:00 and 03:00 Israel time the two disagree.
const isoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayInTz(now: Date = new Date()): string {
  return isoFormatter.format(now); // en-CA formats as YYYY-MM-DD
}

// Calendar arithmetic on the date itself (at UTC midnight), so DST never shifts a day.
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysInclusive(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export function formatDmy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
