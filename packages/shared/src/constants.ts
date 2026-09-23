// Frozen contract (A0.2). Append-only: add new blocks at the end, never edit existing values.

// ---- time (SPEC §4) ----
export const TZ = 'Asia/Jerusalem';
export const DEADLINE_HOUR = 11;
export const EDIT_LOCK = '23:59';
export const FUTURE_WINDOW_DAYS = 7;
export const HISTORY_MAX_RANGE_DAYS = 62;

// ---- limits ----
export const NOTE_MAX = 200;
export const EMERGENCY_MESSAGE_MAX = 200;
export const BULK_MAX = 200;
export const SEARCH_MAX = 50;
export const PUSH_TOKEN_MAX = 255;
export const FILE_MAX_BYTES = 5242880;
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export const SIGNED_URL_TTL_SEC = 60;
export const EMERGENCY_POLL_MS = 5000;

// ---- settings ----
export const NUDGE_INTERVALS_MIN = [15, 30, 60] as const;
export const DEFAULT_REMINDER_TIME = '08:00';
export const DEFAULT_NUDGE_INTERVAL_MIN = 30;

// ---- status codes (seeded in db/init.sql) ----
export const CATEGORY_CODES = [
  'on_base',
  'outside_unit',
  'annual_leave',
  'abroad',
  'sick_leave',
] as const;

export const REASON_CODES = [
  'present',
  'role_outside_unit',
  'after_duty',
  'shift_worker',
  'medical_referral',
  'errands_day',
  'evening_shift',
  'security_duty',
  'line_rotation',
  'training_local',
  'course',
  'attached_other_unit',
  'annual_leave',
  'driver_leave',
  'ethnic_holiday',
  'memorial',
  'training_abroad',
  'driver_leave_abroad',
  'sick_gimelim',
  'sick_day_d',
] as const;

export const ONE_TAP_REASON_CODE = 'present';

// ---- enums mirrored from db/init.sql check constraints ----
// 'cpr' / 'people_digital': written by an external system (I1, SPEC F11/F12) — appended, not reordered.
export const REPORT_SOURCES = ['self', 'commander', 'hr', 'cpr', 'people_digital', 'nfc'] as const;
// 'nfc': written by an NFC speedgate scan (base entry/exit) — appended, not reordered.
export const EMERGENCY_RESPONSE_STATUSES = ['ok', 'need_help'] as const;
export const PUSH_PLATFORMS = ['ios', 'android', 'web'] as const;
export const USER_ROLES = ['soldier', 'admin'] as const;

// ---- commander list (F8) ----
export const GROUP_REPORT_SORTS = ['name', 'category'] as const;
export const NOT_REPORTED_FILTER = 'not_reported';

// ---- API error codes: { error: { code, message } } ----
export const ERROR_CODES = [
  'UNAUTHORIZED', // 401 missing/invalid/expired token
  'NOT_REGISTERED', // 403 Google email not in users
  'INACTIVE_USER', // 403
  'FORBIDDEN', // 403 out of scope / wrong role
  'NOT_FOUND', // 404
  'VALIDATION_ERROR', // 400 Zod failure
  'OUT_OF_WINDOW', // 422 date outside today…today+7 (or past for non-HR)
  'DAY_LOCKED', // 422 after 23:59 / past day
  'DAY_FINALIZED', // 422 HR finalized — only HR may change it
  'DOCUMENT_REQUIRED', // 422 reason requires a document
  'NOTE_NOT_ALLOWED', // 422 reason doesn't allow a note
  'REASON_NOT_ALLOWED', // 422 commander-only reason picked by a soldier
  'FILE_TOO_LARGE', // 413
  'FILE_TYPE_NOT_ALLOWED', // 415 magic bytes not jpg/png/pdf
  'EMERGENCY_ALREADY_OPEN', // 409 one open event per group
  'EMERGENCY_ENDED', // 409 responding to / ending a closed event
  'NFC_CARD_ALREADY_ENROLLED', // 409 card is already bound to another active user
  'RATE_LIMITED', // 429
  'INTERNAL', // 500
  'SOLDIER_NOT_FOUND', // 404 integrations: no active soldier with that personal number
  'INTEGRATION_OUT_OF_WINDOW', // 422 integrations: dates outside today … today+30
  'INTEGRATION_UNAUTHORIZED', // 401 integrations: missing/wrong X-Integration-Key, or another system's key
] as const;

// ---- A1: HTTP status + safe Hebrew message per error code (API and mock share these) ----
export const ERROR_HTTP: Record<(typeof ERROR_CODES)[number], { status: number; messageHe: string }> = {
  UNAUTHORIZED: { status: 401, messageHe: 'יש להתחבר מחדש' },
  NOT_REGISTERED: { status: 403, messageHe: 'המשתמש לא רשום במערכת' },
  INACTIVE_USER: { status: 403, messageHe: 'המשתמש אינו פעיל' },
  FORBIDDEN: { status: 403, messageHe: 'אין הרשאה לבצע פעולה זו' },
  NOT_FOUND: { status: 404, messageHe: 'לא נמצא' },
  VALIDATION_ERROR: { status: 400, messageHe: 'הבקשה אינה תקינה' },
  OUT_OF_WINDOW: { status: 422, messageHe: 'ניתן לדווח עד 7 ימים קדימה' },
  DAY_LOCKED: { status: 422, messageHe: 'לא ניתן לשנות דיווח ליום זה' },
  DAY_FINALIZED: { status: 422, messageHe: 'היום נסגר ע״י משא״ן ולא ניתן לשנותו' },
  DOCUMENT_REQUIRED: { status: 422, messageHe: 'יש לצרף מסמך' },
  NOTE_NOT_ALLOWED: { status: 422, messageHe: 'לא ניתן להוסיף הערה לסיבה זו' },
  REASON_NOT_ALLOWED: { status: 422, messageHe: 'סיבה זו אינה זמינה' },
  FILE_TOO_LARGE: { status: 413, messageHe: 'הקובץ גדול מ-5MB' },
  FILE_TYPE_NOT_ALLOWED: { status: 415, messageHe: 'ניתן לצרף רק JPG, PNG או PDF' },
  EMERGENCY_ALREADY_OPEN: { status: 409, messageHe: 'כבר קיים אירוע חירום פתוח לקבוצה זו' },
  EMERGENCY_ENDED: { status: 409, messageHe: 'אירוע החירום הסתיים' },
  NFC_CARD_ALREADY_ENROLLED: { status: 409, messageHe: 'הכרטיס כבר משויך למשתמש אחר' },
  RATE_LIMITED: { status: 429, messageHe: 'יותר מדי בקשות, נסו שוב בעוד רגע' },
  INTERNAL: { status: 500, messageHe: 'אירעה שגיאה, נסו שוב' },
  SOLDIER_NOT_FOUND: { status: 404, messageHe: 'לא נמצא/ה חייל/ת פעיל/ה עם מספר אישי זה' },
  INTEGRATION_OUT_OF_WINDOW: {
    status: 422,
    messageHe: 'התאריכים מחוץ לטווח המותר: מהיום ועד 30 ימים קדימה',
  },
  INTEGRATION_UNAUTHORIZED: { status: 401, messageHe: 'מפתח המערכת החיצונית חסר או שגוי' },
};

// ---- Weekly template + weekly reminder (DESIGN §7.4, §7.8) ----
export const DEFAULT_WEEKLY_REMINDER_DAY = 6; // 0 = Sunday … 6 = Saturday
export const DEFAULT_WEEKLY_REMINDER_TIME = '20:00';
// Default week for a user with no saved template, by reason code (resolved to ids server-side).
// Index 0 = Sunday. Sun–Wed present, Thu annual leave, Fri present, Sat none.
export const DEFAULT_WEEK_TEMPLATE_CODES: readonly (string | null)[] = [
  'present',
  'present',
  'present',
  'present',
  'annual_leave',
  'present',
  null,
];

// ---- I1: external-system integrations (SPEC F11 CPR gimelim, F12 אנשים בדיגיטל leave) ----
export const INTEGRATION_SYSTEMS = ['cpr', 'people_digital'] as const;
export const INTEGRATION_KEY_HEADER = 'x-integration-key';
export const INTEGRATION_KEY_MIN_LENGTH = 32;
export const INTEGRATION_WINDOW_DAYS = 30; // external systems may write up to today+30
export const CPR_MAX_DAYS = 30;
export const INTEGRATION_SOLDIERS_LIMIT = 50;
// Inactive, group-less users that own integration writes (reported_by / audit actor). Seeded in init.sql.
export const SYSTEM_USER_IDS = {
  cpr: '00000000-0000-0000-0000-0000000000f1',
  people_digital: '00000000-0000-0000-0000-0000000000f2',
} as const;

// ---- NFC speedgate ----
export const NFC_SCAN_RESULTS = [
  'entry',
  'exit',
  'duplicate',
  'unknown_card',
  'inactive_user',
  'wrong_base',
] as const;
export const NFC_PRESENCE_RESULTS = [
  'created',
  'already_present',
  'conflict',
  'finalized_conflict',
] as const;
export const NFC_DUPLICATE_WINDOW_SECONDS = 10;

// ---- NFC: sources that are the soldier's own action — no "changed by someone else" marker ----
export const SELF_REPORT_SOURCES: readonly string[] = ['self', 'nfc'];
export const isChangedByOther = (source: string) => !SELF_REPORT_SOURCES.includes(source);
