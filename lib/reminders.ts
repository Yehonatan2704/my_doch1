// F6 reminder + nudge plan. Pure: which local notifications should exist right now, given the
// settings and which days are already reported. Scheduling them is lib/notifications.
import { DEADLINE_HOUR, FUTURE_WINDOW_DAYS, TZ, type Settings } from '@doch1/shared';
import { fromZonedTime } from 'date-fns-tz';
import { addDays, type Ymd } from './calendar';

/** iOS keeps at most 64 pending local notifications per app; stay under it. */
export const MAX_SCHEDULED = 60;

export type ReminderKind = 'reminder' | 'nudge' | 'weekly';
export type PlannedReminder = { id: string; kind: ReminderKind; date: Ymd; at: number };

const pad = (n: number) => String(n).padStart(2, '0');
/** 0 = Sunday … 6 = Saturday for a calendar date (timezone-free). */
const weekday = (date: Ymd) => new Date(`${date}T12:00:00Z`).getUTCDay();
const atIL = (date: Ymd, hhmm: string) => fromZonedTime(`${date}T${hhmm}:00`, TZ).getTime();

/**
 * Today and the next FUTURE_WINDOW_DAYS days (a scheduled future report is known in advance, so
 * those days are skipped too). Per unreported day:
 * - reminder at `reminderTime`, if on;
 * - nudges every `nudgeIntervalMin` until the 11:00 deadline, if on.
 * ASSUMPTION: nudges start one interval after the reminder time (at the reminder time itself when
 * the reminder is off), so the two never fire together. SPEC §9 row 25.
 * Weekly reminder (DESIGN §7.4), if on: on `weeklyReminderDay` at `weeklyReminderTime`, whether or
 * not that day is reported (it is about the coming week). The daily reminder still fires that day.
 * Only instants after `now`, soonest first, capped at MAX_SCHEDULED; the app re-plans every time
 * it opens, so the far days fill in later.
 */
export function planReminders({
  settings,
  today,
  reported,
  now,
}: {
  settings: Settings;
  today: Ymd;
  reported: ReadonlySet<Ymd>;
  now: number;
}): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const stepMs = settings.nudgeIntervalMin * 60_000;
  for (let i = 0; i <= FUTURE_WINDOW_DAYS; i++) {
    const date = addDays(today, i);
    const weeklyDay = settings.weeklyReminderEnabled && weekday(date) === settings.weeklyReminderDay;
    if (weeklyDay) out.push(item('weekly', date, atIL(date, settings.weeklyReminderTime)));
    if (reported.has(date)) continue;
    const start = atIL(date, settings.reminderTime);
    const deadline = atIL(date, `${pad(DEADLINE_HOUR)}:00`);
    if (settings.reminderEnabled) out.push(item('reminder', date, start));
    if (settings.nudgeEnabled) {
      for (let t = settings.reminderEnabled ? start + stepMs : start; t < deadline; t += stepMs) {
        out.push(item('nudge', date, t));
      }
    }
  }
  return out
    .filter((r) => r.at > now)
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_SCHEDULED);
}

function item(kind: ReminderKind, date: Ymd, at: number): PlannedReminder {
  return { id: `${ID_PREFIX}${kind}-${date}-${at}`, kind, date, at };
}

/** Every notification this app schedules has an id starting with this. */
export const ID_PREFIX = 'doch1-';
