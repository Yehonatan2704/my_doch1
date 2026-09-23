# SPEC.md — Doch 1 (New) — MVP Product Spec

> Source of truth for WHAT we build. Agents: read this before every task.
> Anything marked **[ASSUMPTION]** was not confirmed — keep it easy to change.

---

## 1. Goal

A daily attendance-reporting app for soldiers and their commanders.

- **Soldier:** reports once a day where they are (on base, or elsewhere + reason) in as few taps as possible, and can pre-report up to a week ahead.
- **Commander:** sees the status of every soldier under them (including sub-commanders' groups), approves or fixes reports, reports for soldiers who didn't, and runs an **emergency roll-call** ("ירוק בעיניים").

### Problems we fix (from user research)
Store rating of the current app is ~1.1/5. Top complaints:
1. Forgetting the daily deadline → penalties. → **Clear countdown, reminders, repeating nudge.**
2. Must report every single day manually. → **Future reports up to 7 days ahead, fast one-tap per day.**
3. App gets "stuck" and must be force-closed. → **Always refresh state on app focus.**
4. Unclear rules (e.g. do I upload a sick note?). → **The app tells you exactly what's required per status.**
5. Emergency alerts must be reliable. → **Emergency mode is explicit, tracked, and ended by a commander.**

## 2. Users & roles

| Role | Who | Can |
|---|---|---|
| `soldier` | Every serving user | Report for self, view own history, settings, answer emergencies |
| `commander` | A user who commands ≥1 group | Everything a soldier can + commander area for their **group subtree** |
| `HR` (משא"ן) | `role='admin'`, **outside** the chain of command | Approve, change and **finalize** any report of any soldier in the units assigned to them |

**Hierarchy:** groups are nested (battalion → company → team). A commander of a group sees that group **and all groups below it**. A commander is also a soldier (belongs to a group and reports daily).

**HR is not part of the hierarchy.** An HR user has no group of their own. Their reach is defined by `hr_assignments` — the units they are responsible for, plus everything below those units. Battalion-level HR therefore covers every soldier *and every commander* in that battalion, including the battalion commander; team-level HR covers only that team.

### Two approval stages

| Stage | Who | Meaning |
|---|---|---|
| 1 — approval | The soldier's commander (any level above them) | "I've seen it." **Optional** — a commander may never get to it |
| 2 — finalization | HR for that unit | **The last word.** Closes the day and locks it for everyone except HR |

HR does not need stage 1 to have happened: when a commander doesn't check, HR validates and finalizes anyway. HR can also change a report at any time, including one the commander already approved, and including past days. Once a day is finalized, the soldier and the commander can no longer change it; only HR can (which un-finalizes or re-finalizes it, and is audited).

## 3. Auth

- Sign in with **Google** only (via Supabase Auth, Google provider).
- After Google login, the backend matches the Google **email** to `users.email`.
  - Match → logged in.
  - No match → "המשתמש לא רשום במערכת" screen with support text. No self-registration.
- MVP uses **mock data** only (no IDF systems).

## 4. Business rules

All times are **Asia/Jerusalem**. All rules are enforced **on the server**; the client only mirrors them for UX.

| Rule | Value |
|---|---|
| Reporting days | **Every day**, including Fri/Sat/holidays |
| On-time deadline | **11:00** — after it the report counts as "late" and commander sees "לא דיווח" until it's sent |
| Edit lock | Soldier can create/edit **today** until **23:59** |
| Past days | Locked for soldiers. Commanders can edit **today and future** only (MVP). **HR can edit any day, including past ones** |
| Finalized days | Once HR finalizes a day it is **read-only for the soldier and the commander**; only HR can change it |
| Future reports | Up to **7 days ahead** (today+1 … today+7). **One day per tap** (no ranges, no recurring) |
| Future edit/delete | Soldier can edit or delete any own future report |
| Sick leave (גימלים) | **Document upload required** (jpg/png/pdf, ≤5MB) |
| יום ד' (sick, self-declared) | No document |
| Optional note | Only on: השתלמות מקצועית בחו"ל, בתפקיד מחוץ ליחידה, אחרי תורנות / משמרת, השתלמות מקצועית בארץ. Max 200 chars |
| Approval | Commander approval (stage 1) resets if the soldier edits the report. Finalization (stage 2) does not reset — a finalized day can't be edited by the soldier in the first place |
| "Changed by other" | If a commander/HR edited the report, the day shows a **red circle** in history and the soldier gets a notification (separate toggles for "by commander" and "by משא״ן") |
| Emergency | Commander starts it for a group (+ subgroups). Soldiers answer **OK** or **Need help**. Stays open until the commander ends it |

### Status list (fixed for MVP — seeded in `init.sql`)

| Category (code) | Hebrew | Reasons |
|---|---|---|
| `on_base` | נמצא/ת ביחידה | נוכח/ת |
| `outside_unit` | מחוץ ליחידה | בתפקיד מחוץ ליחידה (note), אחרי תורנות / משמרת (note), עובד/ת משמרות, הפניה רפואית, יום סידורים, משמרת ערב, אבט"ש, סבב קו, השתלמות מקצועית בארץ (note), בקורס / בהכשרה (*commander only*), מסופח/ת ליחידה אחרת (*commander only*) |
| `annual_leave` | חופשה שנתית | חופשה שנתית, חופשת נהג/ת מבצעי, חג עדתי, אזכרה - קרבה ראשונה |
| `abroad` | חו"ל | השתלמות מקצועית בחו"ל (note), חופשת נהג מבצעי |
| `sick_leave` | חופשת מחלה | חופשת מחלה (גימלים) (document), יום ד' |

*Commander-only reasons appear on the commander screen in the existing app; soldiers can't pick them. [ASSUMPTION]*

## 5. Features & acceptance criteria

### F1 — Login
- [ ] "התחברות עם Google" button → Google → back in app.
- [ ] Unknown email → "not registered" screen, logout button.
- [ ] Session persists; logout from menu clears it.

### F2 — Home (soldier)
**Not reported today:**
- [ ] Greeting "שלום, {first name}" + "סטטוס דיווח פרט".
- [ ] Countdown to 11:00 ("נותרו HH:MM לשליחת הדיווח"). After 11:00: "הדיווח באיחור" in warning color.
- [ ] Big primary button **"אני בבסיס"** → sends `on_base/נוכח/ת` in **one tap**, shows success.
- [ ] Button **"אני במקום אחר"** → F3.
- [ ] Button **"דיווחים עתידיים"** → F4.

**Reported today:**
- [ ] "הדיווח שלך נשלח בהצלחה ב-HH:MM" + status card (category icon, category, reason, note if any).
- [ ] "שינוי דיווח" link → F3 (pre-selected current values).
- [ ] If changed by commander/HR: card shows "עודכן ע״י {name}".
- [ ] Footer: "לא ניתן לשנות דיווח לאחר השעה 23:59".
- [ ] State refreshes whenever the app returns to foreground (fixes the "stuck" bug).

### F3 — "Where are you today?" (report elsewhere)
- [ ] Step 1: grid of 4 categories (outside_unit, annual_leave, abroad, sick_leave) with icons.
- [ ] Step 2: list of reasons for that category; single select.
- [ ] If reason allows note → optional textarea (200 chars).
- [ ] If reason requires document → upload (camera or file). **Send is disabled until uploaded.**
- [ ] "שליחת דיווח" disabled until valid. Back arrow returns to step 1; X closes.
- [ ] Used for today, for future dates (F4), and for "change report".

### F4 — Future reports
- [ ] Calendar (current + next month). Only today+1 … today+7 are tappable; others greyed.
- [ ] Tap a free day → F3 flow for that date **or** quick "אני בבסיס" for that date.
- [ ] Tap a reported future day → shows status with **Edit** and **Delete**.
- [ ] Scheduled days show a calendar icon.
- [ ] Future report becomes the day's report automatically when that day arrives.

### F5 — History
- [ ] Monthly calendar, prev/next month.
- [ ] Per day: ✓ for on_base, otherwise reason label (short). Empty = not reported.
- [ ] **Red circle** on days changed by someone else (commander or משא״ן).
- [ ] Paperclip icon on days with a document.
- [ ] Tap day → detail sheet: status, note, who reported, when, **stage-1 approval** (approved by / pending) and **stage-2 finalization** ("נסגר ע״י משא״ן" + date, or "טרם נסגר").
- [ ] A finalized day shows as read-only, with the reason it can't be changed.

### F6 — Settings
- [ ] Daily reminder: on/off + time (default 08:00). Fires only if today is not reported.
- [ ] Nudge (נודניק): on/off + interval (15/30/60 min, default 30). Repeats until reported or 11:00.
- [ ] Notifications: "התקבל דיווח שונה מהמפקד", "התקבל דיווח שונה ממשרד המשא״ן" toggles.
- [ ] Reminders are scheduled as **local notifications** and cancelled when the user reports.

### F7 — Side menu
כניסת מפקד (only if commander) · דיווח נוכחות · היסטוריית דיווחים · הגדרות · התנתקות

### F8 — Commander: group reports
- [ ] Red banner: "לא ניתן לשלוח דיווח אחרי 23:59".
- [ ] Group selector: my groups as a tree + "כל הקבוצות" (whole subtree). Default = first group.
- [ ] Date selector (today default; today…+7 for viewing).
- [ ] Tabs: **"דיווחי קבוצה"** (all) and **"דיווחים ללא אישור מפקד"** (pending approval).
- [ ] Header: "{N} חיילים\ות", search by name, filter by category / "לא דיווחו".
- [ ] Summary chips: present · away · not reported.
- [ ] Row: ☆ star, full name, line 1 = category, line 2 = reason, note icon if note, paperclip if document. Not reported → red "לא דיווח/ה".
- [ ] Starred soldiers are pinned to the top [ASSUMPTION: star = pin].
- [ ] Non-commanders opening "כניסת מפקד" see "מצטערים, אינך מוגדר/ת כמפקד/ת" (should not normally be reachable).

### F9 — Commander: actions
- [ ] **Approve single:** row swipe or detail → "אישור".
- [ ] **Approve bulk:** select mode → select soldiers or "בחר הכל" → "אישור ({n})".
- [ ] **Edit report:** detail → change category/reason (commander-only reasons available) → save. Soldier notified; history shows red circle.
- [ ] **Report for non-reporter:** same editor on a "לא דיווח/ה" row.
- [ ] **View document:** opens signed URL (expires fast).
- [ ] **Finalized days are read-only** for the commander too: actions are disabled with the reason shown.
- [ ] Every commander action is written to the audit log.

### F9b — HR (משא"ן) — permissions only in MVP, no screens
- [ ] The API accepts HR users on the commander endpoints, scoped by `hr_assignments` instead of the command chain.
- [ ] HR may additionally: edit **past** days, **finalize** and un-finalize, and act on commanders (including a battalion commander).
- [ ] `source='hr'` is written on HR edits, so the soldier's history shows the red circle and the "משא״ן" notification fires.
- [ ] Every HR action is audited (`finalize` / `unfinalize` actions included).
- [ ] **No HR UI in the MVP** — screens are v2. Verify via API tests only.

### F10 — Emergency mode ("ירוק בעיניים")
- [ ] Commander toggles **ירוק בעיניים** → confirm dialog (group + include subgroups + optional message) → starts event.
- [ ] Soldiers in scope get a **push notification** + full-screen in-app banner on open: "מצב חירום — דווח/י מיד" with **"אני בסדר"** (green) and **"צריך/ה עזרה"** (red).
- [ ] Answer can be changed while the event is open.
- [ ] Commander live view (polling every 5s): counts OK / need help / no response; "need help" pinned on top in red.
- [ ] Commander ends the event → toggle off, soldiers' banner disappears.
- [ ] Only one open event per group.

## 6. API (backend contract)

Base: `/api/v1`. All routes except `/health` require `Authorization: Bearer <supabase access token>`. JSON, validated with Zod. Dates `YYYY-MM-DD`.

**Soldier**
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | public |
| GET | `/me` | user, isCommander, group |
| GET | `/statuses` | categories + reasons (excl. commander-only for soldiers) |
| GET | `/reports/today` | today's report or null + deadline info |
| GET | `/reports?from=&to=` | own history (max 62 days range) |
| PUT | `/reports/:date` | `{reasonId, note?, documentId?}` — create/update own, today…+7 |
| DELETE | `/reports/:date` | future dates only |
| POST | `/documents` | multipart, ≤5MB, jpg/png/pdf → `{documentId}` |
| GET/PUT | `/settings` | reminder, nudge, notification toggles |
| POST | `/push-tokens` | Expo push token |
| GET | `/emergencies/active` | open events that include me |
| POST | `/emergencies/:id/respond` | `{status: "ok" \| "need_help"}` |

**Commander / HR** — every route checks the actor may act on the target: `canActOn(actorId, soldierId)` = commander subtree **or** HR assignment subtree. HR-only powers (past days, finalize) additionally require `role='admin'`.
| Method | Path | Notes |
|---|---|---|
| GET | `/commander/groups` | tree of my groups (for HR: the assigned units) |
| GET | `/commander/groups/:groupId/reports?date=&includeSub=&pending=` | rows for screen F8 |
| POST | `/commander/reports/approve` | `{reportIds: uuid[]}` (max 200) |
| PUT | `/commander/soldiers/:userId/reports/:date` | `{reasonId, note?}` edit or report-for |
| GET | `/commander/documents/:documentId/url` | short-lived signed URL |
| PUT/DELETE | `/commander/favorites/:soldierId` | star |
| POST | `/commander/emergencies` | `{groupId, includeSub, message?}` |
| GET | `/commander/emergencies/:id` | counts + per-soldier responses |
| POST | `/commander/emergencies/:id/end` | |
| POST | `/hr/reports/finalize` | **HR only** — `{reportIds: uuid[]}` (max 200), all-or-nothing |
| DELETE | `/hr/reports/:reportId/finalize` | **HR only** — un-finalize, audited |

**Integrations (v2, F11/F12)**: machine-to-machine, **no Supabase user**. Auth = header `X-Integration-Key`, **one secret per external system** (env `INTEGRATION_CPR_KEY`, `INTEGRATION_PEOPLE_DIGITAL_KEY`). A system's key only opens that system's routes. Soldiers are identified by **personal number**. Rate limit: 30/min per system.
| Method | Path | Key | Notes |
|---|---|---|---|
| GET | `/integrations/soldiers?q=&limit=` | either | `{soldiers: [{personalNumber, firstName, lastName, groupName}]}`: active soldiers only (picker for the external systems) |
| POST | `/integrations/cpr/sick-leave` | CPR | `{personalNumber, issueDate, days}`: `issueDate` = today, `days` 1…30 → `sick_gimelim` on issueDate+1 … issueDate+days |
| POST | `/integrations/people-digital/annual-leave` | People | `{personalNumber, startDate, endDate}` (inclusive, today … today+30) → `annual_leave` on every day |

Both POSTs return `{personalNumber, reasonCode, dates, created, updated, unchanged}`. Errors: `INTEGRATION_UNAUTHORIZED` 401, `VALIDATION_ERROR` 400, `SOLDIER_NOT_FOUND` 404, `INTEGRATION_OUT_OF_WINDOW` 422.

Errors: `{ error: { code, message } }` — message is safe to show (Hebrew), no internals.

## 7. Out of scope for MVP
Real IDF/MY IDF integration (a **mock** CPR / אנשים בדיגיטל integration exists as v2: F11/F12) · **HR screens** (permissions and API only — see F9b) · dark mode (tokens ready) · date ranges / recurring reports · exports · offline mode · languages other than Hebrew.

## 8. Future features (v2+)
> Reserved. Add items here as `### FX — name` with acceptance criteria, same format as section 5.

### F11 — CPR gimelim import (integration, mock source)
An external CPR system (simulated by the fake website in `apps/integrations-mock`, task I5) tells us a soldier got N gimelim today.
- [x] `POST /integrations/cpr/sick-leave` with the CPR key and `{personalNumber, issueDate: today, days: N}` creates `חופשת מחלה (גימלים)` on **today+1 … today+N** (for example, 3 on Sunday → Mon, Tue, Wed).
- [x] No document is required. The report has `source='cpr'` and "מערכת CPR" as the editor, so the soldier sees the red circle and "עודכן ע״י מערכת CPR".
- [x] Existing reports on those days are overwritten, including approved and finalized ones. Approval and finalization are cleared, so commanders, HR or the soldier can still change the day afterwards.
- [x] `issueDate` other than today, `days` outside 1…30, an unknown personal number, or the wrong key are refused, and nothing is written.
- [x] Sending the same request again changes nothing (`unchanged`). Every write is in `report_audit` with the CPR system user as the actor.

### F12 — אנשים בדיגיטל annual-leave import (integration, mock source)
An external HR system (simulated) approves an annual leave from a start date to an end date.
- [x] `POST /integrations/people-digital/annual-leave` with the People key and `{personalNumber, startDate, endDate}` creates `חופשה שנתית` on **every day from start to end, inclusive**, ahead of time.
- [x] `startDate` ≥ today, `endDate` ≥ `startDate`, and `endDate` ≤ today+30. Otherwise the request is refused.
- [x] Same overwrite, editability, idempotency and audit rules as F11, with `source='people_digital'`.
- [x] A CPR key can't call this route, and a People key can't call F11's.

### F13 — NFC speedgate (base entry / exit)
A soldier taps their card on an Android gate reader. First tap = entry, next tap = exit. The API reflects the stay into daily reports.
- [x] HR (admin, HR-scoped) provisions a reader for a base: `POST /nfc/readers {baseCode, name}` → a one-time reader token (`<readerId>.<secret>`). Only the secret's SHA-256 is stored.
- [x] HR enrolls a card to a soldier by personal number: `PUT /nfc/cards {personalNumber, calypsoSerial}`; `DELETE /nfc/cards {personalNumber}` revokes. A card bound to another soldier → 409 `NFC_CARD_ALREADY_ENROLLED`. The raw serial is never stored — only `HMAC-SHA256(NFC_CARD_HMAC_SECRET, "calypso:v1:<serial>")` and its last 4 digits.
- [x] The reader calls `POST /speedgate/scans {calypsoSerial, requestId}` with `Authorization: Gate <token>` (no Supabase user). Results: `entry`, `exit`, `duplicate` (same card within 10 s — never exits), `unknown_card`, `inactive_user` (identity withheld), `wrong_base` (open visit at another base).
- [x] A retry with the same `requestId` replays the first answer; nothing is applied twice.
- [x] Entry creates today's report as `נוכח/ת` (source `nfc`) if the day has none. Exit reconciles **every Jerusalem date** from entry through exit the same way.
- [x] Existing reports are never overwritten: a different reason → `conflict`, finalized → `finalized_conflict`, `present` → `already_present`. Each day's outcome is recorded (`nfc_presence_days`).
- [x] Speedgate reports are the soldier's own action: no "changed by someone else" ring (`isChangedByOther`).
- [x] The reader app reads **only** the Calypso application serial (SELECT, no record read) — never birth date or holder identifiers.
- [ ] Verified on a real reader phone with real cards (owner).
- [ ] HR screens for provisioning / enrollment (API only for now, like F9b).

-

## 9. Open questions / assumptions log
| # | Item | Current assumption |
|---|---|---|
| 1 | On-time deadline | 11:00 |
| 2 | יום ד' needs a document? | No |
| 3 | Star meaning | Pin to top |
| 4 | Commander-only reasons | בקורס/בהכשרה, מסופח/ת ליחידה אחרת |
| 5 | Commander can edit past days? | No (today + future only). HR can |
| 6 | When does HR finalize? | Manually, per report or in bulk. No automatic nightly close in MVP |
| 7 | Can HR un-finalize? | Yes, audited |
| 8 | Overlapping HR assignments | The most specific (deepest) assignment wins for display; any covering HR may act |
| 9 | Report shape (A0.2) | Reports embed `reason {id, code, nameHe, categoryCode}` — `/statuses` hides commander-only reasons from soldiers, but a commander may set one on their report |
| 10 | `/reports/today` extras (A0.2) | Also returns `serverTime`, `deadline`, `editLockAt`, `isLate` so the countdown doesn't trust the phone clock |
| 11 | Commander list query (A0.2) | Server-side `q` (search), `category` (or `not_reported`), `sort` (`name` \| `category`); response includes `counts` and `openEmergencyId` for the emergency toggle |
| 12 | `PUT /settings` (A0.2) | Partial update — send only the changed fields |
| 13 | ID format (A0.2) | Validated with Zod `guid()` (8-4-4-4-12 hex), not `uuid()` — Zod 4's `uuid()` rejects the seeded ids |
| 14 | Error codes (A0.2) | Fixed list in `packages/shared/src/constants.ts` (`ERROR_CODES`); client maps codes to Hebrew messages |
| 15 | Upload field (A0.4) | `POST /documents` multipart field name is `file` |
| 16 | Emergency roll-call scope (A0.4) | Everyone active in the group (+ subgroups), **including** the commander who started it — matches the seeded drill in `init.sql` |
| 17 | `GET /commander/groups` for a non-commander (C1) | Returns `{groups: []}`, not 403 — it leaks nothing and lets the client render the "אינך מוגדר/ת כמפקד/ת" state (F8) |
| 18 | `openEmergencyId` on the group list (C2) | An open event counts for a group if it was started on it, or on an ancestor that included subgroups; the most specific one wins |
| 19 | Summary chips vs. filters (C2) | `counts` summarise the whole group and ignore `q` / `category` / `pending`, so the chips stay stable while filtering (and can act as filter buttons). Only `rows` are filtered |
| 20 | Commander picks a reason needing a document (C3) | The commander editor has no upload field, so it is allowed only if the soldier already attached one; otherwise `DOCUMENT_REQUIRED` |
| 21 | Does a commander/HR edit reset stage-1 approval? (C3) | No — SPEC §4 resets it only when the *soldier* edits. A commander editing is the approver acting, so the approval stands |
| 22 | Live-view ordering (C4) | Triage order: "צריך/ה עזרה" first, then whoever hasn't answered, then "אני בסדר" — each by last name |
| 23 | Commander-only reason on a self-report (B3) | Refused with `REASON_NOT_ALLOWED` for everyone on `PUT /reports/:date`, commanders included. Commander-only reasons are set through the commander routes (matches the mock). An unknown `reasonId` gives the same code |
| 24 | Past day vs. out of window (B3) | Soldier: a past day, or today from 23:59, → `DAY_LOCKED`; after today+7 → `OUT_OF_WINDOW`. `DELETE` on today or a past day → `DAY_LOCKED`. Same split as the commander route (C3) |
| 25 | When nudges fire (D8) | From the reminder time, every interval, until 11:00. With the reminder on, the first nudge is one interval after it (they never fire together); with it off, the first nudge is at the reminder time. Scheduled for today…+7, skipping reported days, capped at 60 (iOS limit) and re-planned whenever the app opens |
| 26 | Commander list includes the commander? (A5) | No — `GET /commander/groups/:id/reports` never lists the actor, same rule as `can_act_on()`. Otherwise "select all → approve" would include a row the approve call rejects (403 for the whole bulk). A commander's own report is approved by the commander above them |
| 27 | "כל הקבוצות" with several separate command trees (E1) | The list API takes one groupId, so "כל הקבוצות" = the first root group + its subtree. Commanders have one root in practice |
| 28 | Integration hits an existing report (F11/F12) | The external system wins: the report is overwritten, **including approved and finalized days**, and approval + finalization are cleared (audited as `unfinalize` + `update`). The result is an ordinary report that the soldier, commander or HR can change afterwards |
| 29 | Document for integration gimelim (F11) | Not required: the source system is the proof. Any note or document on the overwritten report is dropped |
| 30 | CPR `issueDate` (F11) | Must be today (Asia/Jerusalem). Late or back-dated CPR messages are refused, not back-filled |
| 31 | Push on an integration write (F11/F12) | Sent through the soldier's **"changed by משא״ן"** toggle, with the generic text |
| 32 | Who "made" an integration report (F11/F12) | Two seeded **inactive, group-less system users** (`SYSTEM_USER_IDS`): "מערכת CPR" and "מערכת אנשים בדיגיטל". They can't log in and are in nobody's subtree |
| 33 | Integration window (F11/F12) | Up to **today+30** (`INTEGRATION_WINDOW_DAYS`), wider than the soldier's 7 days. Leave can't start in the past |
| 34 | How external systems find soldiers (F11/F12) | By personal number. `GET /integrations/soldiers` gives the mock a picker with personal number, name and group only |
| 35 | Weekly template (DESIGN §7.8) | Stored per user server-side (`user_week_template`, 7 days, index 0 = Sunday, each `{reasonId}` or null). `GET /settings/template` returns the default week (Sun–Wed present, Thu annual leave, Fri present, Sat none — resolved from reason codes) until the user saves one; `PUT` is a full replace; every reason must exist (400) and not be commander-only (422). The template only pre-fills: the client sends one `PUT /reports/:date` per day — no apply endpoint, so all report rules still apply. `settings.templateOnboarded` = the setup card was saved or dismissed |
| 36 | Weekly reminder (DESIGN §7.4) | New settings `weeklyReminderEnabled` (default off), `weeklyReminderDay` 0–6 (default 6 = Saturday), `weeklyReminderTime` (default 20:00). A local notification "הגיע הזמן למלא את השבוע הקרוב" on that day/time, sent even if that day is reported; the daily reminder still fires that day too |
| 37 | Commander/HR writes a report (edit or report-for) | The report is saved as approved by that commander/HR in the same write (`approved_by`/`approved_at` set). Soldier edits still reset approval (SPEC §4) |
| 38 | Where the fake external systems live (I5) | In this repo, `apps/integrations-mock`, deployed as its **own** Render service `doch1-integrations` behind Basic Auth. It only calls the public integration API with its keys (server-side). The issue date for CPR is stamped by the mock's server (today in Asia/Jerusalem), never by the browser |
| 39 | Who "reported" a speedgate day (F13) | The soldier (`reported_by` = soldier, `source='nfc'`) — it's their own card tap; no system user needed |
| 40 | When a speedgate visit shows as present (F13) | Entry creates today's `present` immediately; the other days of a multi-day visit are filled at exit. A visit still open days later has no reports for the middle days until exit |
| 41 | Who may enroll cards / provision readers (F13) | Enroll/revoke: admin **and** HR scope for that soldier (like the S3 rule). Provision a reader: any admin — bases aren't tied to units. Unknown and out-of-scope personal numbers both answer 403 |
| 42 | Enrolling a new card for a soldier who has one (F13) | Replaces it — the previous card is revoked. Re-enrolling a revoked card re-activates its row |
| 43 | What the reader sends (F13) | Only the Calypso application serial (4 bytes, decimal). Not Android's NFC hardware UID (random on many cards), not any record contents |
