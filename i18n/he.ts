// All UI strings (Hebrew). Shared and append-only (CLAUDE.md): add one `export const <area> = {…}`
// block per feature at the END of the file; never rewrite another lane's block. Lane A resolves conflicts.

export const common = {
  appName: 'דו״ח 1',
} as const;

// ---- add new blocks below ----

// ---- D1: design-system components ----
export const ui = {
  menu: 'תפריט',
  back: 'חזרה',
  close: 'סגירה',
  loading: 'טוען…',
  retry: 'נסו שוב',
  errorTitle: 'משהו השתבש',
  errorBody: 'לא הצלחנו לטעון את הנתונים',
  emptyTitle: 'אין מה להציג',
  selected: 'נבחר',
  note: 'הערה',
  updatedBy: (name: string) => `עודכן ע״י ${name}`,
  countdownLeft: (hhmm: string) => `נותרו ${hhmm} לשליחת הדיווח`,
  countdownLate: 'הדיווח באיחור',
} as const;

// ---- D2: login + not registered (F1) ----
export const auth = {
  subtitle: 'דיווח נוכחות יומי',
  loginButton: 'התחברות עם Google',
  support: 'בעיה בהתחברות? פנו למשא״ן היחידה',
  demoMode: 'מצב הדגמה — ללא התחברות אמיתית',
  notConfigured: 'ההתחברות אינה זמינה כרגע. נסו שוב מאוחר יותר',
  signInFailed: 'ההתחברות נכשלה, נסו שוב',
  notRegisteredTitle: 'המשתמש לא רשום במערכת',
  notRegisteredBody:
    'חשבון Google שבו התחברת אינו משויך לחייל/ת במערכת. לבירור יש לפנות למשא״ן היחידה.',
  inactiveTitle: 'המשתמש אינו פעיל',
  inactiveBody: 'החשבון שלך הושבת. לבירור יש לפנות למשא״ן היחידה.',
  logout: 'התנתקות',
} as const;

// ---- D3: home (F2) ----
export const home = {
  greeting: (firstName: string) => `שלום, ${firstName}`,
  subtitle: 'סטטוס דיווח פרט',
  onBase: 'אני בבסיס',
  elsewhere: 'אני במקום אחר',
  future: 'דיווחים עתידיים',
  sentAt: (hhmm: string) => `הדיווח שלך נשלח בהצלחה ב-${hhmm}`,
  change: 'שינוי דיווח',
  lockFooter: 'לא ניתן לשנות דיווח לאחר השעה 23:59',
  locked: 'לא ניתן לשלוח דיווח אחרי 23:59',
  sentToast: 'הדיווח נשלח ✓',
} as const;

// ---- D4: report flow (F3) ----
export const report = {
  titleToday: 'איפה את/ה היום?',
  titleForDay: (day: string) => `דיווח ל${day}`,
  finalized: 'היום נסגר ע״י משא״ן ולא ניתן לשנותו',
  pickCategory: 'בחר/י קטגוריה',
  pickReason: 'יש לבחור סיבה',
  noteLabel: 'הערה (לא חובה)',
  notePlaceholder: 'עד 200 תווים',
  noteCount: (n: number, max: number) => `${n}/${max}`,
  noteTooLong: 'ההערה ארוכה מ-200 תווים',
  hintNote: 'ניתן להוסיף הערה',
  hintDocument: 'נדרש אישור רפואי',
  documentTitle: 'אישור רפואי',
  documentExplain: 'יש לצרף אישור רפואי — קובץ JPG, PNG או PDF עד 5MB',
  documentNeeded: 'יש לצרף אישור רפואי',
  camera: 'צילום',
  chooseFile: 'בחירת קובץ',
  replace: 'החלפה',
  attached: 'המסמך צורף',
  uploading: 'מעלה…',
  fileTooLarge: 'הקובץ גדול מ-5MB',
  fileType: 'ניתן לצרף רק JPG, PNG או PDF',
  cameraDenied: 'אין הרשאה למצלמה. אפשר לבחור קובץ במקום',
  send: 'שליחת דיווח',
  sent: 'הדיווח נשלח ✓',
} as const;

// ---- D5: calendar + bottom sheet + future reports (F4) ----
export const calendar = {
  weekdays: ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'],
  prevMonth: 'החודש הקודם',
  nextMonth: 'החודש הבא',
  present: 'בבסיס',
  scheduled: 'דיווח מתוכנן',
  changed: 'שונה ע״י מפקד או משא״ן',
  attachment: 'מסמך מצורף',
  notReported: 'לא דווח',
  today: 'היום',
} as const;

export const future = {
  title: 'דיווחים עתידיים',
  explain: 'אפשר לדווח מראש עד 7 ימים קדימה, יום אחד בכל פעם. בחר/י יום מסומן.',
  legendScheduled: 'דיווח מתוכנן',
  notYet: 'עוד לא דיווחת ליום הזה',
  onBase: 'אני בבסיס',
  elsewhere: 'אני במקום אחר',
  edit: 'עריכה',
  delete: 'מחיקה',
  confirmDelete: (day: string) => `למחוק את הדיווח ל${day}?`,
  confirmYes: 'כן, למחוק',
  cancel: 'ביטול',
  saved: 'הדיווח נשמר',
  deleted: 'הדיווח נמחק',
} as const;

// ---- D6: history (F5) ----
export const history = {
  title: 'היסטוריית דיווחים',
  legendPresent: 'נוכח',
  legendScheduled: 'עתידי',
  legendChanged: 'שונה ע״י מפקד',
  legendDocument: 'מסמך',
  reportedBy: 'דווח ע״י',
  reportedAt: 'שעת דיווח',
  updatedAt: 'עודכן',
  stage1: 'אישור מפקד',
  stage2: 'סגירת משא״ן',
  approvedBy: (name: string, at: string) => `אושר ע״י ${name} · ${at}`,
  pending: 'ממתין לאישור',
  finalizedOn: (date: string) => `נסגר ע״י משא״ן · ${date}`,
  notFinalized: 'טרם נסגר',
  document: 'מסמך',
  documentAttached: 'מצורף אישור',
  change: 'שינוי דיווח',
  pastLocked: 'לא ניתן לשנות יום שעבר. לתיקון יש לפנות למפקד/ה',
  empty: 'אין דיווחים בחודש הזה',
} as const;

// ---- D7: side menu (F7) + settings (F6) ----
export const menu = {
  title: 'תפריט',
  commander: 'כניסת מפקד',
  report: 'דיווח נוכחות',
  history: 'היסטוריית דיווחים',
  settings: 'הגדרות',
  logout: 'התנתקות',
} as const;

export const settings = {
  title: 'הגדרות',
  reminderSection: 'תזכורת יומית',
  reminder: 'תזכורת לדיווח',
  reminderHint: 'רק אם עוד לא דיווחת היום',
  reminderTime: 'שעת התזכורת',
  nudgeSection: 'נודניק',
  nudge: 'נודניק',
  nudgeHint: 'חוזר עד שתדווח/י או עד 11:00',
  nudgeInterval: 'כל כמה זמן',
  minutes: (n: number) => `${n} דק׳`,
  notifySection: 'התראות',
  notifyCommander: 'התקבל דיווח שונה מהמפקד',
  notifyHr: 'התקבל דיווח שונה ממשרד המשא״ן',
  hour: 'שעה',
  minute: 'דקות',
  more: 'הוספה',
  less: 'הפחתה',
  save: 'שמירה',
  cancel: 'ביטול',
  saveFailed: 'השמירה נכשלה, נסו שוב',
} as const;

// ---- D8: local reminders (F6) ----
export const reminders = {
  channel: 'תזכורות דיווח',
  reminderTitle: 'תזכורת לדיווח נוכחות',
  nudgeTitle: 'עוד לא דיווחת היום',
  body: 'יש לשלוח דיווח עד 11:00',
  denied: 'ההתראות חסומות. כדי לקבל תזכורות יש לאפשר התראות בהגדרות הטלפון',
  webOnly: 'תזכורות ונודניק פועלים באפליקציה בטלפון',
} as const;

// ---- E1–E6: commander area (F8–F10) ----
export const commander = {
  title: 'דיווחי קבוצה',
  lockBanner: 'לא ניתן לשלוח דיווח אחרי 23:59',
  allGroups: 'כל הקבוצות',
  pickGroup: 'בחירת קבוצה',
  withSub: 'כולל תתי־קבוצות',
  today: 'היום',
  tabAll: 'דיווחי קבוצה',
  tabPending: 'דיווחים ללא אישור מפקד',
  soldiersCount: (n: number) => `${n} חיילים\\ות`,
  search: 'חיפוש לפי שם',
  filterAll: 'הכל',
  filterNotReported: 'לא דיווחו',
  chipPresent: (n: number) => `${n} נוכחים`,
  chipAway: (n: number) => `${n} מחוץ ליחידה`,
  chipNotReported: (n: number) => `${n} לא דיווחו`,
  notReported: 'לא דיווח/ה',
  pending: 'ממתין לאישור',
  approved: 'אושר',
  finalizedBadge: 'נסגר ע״י משא״ן',
  hasNote: 'יש הערה',
  hasDocument: 'מסמך מצורף',
  star: (name: string) => `הצמדת ${name} לראש הרשימה`,
  unstar: (name: string) => `ביטול הצמדה של ${name}`,
  emptyList: 'אין חיילים להצגה',
  emptyFiltered: 'לא נמצאו חיילים שמתאימים לחיפוש',
  emptyPending: 'כל הדיווחים אושרו',
} as const;

// ---- E2–E4: commander soldier detail + editor (F9) ----
export const commanderDetail = {
  title: 'פרטי דיווח',
  notReported: 'לא דיווח/ה ליום הזה',
  document: 'אישור מצורף',
  viewDocument: 'צפייה במסמך',
  edit: 'עריכה',
  reportFor: 'דיווח במקומו',
  approve: 'אישור',
  approvedBy: (name: string, hhmm: string) => `אושר ע״י ${name} ב-${hhmm}`,
  finalized: 'היום נסגר ע״י משא״ן — לא ניתן לשנות או לאשר',
  editTitle: (name: string) => `עריכת הדיווח של ${name}`,
  reportForTitle: (name: string) => `דיווח עבור ${name}`,
  pickReason: 'יש לבחור סיבה',
  needsDocument: 'דורש אישור רפואי שהחייל/ת לא צירף/ה',
  commanderOnly: 'למפקדים בלבד',
  noteLabel: 'הערה (לא חובה)',
  noteTooLong: 'ההערה ארוכה מ-200 תווים',
  save: 'שמירה',
  saved: 'הדיווח נשמר',
  approved: 'הדיווח אושר',
  notFound: 'החייל/ת לא נמצא/ה ברשימה',
} as const;

// ---- E3: approve single + bulk (F9) ----
export const commanderApprove = {
  select: 'בחירה',
  cancel: 'ביטול',
  selectAll: 'בחר הכל',
  clearAll: 'נקה בחירה',
  approveN: (n: number) => `אישור (${n})`,
  approvedN: (n: number) => (n === 1 ? 'הדיווח אושר' : `${n} דיווחים אושרו`),
  nothingSelected: 'יש לבחור לפחות דיווח אחד',
  approve: 'אישור',
  alreadyApproved: 'הדיווח כבר אושר',
} as const;

// ---- E6: not a commander (F8) ----
export const notCommander = {
  title: 'מצטערים, אינך מוגדר/ת כמפקד/ת',
  body: 'האזור הזה מיועד למפקדים בלבד. אם זו טעות, פנו למשא״ן היחידה.',
  back: 'חזרה לדיווח שלי',
} as const;

// ---- E5: emergency mode "ירוק בעיניים" (F10) ----
export const emergency = {
  toggle: 'ירוק בעיניים',
  activeBanner: 'מצב חירום פעיל — לצפייה בתמונת המצב',
  confirmTitle: 'הפעלת ירוק בעיניים',
  confirmBody: (group: string) => `כל החיילים ב${group} יקבלו התראה וידווחו אם הם בסדר.`,
  includeSub: 'כולל תתי־קבוצות',
  messageLabel: 'הודעה לחיילים (לא חובה)',
  start: 'הפעלה',
  cancel: 'ביטול',
  liveTitle: 'ירוק בעיניים',
  ok: 'אני בסדר',
  needHelp: 'צריך/ה עזרה',
  noResponse: 'לא הגיבו',
  countOk: (n: number) => `${n} בסדר`,
  countHelp: (n: number) => `${n} צריכים עזרה`,
  countNone: (n: number) => `${n} לא הגיבו`,
  startedBy: (name: string, hhmm: string) => `הופעל ע״י ${name} ב-${hhmm}`,
  end: 'סיום מצב חירום',
  endConfirm: 'לסיים את מצב החירום? החיילים יפסיקו לראות את ההתראה.',
  endYes: 'כן, לסיים',
  ended: 'מצב החירום הסתיים',
  endedAt: (hhmm: string) => `הסתיים ב-${hhmm}`,
  sheetTitle: 'מצב חירום — דווח/י מיד',
  answered: (s: string) => `ענית: ${s}. אפשר לשנות כל עוד מצב החירום פתוח`,
  sent: 'התשובה נשלחה',
} as const;

// ---- Design v3: app shell (DESIGN.md §4) ----
export const shell = {
  soldierMode: 'מצב חייל',
  commanderMode: 'מצב מפקד',
  currentMode: 'מצב נוכחי',
  toCommander: 'מעבר למצב מפקד',
  toCommanderSub: 'רשימת הצוות, אישורים ועריכה',
  toSoldier: 'מעבר למצב חייל',
  toSoldierSub: 'דיווח אישי, יומן והגדרות',
  accountLabel: (name: string, mode: string) => `תפריט משתמש · ${name} · ${mode}`,
} as const;

export const tabs = {
  myReport: 'הדיווח שלי',
  future: 'דיווחים עתידיים',
  settings: 'הגדרות',
  team: 'הצוות',
} as const;

// ---- Design refresh: appearance (DESIGN.md §7.4) ----
export const appearance = {
  section: 'מראה',
  light: 'בהיר',
  dark: 'כהה',
} as const;

// ---- Commander team list redesign (DESIGN.md §7.5–7.6) ----
export const commanderTeam = {
  filterPresent: 'נוכחים',
  filterPending: 'ממתינים לאישור',
  filterNotReported: 'לא דיווחו',
  chipLabel: (label: string, n: number) => `${label} (${n})`,
  shown: (n: number, filter: string) => `${n} מוצגים · ${filter}`,
  edit: 'עריכה',
  report: 'דיווח',
  approve: 'אישור',
  editA11y: (name: string) => `עריכת הדיווח של ${name}`,
  reportA11y: (name: string) => `דיווח עבור ${name}`,
  approveA11y: (name: string) => `אישור הדיווח של ${name}`,
  approveAll: (k: number) => `אישור הכל (${k})`,
  approveAllCaption: 'יאושרו רק הדיווחים הממתינים מתוך הרשימה המוצגת',
  nothingPending: 'אין ממתינים לאישור',
  confirmTitle: (k: number) => `לאשר ${k} דיווחים?`,
  confirmBody: (filter: string, search: string) =>
    `סינון: ${filter}${search ? ` · חיפוש: "${search}"` : ''}. חיילים שלא דיווחו לא ייכללו.`,
  confirm: 'אישור',
  cancel: 'ביטול',
  approvedK: (k: number) => `אושרו ${k} דיווחים`,
  approvedOne: 'הדיווח אושר',
  emptyFiltered: 'אין חיילים שתואמים לסינון',
  clearFilter: 'ניקוי סינון',
  close: 'סגירה',
  status: 'סטטוס',
  updatedAt: (hhmm: string) => `עודכן ${hhmm}`,
  moreDetails: 'פרטים נוספים',
  editedApproved: (first: string) => `הדיווח של ${first} עודכן ואושר`,
} as const;

// ---- Calendar tab: history + future in one calendar (DESIGN.md §7.3, §7.2 range) ----
export const calendarTab = {
  title: 'דיווחים עתידיים',
  info: (last: string) =>
    `הקש/י על יום, או גרור/י על כמה ימים לדיווח טווח. ניתן לדווח עד ${last}.`,
  backToToday: 'חזרה להיום',
  selected: (n: number, from: string, to: string) =>
    n === 1 ? `יום אחד נבחר · ${from}` : `${n} ימים נבחרו · ${from}–${to}`,
  beyondWindow: 'ניתן לדווח עד 7 ימים קדימה בלבד',
  pastReadOnly: 'ימים שעברו מוצגים לצפייה בלבד',
  pastNoReport: 'לא דווח ביום הזה',
  legendTitle: 'מקרא',
  legendPending: 'ממתין לאישור',
  legendCanReport: 'ניתן לדווח',
  legendDisabled: 'לא זמין (מעבר ל-7 ימים)',
  cellPending: 'ממתין לאישור',
  cellDisabled: 'לא זמין',
  cellSelected: 'נבחר',
  rangeTitle: (n: number) => `דיווח ל-${n} ימים`,
  rangeOverwrite: (k: number) => `${k} מהימים כבר מדווחים — הדיווח יוחלף`,
  rangeSend: (n: number) => `דיווח ל-${n} ימים`,
  rangeSaved: (n: number) => `הדיווח נשמר ל-${n} ימים`,
  rangePartial: (done: number, n: number, msg: string) => `נשמרו ${done} מתוך ${n} ימים. ${msg}`,
} as const;

// ---- Weekly reminder (DESIGN §7.4) ----
export const weeklyReminder = {
  title: 'הגיע הזמן למלא את השבוע הקרוב',
  body: 'אפשר להחיל את התבנית השבועית בלחיצה אחת',
} as const;

// ---- Weekly template, My Report v2, settings v2 (DESIGN §7.1, §7.3, §7.4, §7.8) ----
export const weekTemplate = {
  dayLetters: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'],
  dayNames: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
  none: 'ללא קבוע',
  setupTitle: 'השבוע הקבוע שלי',
  editTitle: 'עריכת התבנית השבועית',
  explain: 'בחר/י סטטוס קבוע לכל יום בשבוע. אפשר להחיל אותו על השבוע הקרוב בלחיצה אחת.',
  rowDay: (day: string) => `יום ${day}`,
  editorNote: 'שינוי התבנית לא משנה ימים שכבר דווחו. לשינוי יום בודד — ערכו אותו ביומן.',
  saveSetup: 'שמירת השבוע הקבוע',
  saveEdit: 'שמירת התבנית',
  saving: 'שומר…',
  saved: 'התבנית נשמרה',
  pickerTitle: (day: string) => `יום ${day} בתבנית`,
  pickerEyebrow: 'התבנית השבועית · חוזרת כל שבוע',
  noFixed: 'ללא סטטוס קבוע ביום זה',
  pickSave: (day: string, status: string) => `שמירה ביום ${day} · ${status}`,
  pickFirst: 'בחר/י סטטוס',
  pickCategory: 'או בחר/י קטגוריה',
  back: 'חזרה',
  reasonCount: (n: number) => `${n} סוגי דיווח`,
  // apply sheet
  applyTitle: 'החלת התבנית על 8 הימים הקרובים',
  tagAdd: 'יתווסף',
  tagKept: 'קיים דיווח · נשאר',
  tagNone: 'ללא קבוע',
  applyNote:
    'כל יום מקבל את ערך התבנית של אותו יום בשבוע. ממלא רק ימים ריקים — ימים שכבר דיווחת נשארים כמו שהם.',
  applyCta: (k: number) => `החלת התבנית על ${k} ימים`,
  applyNone: 'אין ימים להוספה',
  editLink: 'עריכת התבנית הקבועה',
  applied: (k: number) => `התבנית הוחלה על ${k} ימים · שינוי יום בודד לא ישנה את התבנית`,
  applyPartial: (done: number, n: number, msg: string) => `הוחלו ${done} מתוך ${n} ימים. ${msg}`,
  // setup card (My Report)
  setupEyebrow: 'חדש · הגדרה ראשונה',
  setupHeading: 'הגדר/י את השבוע הקבוע שלך',
  setupCta: 'הגדרת השבוע',
  notNow: 'לא עכשיו',
  // template card (Future / Settings)
  cardTitle: 'התבנית השבועית שלי',
  cardSub: (n: number) => `${n} ימים קבועים בשבוע · חוזרת כל שבוע`,
  edit: 'עריכה',
  applyWindow: (k: number) => `החלה על 8 הימים הקרובים (${k})`,
  applyCaption: (from: string, to: string) => `היום + 7 ימים · ${from} – ${to} · ממלא רק ימים ריקים`,
  allReported: 'כל הימים בטווח כבר מדווחים',
} as const;

export const homeV2 = {
  notReported: 'טרם דיווחת היום',
  whereToday: 'איפה את/ה היום?',
  present: 'נוכח/ת ביחידה',
  otherStatus: 'סטטוס אחר ‹',
  sentToast: 'הדיווח נשלח · נוכח/ת',
  myToday: 'הדיווח שלי להיום',
  approved: 'אושר',
  pending: 'ממתין לאישור',
  updated: (hhmm: string) => `עודכן ${hhmm} · ניתן לשנות עד 23:59`,
  update: 'עדכון דיווח',
  weekTitle: '7 הימים הקרובים',
  weekCount: (n: number) => `${n}/7 ימים קדימה מדווחים`,
  toCalendar: 'ליומן ‹',
  reportDay: (label: string) => `דיווח ל${label}`,
} as const;

export const settingsV2 = {
  dailyTitle: 'תזכורת יומית',
  dailySub: (except: string | null, time: string) =>
    `${except ? `כל יום מלבד יום ${except}` : 'כל יום'} · ${time} · רק אם טרם דיווחת`,
  weeklyDayNote: (day: string) => `ביום ${day} נשלחת גם התזכורת השבועית`,
  weeklyTitle: 'תזכורת שבועית',
  weeklySub: (day: string, time: string) => `כל יום ${day} ב-${time} · תזכורת למלא את השבוע הקרוב`,
  weeklyDay: 'יום התזכורת',
  time: 'שעה',
  templateSection: 'התבנית השבועית',
  editTemplate: 'עריכת התבנית הקבועה',
} as const;

// ---- Calendar multi-select (DESIGN §7.3 v5) ----
export const calendarSelect = {
  info: (last: string) =>
    `הקש/י על ימים כדי לסמן אותם, או החלק/י על כמה ימים ברצף. אחרי הסימון לחצ/י ״דיווח״. ניתן לדווח עד ${last}.`,
  count: (n: number) => (n === 1 ? 'יום אחד נבחר' : `${n} ימים נבחרו`),
  clear: 'ניקוי',
  report: 'דיווח לימים שנבחרו',
  legendSelected: 'ימים שסימנת',
  region: 'ימים שנבחרו לדיווח',
} as const;
