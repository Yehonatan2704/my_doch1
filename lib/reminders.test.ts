import type { Settings } from '@doch1/shared';
import { describe, expect, test } from 'vitest';
import { MAX_SCHEDULED, planReminders } from './reminders';

const base: Settings = {
  reminderEnabled: true,
  reminderTime: '08:00',
  nudgeEnabled: false,
  nudgeIntervalMin: 30,
  notifyCommanderChange: true,
  notifyHrChange: true,
  weeklyReminderEnabled: false,
  weeklyReminderDay: 6,
  weeklyReminderTime: '20:00',
  templateOnboarded: false,
};
// 2026-09-23 06:00 Israel (UTC+3 in September) — before the 08:00 reminder.
const EARLY = Date.parse('2026-09-23T03:00:00Z');
const hhmm = (at: number) =>
  new Date(at).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
  });

const plan = (s: Partial<Settings>, opts: { reported?: string[]; now?: number } = {}) =>
  planReminders({
    settings: { ...base, ...s },
    today: '2026-09-23',
    reported: new Set(opts.reported ?? []),
    now: opts.now ?? EARLY,
  });

describe('planReminders', () => {
  test('weekly reminder on its day (Sat 2026-09-26 20:00), even when that day is reported', () => {
    const p = plan({ weeklyReminderEnabled: true }, { reported: ['2026-09-26'] });
    const sat = p.filter((r) => r.date === '2026-09-26');
    expect(sat.map((r) => `${r.kind} ${hhmm(r.at)}`)).toEqual(['weekly 20:00']);
  });

  test('weekly day keeps the morning reminder when unreported', () => {
    const p = plan({ weeklyReminderEnabled: true }).filter((r) => r.date === '2026-09-26');
    expect(p.map((r) => `${r.kind} ${hhmm(r.at)}`)).toEqual(['reminder 08:00', 'weekly 20:00']);
  });

  test('weekly reminder off → daily reminder on Saturday as usual', () => {
    const p = plan({}).filter((r) => r.date === '2026-09-26');
    expect(p.map((r) => r.kind)).toEqual(['reminder']);
  });

  test('one reminder per day, today … +7, at the Israeli time', () => {
    const p = plan({});
    expect(p).toHaveLength(8);
    expect(p[0]).toMatchObject({ kind: 'reminder', date: '2026-09-23' });
    expect(p[0]!.at).toBe(Date.parse('2026-09-23T05:00:00Z'));
    expect(p.at(-1)!.date).toBe('2026-09-30');
  });

  test('reported days get nothing — reporting cancels the day', () => {
    const p = plan({ nudgeEnabled: true }, { reported: ['2026-09-23', '2026-09-25'] });
    const days = new Set(p.map((r) => r.date));
    expect(days.has('2026-09-23')).toBe(false);
    expect(days.has('2026-09-25')).toBe(false);
    expect(days.has('2026-09-24')).toBe(true);
  });

  test('nudges repeat every interval after the reminder, stopping before 11:00', () => {
    const today = plan({ nudgeEnabled: true }).filter((r) => r.date === '2026-09-23');
    expect(today.map((r) => `${r.kind} ${hhmm(r.at)}`)).toEqual([
      'reminder 08:00',
      'nudge 08:30',
      'nudge 09:00',
      'nudge 09:30',
      'nudge 10:00',
      'nudge 10:30',
    ]);
  });

  test('nudge alone starts at the reminder time', () => {
    const today = plan({ reminderEnabled: false, nudgeEnabled: true, nudgeIntervalMin: 60 }).filter(
      (r) => r.date === '2026-09-23',
    );
    expect(today.map((r) => hhmm(r.at))).toEqual(['08:00', '09:00', '10:00']);
  });

  test('no nudges when the reminder time is at or after the deadline', () => {
    const p = plan({ reminderTime: '11:30', nudgeEnabled: true });
    expect(p.every((r) => r.kind === 'reminder')).toBe(true);
  });

  test('past instants are dropped (it is 09:10 now)', () => {
    const now = Date.parse('2026-09-23T06:10:00Z');
    const today = plan({ nudgeEnabled: true }, { now }).filter((r) => r.date === '2026-09-23');
    expect(today.map((r) => hhmm(r.at))).toEqual(['09:30', '10:00', '10:30']);
  });

  test('both off → nothing', () => {
    expect(plan({ reminderEnabled: false })).toEqual([]);
  });

  test('capped under the iOS limit, soonest first, unique ids', () => {
    const p = plan({ nudgeEnabled: true, nudgeIntervalMin: 15, reminderTime: '05:00' });
    expect(p).toHaveLength(MAX_SCHEDULED);
    expect(p.map((r) => r.at)).toEqual([...p.map((r) => r.at)].sort((a, b) => a - b));
    expect(new Set(p.map((r) => r.id)).size).toBe(p.length);
  });
});
