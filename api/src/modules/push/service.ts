import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { pushTokens, userSettings, users } from '../../db/schema';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100; // Expo accepts at most 100 messages per request.

/**
 * Push text never carries personal data — no name, reason or diagnosis (SECURITY.md §12).
 * The payload only says that something happened; the app fetches the details over the API.
 */
export const PUSH = {
  emergency: {
    title: 'מצב חירום',
    body: 'דווח/י מיד על מצבך',
  },
  reportChanged: {
    title: 'דוח 1',
    body: 'יש עדכון בדיווח שלך',
  },
} as const;

type Notification = { title: string; body: string };

export async function registerPushToken(
  userId: string,
  token: string,
  platform: string,
): Promise<void> {
  await db
    .insert(pushTokens)
    .values({ userId, token, platform })
    // Tokens are unique per device, and a device can change hands.
    .onConflictDoUpdate({ target: pushTokens.token, set: { userId, platform } });
}

/**
 * Best-effort delivery. A push failure must never fail the request that triggered it — an
 * emergency is started even if Expo is unreachable.
 */
export async function sendToUsers(
  userIds: string[],
  notification: Notification,
  data: Record<string, string> = {},
): Promise<number> {
  if (userIds.length === 0) return 0;
  const rows = await db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(inArray(pushTokens.userId, userIds));
  const tokens = rows.map((r) => r.token);
  if (tokens.length === 0) return 0;

  for (let i = 0; i < tokens.length; i += BATCH) {
    const messages = tokens.slice(i, i + BATCH).map((to) => ({ to, ...notification, data }));
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages),
    });
  }
  return tokens.length;
}

/** Everyone the roll-call covers, except the commander who just pressed the button. */
export async function notifyEmergencyStarted(
  eventId: string,
  groupId: string,
  includeSub: boolean,
  startedBy: string,
): Promise<void> {
  const scope =
    includeSub ? sql`(select id from group_subtree(${groupId}) as id)` : sql`(${groupId}::uuid)`;
  const recipients = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`${users.groupId} in ${scope}`, eq(users.isActive, true), ne(users.id, startedBy)));

  await sendToUsers(
    recipients.map((r) => r.id),
    PUSH.emergency,
    { type: 'emergency', eventId },
  );
}

/**
 * The soldier whose report a commander or HR changed, if they still want to hear about it —
 * the two toggles are separate (SPEC F6).
 */
export async function notifyReportChanged(
  soldierId: string,
  source: 'commander' | 'hr',
): Promise<void> {
  const column =
    source === 'hr' ? userSettings.notifyHrChange : userSettings.notifyCommanderChange;
  const [wants] = await db
    .select({ id: userSettings.userId })
    .from(userSettings)
    .where(and(eq(userSettings.userId, soldierId), eq(column, true)));
  if (!wants) return;

  await sendToUsers([soldierId], PUSH.reportChanged, { type: 'report_changed' });
}
