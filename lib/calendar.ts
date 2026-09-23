// Calendar math on Israeli calendar dates ("YYYY-MM-DD" strings, as the API sends them). Pure —
// unit-tested. Dates are handled as UTC midnights so the phone's time zone never shifts a day.
import { FUTURE_WINDOW_DAYS, isChangedByOther, type CategoryCode, type Report } from '@doch1/shared';

export type Ymd = string;
/** month is 1…12 */
export type Month = { year: number; month: number };

const utc = (d: Ymd) => new Date(`${d}T00:00:00Z`);
const ymd = (t: Date) => t.toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');

export function addDays(d: Ymd, n: number): Ymd {
  const t = utc(d);
  t.setUTCDate(t.getUTCDate() + n);
  return ymd(t);
}

export const monthOf = (d: Ymd): Month => ({ year: +d.slice(0, 4), month: +d.slice(5, 7) });

export function shiftMonth({ year, month }: Month, n: number): Month {
  const i = year * 12 + (month - 1) + n;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

/** First and last day of a month — the range for GET /reports. */
export function monthRange({ year, month }: Month): { from: Ymd; to: Ymd } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
}

/** Weeks of 7 cells, Sunday first (יום א'), `null` outside the month. */
export function monthWeeks(m: Month): (Ymd | null)[][] {
  const { from, to } = monthRange(m);
  const cells: (Ymd | null)[] = Array(utc(from).getUTCDay()).fill(null);
  for (let d = from; d <= to; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** F4: only today+1 … today+7 can be reported ahead. */
export const inFutureWindow = (today: Ymd, d: Ymd) =>
  d > today && d <= addDays(today, FUTURE_WINDOW_DAYS);

export const futureWindow = (today: Ymd) => ({
  from: addDays(today, 1),
  to: addDays(today, FUTURE_WINDOW_DAYS),
});

/** What a calendar cell shows for a day (DESIGN.md `CalendarMonth` states). */
export type DayMark = {
  /** ✓ — on base */
  present?: boolean;
  /** short reason, when not on base */
  label?: string;
  /** 📅 — reported ahead */
  scheduled?: boolean;
  /** red ring — changed by a commander or HR */
  changed?: boolean;
  /** 📎 */
  attachment?: boolean;
  /** category of the reported reason — colors the short label (DESIGN.md §7.3) */
  category?: CategoryCode;
  /** not yet approved by a commander — blue dot on editable days */
  pending?: boolean;
};

export function markFor(r: Report, today: Ymd): DayMark {
  const present = r.reason.categoryCode === 'on_base';
  return {
    present,
    label: present ? undefined : r.reason.nameHe,
    scheduled: r.date > today,
    changed: isChangedByOther(r.source),
    attachment: !!r.documentId,
    category: r.reason.categoryCode,
    pending: !r.approvedBy,
  };
}

export const marksFor = (reports: Report[] | undefined, today: Ymd) =>
  Object.fromEntries((reports ?? []).map((r) => [r.date, markFor(r, today)])) as Record<
    Ymd,
    DayMark
  >;

/** §7.3: today … today+7 can be reported or changed by the soldier. */
export const isEditable = (today: Ymd, d: Ymd) =>
  d >= today && d <= addDays(today, FUTURE_WINDOW_DAYS);

/** Every day from a to b (either order), clamped to the editable window. */
export function editableRange(today: Ymd, a: Ymd, b: Ymd): Ymd[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const out: Ymd[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isEditable(today, d)) out.push(d);
  return out;
}

/** "24.9" */
export const shortDM = (d: Ymd) => `${+d.slice(8, 10)}.${+d.slice(5, 7)}`;
