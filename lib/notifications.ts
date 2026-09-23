// Web: no local notifications (expo-notifications is iOS/Android only), so reminders are a no-op
// and the settings screen says they work in the phone app. Native: notifications.native.ts.
import type { PlannedReminder } from './reminders';

export const remindersSupported = false;

export async function ensureReminderPermission(): Promise<boolean> {
  return false;
}

export const syncReminders: (
  plan: PlannedReminder[],
  clockOffsetMs?: number,
) => Promise<void> = async () => {};

export async function clearReminders(): Promise<void> {}
