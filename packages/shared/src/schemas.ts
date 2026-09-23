// Frozen contract (A0.2). Changes only via a CONTRACT-CHANGE issue (TASKS.md §5).
import { z } from 'zod';
import {
  BULK_MAX,
  CPR_MAX_DAYS,
  INTEGRATION_SOLDIERS_LIMIT,
  CATEGORY_CODES,
  EMERGENCY_MESSAGE_MAX,
  EMERGENCY_RESPONSE_STATUSES,
  ERROR_CODES,
  GROUP_REPORT_SORTS,
  HISTORY_MAX_RANGE_DAYS,
  INTEGRATION_SYSTEMS,
  NOT_REPORTED_FILTER,
  NOTE_MAX,
  NUDGE_INTERVALS_MIN,
  NFC_PRESENCE_RESULTS,
  NFC_SCAN_RESULTS,
  PUSH_PLATFORMS,
  PUSH_TOKEN_MAX,
  REPORT_SOURCES,
  SEARCH_MAX,
  USER_ROLES,
} from './constants';

// ---------- primitives ----------

// z.guid(), not z.uuid(): Zod 4's uuid() enforces RFC version bits and rejects the seeded ids
// (00000000-0000-0000-0000-000000000001). guid() still enforces the 8-4-4-4-12 hex format.
export const idSchema = z.guid();
export const isoDateSchema = z.iso.date();
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const timeHHMMSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const reasonIdSchema = z.number().int().positive();
export const noteSchema = z.string().trim().min(1).max(NOTE_MAX);
export const categoryCodeSchema = z.enum(CATEGORY_CODES);
export const reportSourceSchema = z.enum(REPORT_SOURCES);
export const emergencyResponseStatusSchema = z.enum(EMERGENCY_RESPONSE_STATUSES);

export const errorResponseSchema = z.object({
  error: z.object({ code: z.enum(ERROR_CODES), message: z.string() }),
});

export const personRefSchema = z.object({
  id: idSchema,
  firstName: z.string(),
  lastName: z.string(),
});

// ---------- shared shapes ----------

// Reason is embedded (not just reasonId) because /statuses hides commander-only reasons from
// soldiers, yet a commander may set one on the soldier's report.
export const reportSchema = z.object({
  id: idSchema,
  userId: idSchema,
  date: isoDateSchema,
  reason: z.object({
    id: reasonIdSchema,
    code: z.string(),
    nameHe: z.string(),
    categoryCode: categoryCodeSchema,
  }),
  note: z.string().nullable(),
  documentId: idSchema.nullable(),
  source: reportSourceSchema,
  reportedBy: personRefSchema,
  lastModifiedBy: personRefSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  approvedBy: personRefSchema.nullable(),
  approvedAt: isoDateTimeSchema.nullable(),
  finalizedBy: personRefSchema.nullable(),
  finalizedAt: isoDateTimeSchema.nullable(),
});

type GroupNodeShape = {
  id: string;
  name: string;
  code: string;
  children: GroupNodeShape[];
};
export const groupNodeSchema: z.ZodType<GroupNodeShape> = z.object({
  id: idSchema,
  name: z.string(),
  code: z.string(),
  get children() {
    return z.array(groupNodeSchema);
  },
});

// ---------- soldier routes ----------

// GET /me
export const meResponseSchema = z.object({
  user: personRefSchema.extend({ role: z.enum(USER_ROLES) }),
  isCommander: z.boolean(),
  group: z.object({ id: idSchema, name: z.string() }).nullable(),
});

// GET /statuses
export const statusesResponseSchema = z.object({
  categories: z.array(
    z.object({
      id: z.number().int().positive(),
      code: categoryCodeSchema,
      nameHe: z.string(),
      icon: z.string(),
      reasons: z.array(
        z.object({
          id: reasonIdSchema,
          code: z.string(),
          nameHe: z.string(),
          requiresDocument: z.boolean(),
          allowsNote: z.boolean(),
          commanderOnly: z.boolean(),
        }),
      ),
    }),
  ),
});

// GET /reports/today — serverTime lets the client correct clock skew for the countdown.
export const todayReportResponseSchema = z.object({
  date: isoDateSchema,
  serverTime: isoDateTimeSchema,
  deadline: isoDateTimeSchema,
  isLate: z.boolean(),
  editLockAt: isoDateTimeSchema,
  report: reportSchema.nullable(),
});

// GET /reports?from=&to=
export const reportsQuerySchema = z
  .strictObject({ from: isoDateSchema, to: isoDateSchema })
  .refine(({ from, to }) => from <= to, { message: 'from must be <= to', path: ['to'] })
  .refine(
    ({ from, to }) => (Date.parse(to) - Date.parse(from)) / 86_400_000 < HISTORY_MAX_RANGE_DAYS,
    { message: `range must be under ${HISTORY_MAX_RANGE_DAYS} days`, path: ['to'] },
  );
export const reportsResponseSchema = z.object({ reports: z.array(reportSchema) });

// PUT /reports/:date · DELETE /reports/:date (204)
export const reportDateParamsSchema = z.strictObject({ date: isoDateSchema });
export const putReportBodySchema = z.strictObject({
  reasonId: reasonIdSchema,
  note: noteSchema.optional(),
  documentId: idSchema.optional(),
});
export const putReportResponseSchema = reportSchema;

// POST /documents (multipart; file validated server-side by magic bytes + size)
export const uploadDocumentResponseSchema = z.object({ documentId: idSchema });

// GET /settings · PUT /settings (partial update)
export const settingsSchema = z.object({
  reminderEnabled: z.boolean(),
  reminderTime: timeHHMMSchema,
  nudgeEnabled: z.boolean(),
  nudgeIntervalMin: z.literal(NUDGE_INTERVALS_MIN),
  notifyCommanderChange: z.boolean(),
  notifyHrChange: z.boolean(),
  // Weekly "fill next week" reminder (DESIGN §7.4). Day: 0 = Sunday … 6 = Saturday.
  weeklyReminderEnabled: z.boolean(),
  weeklyReminderDay: z.number().int().min(0).max(6),
  weeklyReminderTime: timeHHMMSchema,
  // True once the user saved or dismissed the weekly-template setup card (DESIGN §7.8).
  templateOnboarded: z.boolean(),
});
export const putSettingsBodySchema = settingsSchema
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'at least one field required' });

// GET /settings/template · PUT /settings/template (full replace) — DESIGN §7.8.
// days[0] = Sunday … days[6] = Saturday; null = no default for that weekday.
// The template only pre-fills reports on the client (one PUT /reports/:date per day).
export const templateEntrySchema = z.strictObject({ reasonId: reasonIdSchema });
export const weekTemplateSchema = z.strictObject({
  days: z.array(templateEntrySchema.nullable()).length(7),
});
export const putWeekTemplateBodySchema = weekTemplateSchema;

// POST /push-tokens (204)
export const pushTokenBodySchema = z.strictObject({
  token: z.string().min(1).max(PUSH_TOKEN_MAX),
  platform: z.enum(PUSH_PLATFORMS),
});

// GET /emergencies/active
export const activeEmergenciesResponseSchema = z.object({
  events: z.array(
    z.object({
      id: idSchema,
      groupName: z.string(),
      message: z.string().nullable(),
      startedAt: isoDateTimeSchema,
      myResponse: emergencyResponseStatusSchema.nullable(),
    }),
  ),
});

// POST /emergencies/:id/respond (204)
export const idParamsSchema = z.strictObject({ id: idSchema });
export const respondEmergencyBodySchema = z.strictObject({
  status: emergencyResponseStatusSchema,
});

// ---------- commander / HR routes ----------

// GET /commander/groups
export const commanderGroupsResponseSchema = z.object({ groups: z.array(groupNodeSchema) });

// GET /commander/groups/:groupId/reports?date=&includeSub=&pending=&q=&category=&sort=
export const groupIdParamsSchema = z.strictObject({ groupId: idSchema });
export const groupReportsQuerySchema = z.strictObject({
  date: isoDateSchema.optional(),
  includeSub: z.stringbool().default(false),
  pending: z.stringbool().default(false),
  q: z.string().trim().max(SEARCH_MAX).optional(),
  category: z.union([categoryCodeSchema, z.literal(NOT_REPORTED_FILTER)]).optional(),
  sort: z.enum(GROUP_REPORT_SORTS).default('name'),
});
export const groupReportsResponseSchema = z.object({
  date: isoDateSchema,
  counts: z.object({
    total: z.number().int().nonnegative(),
    present: z.number().int().nonnegative(),
    away: z.number().int().nonnegative(),
    notReported: z.number().int().nonnegative(),
    pendingApproval: z.number().int().nonnegative(),
  }),
  openEmergencyId: idSchema.nullable(),
  rows: z.array(
    z.object({
      soldier: personRefSchema.extend({ groupId: idSchema, groupName: z.string() }),
      isFavorite: z.boolean(),
      report: reportSchema.nullable(),
    }),
  ),
});

// POST /commander/reports/approve · POST /hr/reports/finalize — all-or-nothing
export const reportIdsBodySchema = z.strictObject({
  reportIds: z.array(idSchema).min(1).max(BULK_MAX),
});
export const approveReportsResponseSchema = z.object({ approvedCount: z.number().int() });
export const finalizeReportsResponseSchema = z.object({ finalizedCount: z.number().int() });

// PUT /commander/soldiers/:userId/reports/:date
export const soldierReportParamsSchema = z.strictObject({
  userId: idSchema,
  date: isoDateSchema,
});
export const commanderPutReportBodySchema = z.strictObject({
  reasonId: reasonIdSchema,
  note: noteSchema.optional(),
});

// GET /commander/documents/:documentId/url
export const documentIdParamsSchema = z.strictObject({ documentId: idSchema });
export const documentUrlResponseSchema = z.object({
  url: z.url(),
  expiresAt: isoDateTimeSchema,
});

// PUT · DELETE /commander/favorites/:soldierId (204)
export const soldierIdParamsSchema = z.strictObject({ soldierId: idSchema });

// POST /commander/emergencies
export const startEmergencyBodySchema = z.strictObject({
  groupId: idSchema,
  includeSub: z.boolean().default(true),
  message: z.string().trim().min(1).max(EMERGENCY_MESSAGE_MAX).optional(),
});
export const startEmergencyResponseSchema = z.object({ id: idSchema });

// GET /commander/emergencies/:id · POST /commander/emergencies/:id/end (204)
export const emergencyDetailResponseSchema = z.object({
  id: idSchema,
  group: z.object({ id: idSchema, name: z.string() }),
  includeSub: z.boolean(),
  message: z.string().nullable(),
  startedBy: personRefSchema,
  startedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema.nullable(),
  counts: z.object({
    ok: z.number().int().nonnegative(),
    needHelp: z.number().int().nonnegative(),
    noResponse: z.number().int().nonnegative(),
  }),
  responses: z.array(
    z.object({
      soldier: personRefSchema,
      status: emergencyResponseStatusSchema.nullable(),
      respondedAt: isoDateTimeSchema.nullable(),
    }),
  ),
});

// DELETE /hr/reports/:reportId/finalize (204)
export const reportIdParamsSchema = z.strictObject({ reportId: idSchema });

// ---------- I1: integrations (external systems → Doch1; auth = X-Integration-Key, SPEC F11/F12) ----------

// Real HR systems identify a soldier by personal number, never by our internal id.
export const personalNumberSchema = z.string().regex(/^[0-9]{7,9}$/);
export const integrationSystemSchema = z.enum(INTEGRATION_SYSTEMS);

// GET /integrations/soldiers?q=&limit= — picker for the fake systems (active soldiers only)
export const integrationSoldiersQuerySchema = z.strictObject({
  q: z.string().trim().max(SEARCH_MAX).optional(),
  limit: z.coerce.number().int().min(1).max(INTEGRATION_SOLDIERS_LIMIT).default(INTEGRATION_SOLDIERS_LIMIT),
});
export const integrationSoldierSchema = z.object({
  personalNumber: personalNumberSchema,
  firstName: z.string(),
  lastName: z.string(),
  groupName: z.string().nullable(),
});
export const integrationSoldiersResponseSchema = z.object({
  soldiers: z.array(integrationSoldierSchema),
});

// POST /integrations/cpr/sick-leave — N gimelim issued on issueDate → reports issueDate+1 … +N
export const cprSickLeaveBodySchema = z.strictObject({
  personalNumber: personalNumberSchema,
  issueDate: isoDateSchema,
  days: z.number().int().min(1).max(CPR_MAX_DAYS),
});

// POST /integrations/people-digital/annual-leave — startDate … endDate, both inclusive
export const annualLeaveBodySchema = z
  .strictObject({
    personalNumber: personalNumberSchema,
    startDate: isoDateSchema,
    endDate: isoDateSchema,
  })
  .refine((b) => b.endDate >= b.startDate, { path: ['endDate'] });

export const integrationResultSchema = z.object({
  personalNumber: personalNumberSchema,
  reasonCode: z.string(),
  dates: z.array(isoDateSchema),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
});

// ---------- NFC speedgate ----------

export const calypsoSerialSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,9})$/)
  .refine((value) => BigInt(value) <= 4_294_967_295n, { message: 'invalid Calypso serial' });
export const baseCodeSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,49}$/);

// HR-only: bind a public Calypso application serial to the user selected by personal number.
export const enrollNfcCardBodySchema = z.strictObject({
  personalNumber: personalNumberSchema,
  calypsoSerial: calypsoSerialSchema,
});
export const revokeNfcCardBodySchema = z.strictObject({ personalNumber: personalNumberSchema });
export const nfcCardEnrollmentResponseSchema = z.object({
  userId: idSchema,
  serialLast4: z.string().regex(/^[0-9]{1,4}$/),
  enrolledAt: isoDateTimeSchema,
});

// HR-only provisioning. The reader token is returned once and stored in Android Keystore.
export const createNfcReaderBodySchema = z.strictObject({
  baseCode: baseCodeSchema,
  name: z.string().trim().min(1).max(80),
});
export const createNfcReaderResponseSchema = z.object({
  readerId: idSchema,
  readerToken: z.string().min(40),
  base: z.object({ id: idSchema, code: baseCodeSchema, name: z.string() }),
});

// Reader-authenticated route. requestId makes network retries idempotent.
export const speedgateScanBodySchema = z.strictObject({
  calypsoSerial: calypsoSerialSchema,
  requestId: idSchema,
});
export const speedgateScanResponseSchema = z.object({
  result: z.enum(NFC_SCAN_RESULTS),
  scannedAt: isoDateTimeSchema,
  base: z.object({ id: idSchema, code: baseCodeSchema, name: z.string() }),
  soldier: personRefSchema.nullable(),
  present: z.boolean(),
  visit: z
    .object({
      id: idSchema,
      enteredAt: isoDateTimeSchema,
      exitedAt: isoDateTimeSchema.nullable(),
    })
    .nullable(),
  reportDays: z.array(
    z.object({ date: isoDateSchema, result: z.enum(NFC_PRESENCE_RESULTS) }),
  ),
});
