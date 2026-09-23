// F6 local reminders on iOS/Android via expo-notifications. Web has no local notifications —
// see notifications.ts. The plan comes from lib/reminders (pure, tested).
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { reminders as t, weeklyReminder } from '../i18n/he';
import { ID_PREFIX, type PlannedReminder } from './reminders';

export const remindersSupported = true;

const CHANNEL = 'reminders';

// Show a reminder even when the app is open (e.g. sitting on another screen).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Ask once (the OS remembers a "no"). True when we may show notifications. */
export async function ensureReminderPermission(): Promise<boolean> {
  const now = await Notifications.getPermissionsAsync();
  if (now.granted) return true;
  if (!now.canAskAgain) return false;
  if (Platform.OS === 'android') await ensureChannel(); // Android shows the prompt only with a channel
  return (await Notifications.requestPermissionsAsync()).granted;
}

let channelReady = false;
async function ensureChannel() {
  if (Platform.OS !== 'android' || channelReady) return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: t.channel,
    importance: Notifications.AndroidImportance.HIGH,
  });
  channelReady = true;
}

/** Remove every notification this app scheduled (sign-out, everything reported, both off). */
async function cancelReminders() {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => n.identifier.startsWith(ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

let queue: Promise<unknown> = Promise.resolve();
let lastKey: string | null = null;

/**
 * Make the scheduled set exactly `plan`. `clockOffsetMs` = server − phone clock: the plan is in
 * server time, the OS fires on the phone's clock. Calls run one at a time; an unchanged plan is
 * a no-op.
 */
export function syncReminders(plan: PlannedReminder[], clockOffsetMs = 0): Promise<void> {
  const key = plan.map((r) => r.id).join('|');
  const run = async () => {
    if (key === lastKey) return;
    await cancelReminders();
    lastKey = '';
    if (plan.length === 0 || !(await ensureReminderPermission())) return;
    await ensureChannel();
    for (const r of plan) {
      await Notifications.scheduleNotificationAsync({
        identifier: r.id,
        // No personal data in the text (SECURITY.md) — it shows on a locked screen.
        content: {
          title:
            r.kind === 'weekly'
              ? weeklyReminder.title
              : r.kind === 'reminder'
                ? t.reminderTitle
                : t.nudgeTitle,
          body: r.kind === 'weekly' ? weeklyReminder.body : t.body,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: r.at - clockOffsetMs,
          channelId: CHANNEL,
        },
      });
    }
    lastKey = key;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {
    lastKey = null; // retry on the next sync
  });
  return next;
}

/** Sign-out: nothing may fire for the next person on this phone. */
export function clearReminders(): Promise<void> {
  const run = async () => {
    lastKey = null;
    await cancelReminders();
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}
