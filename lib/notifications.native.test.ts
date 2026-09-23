import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { PlannedReminder } from './reminders';

// expo-notifications / react-native can't load under vitest — fake the parts the module uses.
const n = vi.hoisted(() => {
  const scheduled = new Map<string, unknown>();
  return {
    scheduled,
    perm: { granted: true, canAskAgain: true },
    requestGranted: true,
    requests: 0,
    api: {
      setNotificationHandler: () => {},
      getPermissionsAsync: async () => ({ ...n.perm }),
      requestPermissionsAsync: async () => {
        n.requests++;
        return { granted: n.requestGranted };
      },
      setNotificationChannelAsync: async () => null,
      getAllScheduledNotificationsAsync: async () =>
        [...scheduled.keys()].map((identifier) => ({ identifier })),
      cancelScheduledNotificationAsync: async (id: string) => void scheduled.delete(id),
      scheduleNotificationAsync: async (req: { identifier: string }) => {
        scheduled.set(req.identifier, req);
        return req.identifier;
      },
      AndroidImportance: { HIGH: 4 },
      SchedulableTriggerInputTypes: { DATE: 'date' },
    },
  };
});
vi.mock('expo-notifications', () => n.api);
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const { syncReminders, clearReminders } = await import('./notifications.native');

const r = (id: string, at: number): PlannedReminder => ({
  id: `doch1-reminder-${id}`,
  kind: 'reminder',
  date: '2026-09-23',
  at,
});

beforeEach(async () => {
  await clearReminders();
  n.scheduled.clear();
  n.perm = { granted: true, canAskAgain: true };
  n.requestGranted = true;
  n.requests = 0;
});

describe('syncReminders', () => {
  test('schedules the plan on the phone clock, leaving other apps’ ids alone', async () => {
    n.scheduled.set('someone-else', {});
    await syncReminders([r('a', 10_000)], 3_000);
    const req = n.scheduled.get('doch1-reminder-a') as { trigger: { date: number } };
    expect(req.trigger.date).toBe(7_000);
    expect(n.scheduled.has('someone-else')).toBe(true);
  });

  test('a new plan replaces the old one (reported day → its reminders are gone)', async () => {
    await syncReminders([r('a', 1), r('b', 2)]);
    await syncReminders([r('b', 2)]);
    expect([...n.scheduled.keys()]).toEqual(['doch1-reminder-b']);
  });

  test('an unchanged plan does not touch the OS', async () => {
    await syncReminders([r('a', 1)]);
    n.scheduled.clear();
    await syncReminders([r('a', 1)]);
    expect(n.scheduled.size).toBe(0);
  });

  test('empty plan cancels without asking for permission', async () => {
    n.perm = { granted: false, canAskAgain: true };
    await syncReminders([]);
    expect(n.requests).toBe(0);
  });

  test('permission denied → nothing scheduled', async () => {
    n.perm = { granted: false, canAskAgain: true };
    n.requestGranted = false;
    await syncReminders([r('a', 1)]);
    expect(n.requests).toBe(1);
    expect(n.scheduled.size).toBe(0);
  });

  test('sign-out clears everything and the same plan schedules again afterwards', async () => {
    await syncReminders([r('a', 1)]);
    await clearReminders();
    expect(n.scheduled.size).toBe(0);
    await syncReminders([r('a', 1)]);
    expect(n.scheduled.size).toBe(1);
  });
});
