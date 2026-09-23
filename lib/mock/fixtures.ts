// In-memory mirror of db/init.sql (same ids, names, and the same deterministic 30-day formula),
// so screens look the same before and after the sync point. Fictional data only.
import {
  DEFAULT_WEEK_TEMPLATE_CODES,
  DEFAULT_WEEKLY_REMINDER_DAY,
  DEFAULT_WEEKLY_REMINDER_TIME,
  type CategoryCode,
  type EmergencyResponseStatus,
  type ReasonCode,
  type ReportSource,
  type WeekTemplate,
} from '@doch1/shared';
import { addDays, atIL, todayIL } from './time';

export type MockUser = {
  id: string;
  personalNumber: string;
  firstName: string;
  lastName: string;
  role: 'soldier' | 'admin';
  groupId: string | null;
  isActive: boolean;
};
export type MockGroup = {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  commanderId: string | null;
};
export type MockReason = {
  id: number;
  categoryCode: CategoryCode;
  code: ReasonCode;
  nameHe: string;
  requiresDocument: boolean;
  allowsNote: boolean;
  commanderOnly: boolean;
};
export type ReportRow = {
  id: string;
  userId: string;
  date: string;
  reasonId: number;
  note: string | null;
  documentId: string | null;
  source: ReportSource;
  reportedBy: string;
  lastModifiedBy: string;
  createdAt: string;
  updatedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  finalizedBy: string | null;
  finalizedAt: string | null;
};
export type EmergencyRow = {
  id: string;
  groupId: string;
  includeSub: boolean;
  startedBy: string;
  message: string | null;
  startedAt: string;
  endedAt: string | null;
  endedBy: string | null;
  responses: Map<string, { status: EmergencyResponseStatus; respondedAt: string }>;
};

// ponytail: Math.random ids — fine for a mock (Hermes has no crypto.randomUUID).
export const newId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

const uid = (n: string) => `00000000-0000-0000-0000-${n.padStart(12, '0')}`;
export const U = {
  battalionCmd: uid('1'),
  companyCmd: uid('2'),
  team1Cmd: uid('3'),
  team2Cmd: uid('4'),
  hrBattalion: uid('98'),
  hrTeam2: uid('99'),
};
const G = { battalion: uid('a001'), company: uid('a002'), team1: uid('a003'), team2: uid('a004') };
const DOC_1 = uid('d0001');
const EMERGENCY_1 = uid('e0001');

export const CATEGORIES: { id: number; code: CategoryCode; nameHe: string; icon: string }[] = [
  { id: 1, code: 'on_base', nameHe: 'נמצא/ת ביחידה', icon: 'flag' },
  { id: 2, code: 'outside_unit', nameHe: 'מחוץ ליחידה', icon: 'map-pin' },
  { id: 3, code: 'annual_leave', nameHe: 'חופשה שנתית', icon: 'sun' },
  { id: 4, code: 'abroad', nameHe: 'חו"ל', icon: 'plane' },
  { id: 5, code: 'sick_leave', nameHe: 'חופשת מחלה', icon: 'pill' },
];

// [category, code, nameHe, requiresDocument, allowsNote, commanderOnly]
const REASON_ROWS: [CategoryCode, ReasonCode, string, boolean, boolean, boolean][] = [
  ['on_base', 'present', 'נוכח/ת', false, false, false],
  ['outside_unit', 'role_outside_unit', 'בתפקיד מחוץ ליחידה', false, true, false],
  ['outside_unit', 'after_duty', 'אחרי תורנות / משמרת', false, true, false],
  ['outside_unit', 'shift_worker', 'עובד/ת משמרות', false, false, false],
  ['outside_unit', 'medical_referral', 'הפניה רפואית', false, false, false],
  ['outside_unit', 'errands_day', 'יום סידורים', false, false, false],
  ['outside_unit', 'evening_shift', 'משמרת ערב', false, false, false],
  ['outside_unit', 'security_duty', 'אבט"ש', false, false, false],
  ['outside_unit', 'line_rotation', 'סבב קו', false, false, false],
  ['outside_unit', 'training_local', 'השתלמות מקצועית בארץ', false, true, false],
  ['outside_unit', 'course', 'בקורס / בהכשרה', false, false, true],
  ['outside_unit', 'attached_other_unit', 'מסופח/ת ליחידה אחרת', false, false, true],
  ['annual_leave', 'annual_leave', 'חופשה שנתית', false, false, false],
  ['annual_leave', 'driver_leave', 'חופשת נהג/ת מבצעי', false, false, false],
  ['annual_leave', 'ethnic_holiday', 'חג עדתי', false, false, false],
  ['annual_leave', 'memorial', 'אזכרה - קרבה ראשונה', false, false, false],
  ['abroad', 'training_abroad', 'השתלמות מקצועית בחו"ל', false, true, false],
  ['abroad', 'driver_leave_abroad', 'חופשת נהג מבצעי', false, false, false],
  ['sick_leave', 'sick_gimelim', 'חופשת מחלה (גימלים)', true, false, false],
  ['sick_leave', 'sick_day_d', "יום ד'", false, false, false],
];
export const REASONS: MockReason[] = REASON_ROWS.map(
  ([categoryCode, code, nameHe, requiresDocument, allowsNote, commanderOnly], i) => ({
    id: i + 1,
    categoryCode,
    code,
    nameHe,
    requiresDocument,
    allowsNote,
    commanderOnly,
  }),
);
const reasonId = (code: ReasonCode) => REASONS.find((r) => r.code === code)!.id;

/** Default week for a user who never saved a template (same codes the API resolves). */
export const defaultWeekTemplate = (): WeekTemplate => ({
  days: DEFAULT_WEEK_TEMPLATE_CODES.map((code) => {
    const r = code ? REASONS.find((x) => x.code === code) : undefined;
    return r ? { reasonId: r.id } : null;
  }),
});

function seedUsers(): MockUser[] {
  const u = (n: string, first: string, last: string, groupId: string | null, role: MockUser['role'] = 'soldier') => ({
    id: uid(n),
    personalNumber: `90000${n.padStart(2, '0')}`,
    firstName: first,
    lastName: last,
    role,
    groupId,
    isActive: true,
  });
  return [
    u('1', 'רועי', 'אלמוג', G.battalion),
    u('2', 'מיכל', 'ברק', G.company),
    u('3', 'עידו', 'גפן', G.team1),
    u('4', 'שירה', 'דרור', G.team2),
    u('11', 'אורי', 'הדר', G.team1),
    u('12', 'נועם', 'וולך', G.team1),
    u('13', 'תמר', 'זיו', G.team1),
    u('14', 'איתי', 'חורש', G.team1),
    u('15', 'יעל', 'טל', G.team1),
    u('16', 'עומר', 'ינאי', G.team1),
    u('17', 'גאיה', 'כרמל', G.team1),
    u('18', 'אלון', 'לביא', G.team1),
    u('21', 'הילה', 'מור', G.team2),
    u('22', 'יונתן', 'נבו', G.team2),
    u('23', 'רותם', 'סער', G.team2),
    u('24', 'דניאל', 'עמית', G.team2),
    u('98', 'אורית', 'משאן', null, 'admin'),
    u('99', 'נטע', 'משאן', null, 'admin'),
  ];
}

const GROUPS: MockGroup[] = [
  { id: G.battalion, name: 'גדוד 100', code: '100', parentId: null, commanderId: U.battalionCmd },
  { id: G.company, name: 'פלוגה א', code: '100-A', parentId: G.battalion, commanderId: U.companyCmd },
  { id: G.team1, name: 'צוות 258750', code: '258750', parentId: G.company, commanderId: U.team1Cmd },
  { id: G.team2, name: 'צוות 258751', code: '258751', parentId: G.company, commanderId: U.team2Cmd },
];

export function createDb(now = new Date()) {
  const today = todayIL(now);
  const nowIso = now.toISOString();
  const minus = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const H = 3_600_000;
  const users = seedUsers();
  const groups = GROUPS.map((g) => ({ ...g }));
  const soldiers = users.filter((u) => u.role === 'soldier'); // already in personal_number order
  const reports: ReportRow[] = [];

  const add = (r: Partial<ReportRow> & Pick<ReportRow, 'userId' | 'date' | 'reasonId'>) =>
    reports.push({
      id: newId(),
      note: null,
      documentId: null,
      source: 'self',
      reportedBy: r.userId,
      lastModifiedBy: r.userId,
      createdAt: nowIso,
      updatedAt: r.createdAt ?? nowIso,
      approvedBy: null,
      approvedAt: null,
      finalizedBy: null,
      finalizedAt: null,
      ...r,
    });
  const find = (userId: string, date: string) =>
    reports.find((r) => r.userId === userId && r.date === date)!;

  // last 30 days — same formula as init.sql
  soldiers.forEach((s, i) => {
    const n = i + 1;
    const group = groups.find((g) => g.id === s.groupId)!;
    const parent = groups.find((g) => g.id === group.parentId);
    const approver = group.commanderId === s.id ? (parent?.commanderId ?? null) : group.commanderId;
    for (let k = 1; k <= 30; k++) {
      const day = addDays(today, -k);
      const code: ReasonCode =
        (n * 7 + k) % 13 === 0 ? 'annual_leave'
        : (n * 5 + k) % 17 === 0 ? 'sick_day_d'
        : (n * 3 + k) % 9 === 0 ? 'after_duty'
        : (n + k) % 19 === 0 ? 'role_outside_unit'
        : (n * 2 + k) % 23 === 0 ? 'training_abroad'
        : 'present';
      const createdAt = atIL(day, '07:15');
      add({
        userId: s.id,
        date: day,
        reasonId: reasonId(code),
        createdAt,
        updatedAt: createdAt,
        approvedBy: approver,
        approvedAt: approver ? atIL(day, '09:30') : null,
      });
    }
  });

  Object.assign(find(uid('13'), addDays(today, -3)), {
    reasonId: reasonId('sick_gimelim'),
    documentId: DOC_1,
  });
  for (const r of reports)
    if (r.reasonId === reasonId('role_outside_unit')) r.note = 'סיוע למפקדה החטיבתית';
  for (const k of [-2, -6])
    Object.assign(find(uid('11'), addDays(today, k)), {
      reasonId: reasonId('course'),
      source: 'commander',
      lastModifiedBy: U.team1Cmd,
    });
  Object.assign(find(uid('12'), addDays(today, -4)), {
    reasonId: reasonId('attached_other_unit'),
    source: 'hr',
    lastModifiedBy: U.hrBattalion,
  });

  // today: some reported (pending), 16/17/18 and 23/24 missing
  const todays: [string, ReasonCode, string | null][] = [
    ['3', 'present', null],
    ['11', 'present', null],
    ['12', 'present', null],
    ['13', 'after_duty', 'משמרת לילה במוצב'],
    ['14', 'annual_leave', null],
    ['15', 'present', null],
    ['4', 'present', null],
    ['21', 'medical_referral', null],
    ['22', 'present', null],
  ];
  for (const [n, code, note] of todays)
    add({ userId: uid(n), date: today, reasonId: reasonId(code), note, createdAt: minus(2 * H) });
  for (const n of ['11', '12'])
    Object.assign(find(uid(n), today), { approvedBy: U.team1Cmd, approvedAt: minus(H) });

  const future: [string, number, ReasonCode][] = [
    ['11', 1, 'present'],
    ['11', 2, 'present'],
    ['14', 1, 'annual_leave'],
    ['14', 2, 'annual_leave'],
    ['15', 3, 'errands_day'],
    ['21', 5, 'training_local'],
  ];
  for (const [n, plus, code] of future)
    add({ userId: uid(n), date: addDays(today, plus), reasonId: reasonId(code) });

  // lazy team-2 commander: nothing older than 14 days approved
  for (const r of reports)
    if (users.find((u) => u.id === r.userId)!.groupId === G.team2 && r.date < addDays(today, -14))
      Object.assign(r, { approvedBy: null, approvedAt: null });

  // HR finalization: older than 7 days, most specific HR (team-2 HR wins for team 2)
  for (const r of reports) {
    if (r.date >= addDays(today, -7)) continue;
    const hr = users.find((u) => u.id === r.userId)!.groupId === G.team2 ? U.hrTeam2 : U.hrBattalion;
    Object.assign(r, { finalizedBy: hr, finalizedAt: atIL(r.date, '23:00') });
  }

  const settings = new Map(
    users.map((u, i) => [
      u.id,
      {
        reminderEnabled: (i + 1) % 2 === 0,
        reminderTime: '08:00',
        nudgeEnabled: false,
        nudgeIntervalMin: 30 as 15 | 30 | 60,
        notifyCommanderChange: true,
        notifyHrChange: true,
        weeklyReminderEnabled: false,
        weeklyReminderDay: DEFAULT_WEEKLY_REMINDER_DAY,
        weeklyReminderTime: DEFAULT_WEEKLY_REMINDER_TIME,
        templateOnboarded: false,
      },
    ]),
  );
  // Saved weekly templates (DESIGN §7.8); none → defaultWeekTemplate().
  const templates = new Map<string, WeekTemplate>();

  const emergencyGroupMembers = users.filter(
    (u) => u.groupId && [G.company, G.team1, G.team2].includes(u.groupId),
  );
  const started = minus(72 * H);
  const emergencies: EmergencyRow[] = [
    {
      id: EMERGENCY_1,
      groupId: G.company,
      includeSub: true,
      startedBy: U.companyCmd,
      message: 'תרגיל - נא לדווח מצב',
      startedAt: started,
      endedAt: new Date(Date.parse(started) + 40 * 60_000).toISOString(),
      endedBy: U.companyCmd,
      responses: new Map(
        emergencyGroupMembers
          .filter((u) => !['9000018', '9000024'].includes(u.personalNumber))
          .map((u) => [
            u.id,
            {
              status: (u.personalNumber === '9000022' ? 'need_help' : 'ok') as EmergencyResponseStatus,
              respondedAt: new Date(Date.parse(started) + 5 * 60_000).toISOString(),
            },
          ]),
      ),
    },
  ];

  return {
    users,
    groups,
    hrAssignments: [
      { hrUserId: U.hrBattalion, groupId: G.battalion },
      { hrUserId: U.hrTeam2, groupId: G.team2 },
    ],
    documents: [
      { id: DOC_1, ownerId: uid('13'), mimeType: 'application/pdf', sizeBytes: 123456 },
    ],
    reports,
    settings,
    templates,
    favorites: [
      { commanderId: U.team1Cmd, soldierId: uid('13') },
      { commanderId: U.team1Cmd, soldierId: uid('16') },
    ],
    emergencies,
    pushTokens: new Map<string, { userId: string; platform: string }>(),
  };
}

export type MockDb = ReturnType<typeof createDb>;
