import { eq, inArray } from 'drizzle-orm';
import {
  DEFAULT_NUDGE_INTERVAL_MIN,
  DEFAULT_REMINDER_TIME,
  DEFAULT_WEEK_TEMPLATE_CODES,
  DEFAULT_WEEKLY_REMINDER_DAY,
  DEFAULT_WEEKLY_REMINDER_TIME,
  weekTemplateSchema,
  type PutSettingsBody,
  type PutWeekTemplateBody,
  type Settings,
  type WeekTemplate,
} from '@doch1/shared';
import { db } from '../../db/client';
import { statusReasons, userSettings, userWeekTemplate } from '../../db/schema';
import { ApiError } from '../../plugins/errors';

// Self-only: `userId` is always request.user.id (SECURITY.md §4).

// A user without a row yet sees the SPEC F6 defaults; the row is created on the first PUT.
const DEFAULTS: Settings = {
  reminderEnabled: false,
  reminderTime: DEFAULT_REMINDER_TIME,
  nudgeEnabled: false,
  nudgeIntervalMin: DEFAULT_NUDGE_INTERVAL_MIN,
  notifyCommanderChange: true,
  notifyHrChange: true,
  weeklyReminderEnabled: false,
  weeklyReminderDay: DEFAULT_WEEKLY_REMINDER_DAY,
  weeklyReminderTime: DEFAULT_WEEKLY_REMINDER_TIME,
  templateOnboarded: false,
};

const columns = {
  reminderEnabled: userSettings.reminderEnabled,
  reminderTime: userSettings.reminderTime,
  nudgeEnabled: userSettings.nudgeEnabled,
  nudgeIntervalMin: userSettings.nudgeIntervalMin,
  notifyCommanderChange: userSettings.notifyCommanderChange,
  notifyHrChange: userSettings.notifyHrChange,
  weeklyReminderEnabled: userSettings.weeklyReminderEnabled,
  weeklyReminderDay: userSettings.weeklyReminderDay,
  weeklyReminderTime: userSettings.weeklyReminderTime,
  templateOnboarded: userSettings.templateOnboarded,
};

type Row = { [K in keyof typeof columns]: (typeof columns)[K]['_']['data'] };

const toSettings = (r: Row): Settings => ({
  ...r,
  reminderTime: r.reminderTime.slice(0, 5), // Postgres time "08:00:00" → contract "08:00"
  weeklyReminderTime: r.weeklyReminderTime.slice(0, 5),
  nudgeIntervalMin: r.nudgeIntervalMin as Settings['nudgeIntervalMin'], // DB check: 15/30/60
});

export async function getSettings(userId: string): Promise<Settings> {
  const [row] = await db.select(columns).from(userSettings).where(eq(userSettings.userId, userId));
  return row ? toSettings(row) : DEFAULTS;
}

/** Partial update: only the fields sent change. Creates the row on first use. */
export async function putSettings(userId: string, body: PutSettingsBody): Promise<Settings> {
  // Picked one by one — the request body is never spread into the DB (SECURITY.md §2).
  const changes: Partial<Settings> = {};
  if (body.reminderEnabled !== undefined) changes.reminderEnabled = body.reminderEnabled;
  if (body.reminderTime !== undefined) changes.reminderTime = body.reminderTime;
  if (body.nudgeEnabled !== undefined) changes.nudgeEnabled = body.nudgeEnabled;
  if (body.nudgeIntervalMin !== undefined) changes.nudgeIntervalMin = body.nudgeIntervalMin;
  if (body.notifyCommanderChange !== undefined)
    changes.notifyCommanderChange = body.notifyCommanderChange;
  if (body.notifyHrChange !== undefined) changes.notifyHrChange = body.notifyHrChange;
  if (body.weeklyReminderEnabled !== undefined)
    changes.weeklyReminderEnabled = body.weeklyReminderEnabled;
  if (body.weeklyReminderDay !== undefined) changes.weeklyReminderDay = body.weeklyReminderDay;
  if (body.weeklyReminderTime !== undefined) changes.weeklyReminderTime = body.weeklyReminderTime;
  if (body.templateOnboarded !== undefined) changes.templateOnboarded = body.templateOnboarded;

  const [row] = await db
    .insert(userSettings)
    .values({ ...DEFAULTS, ...changes, userId })
    .onConflictDoUpdate({ target: userSettings.userId, set: changes })
    .returning(columns);
  return toSettings(row!);
}

// ---------- weekly template (DESIGN §7.8) ----------

/** No saved template → the default week, resolved from reason codes to ids. */
async function defaultTemplate(): Promise<WeekTemplate> {
  const codes = DEFAULT_WEEK_TEMPLATE_CODES.filter((c): c is string => c !== null);
  const rows = await db
    .select({ id: statusReasons.id, code: statusReasons.code })
    .from(statusReasons)
    .where(inArray(statusReasons.code, codes));
  const idByCode = new Map(rows.map((r) => [r.code, r.id]));
  return {
    days: DEFAULT_WEEK_TEMPLATE_CODES.map((code) => {
      const id = code ? idByCode.get(code) : undefined;
      return id ? { reasonId: id } : null;
    }),
  };
}

export async function getTemplate(userId: string): Promise<WeekTemplate> {
  const [row] = await db
    .select({ days: userWeekTemplate.days })
    .from(userWeekTemplate)
    .where(eq(userWeekTemplate.userId, userId));
  if (!row) return defaultTemplate();
  const parsed = weekTemplateSchema.safeParse({ days: row.days });
  return parsed.success ? parsed.data : defaultTemplate();
}

/** Full replace. Every reason must exist, be selectable by the user (not commander-only) and need no document. */
export async function putTemplate(userId: string, body: PutWeekTemplateBody): Promise<WeekTemplate> {
  // Rebuilt field by field — never store the raw body (SECURITY.md §2).
  const days = body.days.map((d) => (d ? { reasonId: d.reasonId } : null));
  const ids = [...new Set(days.flatMap((d) => (d ? [d.reasonId] : [])))];
  if (ids.length > 0) {
    const rows = await db
      .select({
        id: statusReasons.id,
        commanderOnly: statusReasons.commanderOnly,
        requiresDocument: statusReasons.requiresDocument,
      })
      .from(statusReasons)
      .where(inArray(statusReasons.id, ids));
    if (rows.length !== ids.length) throw new ApiError('VALIDATION_ERROR');
    // Applying a template can't attach a document, so those reasons can't be template days.
    if (rows.some((r) => r.commanderOnly || r.requiresDocument))
      throw new ApiError('REASON_NOT_ALLOWED');
  }
  await db
    .insert(userWeekTemplate)
    .values({ userId, days })
    .onConflictDoUpdate({ target: userWeekTemplate.userId, set: { days } });
  return { days };
}
