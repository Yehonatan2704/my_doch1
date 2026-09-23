# DESIGN.md — Doch 1 (דוח 1) · Visual & interaction spec

> Source of truth for **how the app looks and behaves**. SPEC.md says *what*; this file says *how it looks*.
> Reference prototype: the "v3 · דרישות חדשות" page of the Doch 1 design canvas (interactive, 390×844).
> Reference screenshots live in `docs/design/screens/` (see §12). If a screenshot and this file disagree, **this file wins**.

Read order for UI tasks: **CLAUDE.md → SPEC.md → DESIGN.md**. Components use tokens only — no raw hex in screens.

---

## 1. Direction

- **Premium technology product for a military organization** — not a military system with a modern skin. Military context comes from content and workflows, not camouflage, badges or heavy green/yellow.
- **Hebrew, native RTL, mobile-first.** Design target 390×844; must work from 360 wide. One-handed use: primary actions in the bottom half.
- **One account, two modes.** A commander is also a soldier. The same user switches **מצב חייל ⇄ מצב מפקד** without logging out, and the current mode is always visible.
- **Calm by default.** Strong color is reserved for status meaning (missing, pending) and the primary action.

### Principles
1. **One tap for the common case** — "נוכח/ת ביחידה" is the biggest button on My Report.
2. **Status at a glance** — color **+ icon + text**, never color alone.
3. **Show what's possible before the user fails** — disabled days/buttons say why.
4. **Every async action** has a loading state, a success toast, and a clear error.
5. **Same layout in light and dark** — only tokens change.

---

## 2. Design tokens (`apps/mobile/theme/tokens.ts`)

### 2.1 Color — semantic tokens
Same token names in both themes. Light is the default.

| Token | Light | Dark | Use |
|---|---|---|---|
| `brand.primary` | `#101C2C` | `#0B1420` | Navy: hero cards, avatar background |
| `brand.accent` | `#18A6A6` | `#35C2C2` | Primary actions, active tab, selection |
| `brand.accentStrong` | `#118787` | `#27A9A9` | Pressed state, "outside unit" category |
| `brand.highlight` | `#F4C542` | `#F4C542` | Identity accent only (logo "1", avatar initials, commander-mode marker). Never a large background |
| `surface.base` | `#FFFFFF` | `#151F2B` | Cards, lists, sheets |
| `surface.page` | `#F5F7FA` | `#0B1118` | Screen background |
| `surface.elevated` | `#FFFFFF` | `#1C2835` | Bottom sheets, modals, menus |
| `surface.accent` | `#EAF7F7` | `#123638` | Selected rows, info notes |
| `text.primary` | `#17202B` | `#F4F7FA` | |
| `text.secondary` | `#626D78` | `#AAB5C0` | |
| `text.disabled` | `#A5ADB6` | `#65717D` | |
| `border.subtle` | `#DCE3EA` | `#2A3744` | Dividers, chip/input borders |
| `status.present` | `#159A63` | `#35C98A` | Approved, "at unit" category |
| `status.away` | `#2388D9` | `#54A9EA` | Pending approval, "annual leave" category |
| `status.missing` | `#D64545` | `#F06A6A` | Not reported, destructive actions |
| `status.warning` | `#D98A16` | `#F0A83A` | "Sick leave" category, warnings |

**Derived tokens** (compute once in `tokens.ts`, never in screens):

| Token | Light | Dark | Why |
|---|---|---|---|
| `onAccent` | `#0B1A24` | `#0B1420` | Text/icons on `brand.accent`. **White on teal fails WCAG AA** — use dark ink |
| `accentInk` | `#0F6E6E` | = `brand.accent` | Teal text on light surfaces (links, active tab label) |
| `highlightInk` | `#8A6A00` | `#F4C542` | "Abroad" category icon/text (yellow is unreadable on white) |
| `hero.bg` | = `brand.primary` | `#152A36` | Hero cards (always dark, both themes) |
| `hero.text` / `hero.textMuted` | `#F4F7FA` / 72% | same | Text on hero |
| `hero.tile` | `#F4F7FA` @ 9% | same | Chips/buttons on hero |
| `hero.accent` | `#35C2C2` | same | Primary button on hero |
| `cmd.tint` / `cmd.ink` | `#FFF4D6` / `#7A5A00` | `#3A3113` / `#F4C542` | Commander-mode pill |
| `scrim` | `rgba(16,28,44,.44)` | `rgba(3,7,12,.66)` | Behind sheets/modals |
| `toast.bg` / `toast.fg` | `#17202B` / `#F4F7FA` | `#F4F7FA` / `#17202B` | Inverted toast |

**Tint rule (status/category chips, icon tiles):** background = role color at **14%** alpha (18% in dark); foreground = role color mixed **68%** with `text.primary` (keeps AA contrast on small text).

### 2.2 Category → color & icon
| Category code | Hebrew | Color token | Icon (lucide) |
|---|---|---|---|
| `at_unit` | נמצא/ת ביחידה | `status.present` | `map-pin` |
| `outside_unit` | מחוץ ליחידה | `brand.accentStrong` | `briefcase` |
| `annual_leave` | חופשה שנתית | `status.away` | `sunrise` |
| `sick_leave` | חופשת מחלה | `status.warning` | `thermometer` |
| `abroad` | חו"ל | `highlightInk` | `plane` |
| — (no report) | טרם דווח | `text.secondary` | `plus` |

### 2.3 Approval status
| Status | Label | Color | Icon |
|---|---|---|---|
| `approved` | אושר | `status.present` | `check` |
| `pending` | ממתין לאישור | `status.away` | `clock` |
| `missing` | טרם דווח / לא דיווח/ה | `status.missing` | `alert-triangle` |

### 2.4 Typography
Font: **IBM Plex Sans Hebrew** (400/500/600/700). Fallback: Heebo, system. Tabular numerals for times, dates and counts.

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `display` | 26–28 / 34 | 700 | Hero status ("נוכח/ת"), greeting |
| `title` | 20–22 / 28 | 700 | Screen title, sheet title |
| `heading` | 16–18 / 24 | 600–700 | Card titles, row names |
| `body` | 15–16 / 24 | 400–500 | Default |
| `caption` | 12–13 / 18 | 400–600 | Meta, chips, calendar labels |
Minimum 11px (calendar cell labels only); 13px everywhere else. Respect system font scaling.

### 2.5 Spacing, radius, elevation, motion
- **Spacing** (4-pt grid): 4, 8, 12, 16, 20, 24, 32. Screen side padding **16**. Card padding 16–24. Gap between sections 14–20.
- **Radius:** chips/buttons **999** (pill) · list cards **24** · hero cards **28** · sheets **28 top** · icon tiles **12–20** · calendar cells **14**.
- **Elevation:** `shadow.sm` (chips, icon buttons), `shadow.md` (cards), `shadow.lg` (sheets, modals, toasts, menus). Shadows are navy-tinted, never pure black; in dark mode cards use a 1px `border.subtle` instead of a visible shadow.
- **Motion:** 150–350ms, `cubic-bezier(.2,.8,.2,1)`. Screen content fades up 10px with 40ms stagger; sheets slide up; modals scale 0.9→1; press = scale 0.97. Respect **Reduce Motion**.

---

## 3. RTL rules
- `I18nManager.forceRTL(true)`. All layouts use logical start/end.
- **Start = right.** Screen title on the right; **account menu top-left**.
- "Forward" chevrons point **left** (`chevron-left`); "back" points right.
- Calendar weekday order right→left: א׳ ב׳ ג׳ ד׳ ה׳ ו׳ ש׳ (Sunday on the right).
- Numbers/dates/emails inside Hebrew text keep LTR (`writingDirection` / bidi isolation).
- Slash forms for gender: נוכח/ת, תהיה/י, חייל/ת.

---

## 4. App shell

### 4.1 Header (all screens)
Height 68, blurred `surface.base` @ 90%, bottom border `border.subtle`.
- **Right (start):** screen title (`title`) + **mode pill** under it.
  - Soldier mode: `surface.accent` bg, `accentInk` text, icon `user`, "מצב חייל".
  - Commander mode: `cmd.tint` bg, `cmd.ink` text, icon `users`, "מצב מפקד" **+ a 3px `brand.highlight` line under the header**.
- **Left (end):** **Account button** — pill with avatar (initials, navy bg, yellow text) + chevron-down; a 14px dot on the avatar shows the mode (teal = soldier, yellow = commander). `accessibilityLabel`: "תפריט משתמש · {name} · {mode}".

### 4.2 Account menu (popover, anchored top-left, 288 wide)
1. Avatar 48 + **name** + rank · unit
2. "מצב נוכחי" + mode pill
3. **Switch mode** row — "מעבר למצב מפקד" / "מעבר למצב חייל" with a one-line subtitle of what the other mode contains
4. **התנתקות** (red text)
Tap outside closes. Switching mode: closes menu, resets to that mode's first tab, toast "עברת למצב …". State of the other mode is preserved.

### 4.3 Bottom navigation
Height 88 (incl. safe area), blurred surface, 3 tabs (soldier) / 2 tabs (commander), icon in a 60×32 pill that fills with `surface.accent` when active; label 12/600.

| Mode | Tab 1 | Tab 2 | Tab 3 |
|---|---|---|---|
| Soldier | הדיווח שלי (`clipboard-check`) | דיווחים עתידיים (`calendar`) | הגדרות (`settings`) |
| Commander | הצוות (`users`, badge = pending count) | הגדרות | — |

"הדיווח שלי" appears **only in soldier mode**. To report for themselves, a commander switches to soldier mode from the account menu.

---

## 5. Components (`apps/mobile/components/`)

| Component | Variants / props | Notes |
|---|---|---|
| `AppHeader` | `title`, `mode` | §4.1 |
| `AccountMenu` | `user`, `mode`, `onSwitch`, `onLogout` | §4.2 |
| `ModePill` | `soldier` \| `commander` | Always icon + text |
| `TabBar` | `tabs`, `badge` | §4.3 |
| `HeroCard` | `notReported` \| `reported` | Navy card, soft teal glow top-left |
| `PillButton` | `primary` (teal, dark ink), `soft` (surface.accent), `ghost` (page bg), `danger` (red, white), `onHero` | Height 52–64, `loading` shows spinner + "שולח…/שומר…", `disabled` greys out |
| `IconButton` | `approve` (teal) \| `edit` (neutral) | 44×44, radius 14, required `accessibilityLabel` |
| `StatusBadge` | `approved` \| `pending` \| `missing` | Tint rule, icon + label |
| `CategoryIcon` | `category`, `size` | Tinted tile + icon, §2.2 |
| `Chip` | `default` \| `selected` (inverted: text.primary bg) + optional count | Height 38, horizontal scroll rows |
| `SegmentedControl` | 2–7 options, `disabled` | Page-tinted track, selected = raised surface |
| `TimePicker` | `value`, `disabled` | Field + dropdown of 24 hours (see §7.4) |
| `WeekTemplateStrip` | 7 days | Read-only mini week (weekday, category icon, short label; "—" for no fixed status) |
| `TemplateEditorSheet` | `from: setup \| edit` | See §7.8 |
| `ApplyTemplateSheet` | — | See §7.8 |
| `Switch` | on = teal | 52×32 |
| `SearchField` | `value`, `onClear` | Height 48–52, focus ring teal 4px @16% |
| `BottomSheet` | handle, title, eyebrow, back, close, sticky footer | 88% height for pickers |
| `Modal` | centered card, radius 28 | Soldier details |
| `ConfirmDialog` | `safe` \| `danger` | Always states the consequence and count |
| `Toast` | `success` \| `info` | Inverted, bottom 104, auto-hide 2.6s |
| `CalendarMonth` | see §7.3 | Tap to toggle, swipe to add a range, month back/forward |
| `WeekStrip` | 7 days | My Report "7 הימים הקרובים" |
| `SoldierRow` | see §7.5 | Row tap opens modal; inline approve/edit |
| `EmptyState` / `ErrorState` / `Skeleton` | — | Every list has all three |

---

## 6. Status taxonomy (UI labels)

| Category | Reasons (exact Hebrew labels) | Calendar short label |
|---|---|---|
| נמצא/ת ביחידה | נוכח/ת | נוכח |
| מחוץ ליחידה | בתפקיד מחוץ ליחידה · אחרי תורנות / משמרת · עובד/ת משמרות · הפניה רפואית · יום סידורים · משמרת ערב · אבט"ש · סבב קו · השתלמות מקצועית בארץ | תפקיד · תורנות · משמרות · רפואי · סידורים · ערב · אבט"ש · סבב קו · השתלמות |
| חופשה שנתית | חופשה שנתית · חופשת נהג/ת מבצעי/ת · חג עדתי · אזכרה – קרבה ראשונה | חופשה · נהג · חג · אזכרה |
| חופשת מחלה | חופשת מחלה (גימלים) · יום ד' | גימלים · יום ד' |
| חו"ל | השתלמות מקצועית בחו"ל · חופשת נהג/ת מבצעי/ת | חו"ל · נהג |

Search keywords (status picker): "חופש" → annual-leave & driver-leave reasons; "רפואה" → הפניה רפואית, גימלים, יום ד'; "משמרת" → אחרי תורנות/משמרת, עובד/ת משמרות, משמרת ערב.

---

## 7. Screens

### 7.1 הדיווח שלי — My Report (soldier & commander)
Top → bottom:
1. Greeting "שלום {first}" (`display`) + long date "יום שלישי, 22 בספטמבר".
2. **HeroCard**
   - **Not reported:** red dot "טרם דיווחת היום" · "איפה את/ה היום?" · **primary 64px button "נוכח/ת ביחידה"** (one tap → sends `at_unit/נוכח/ת`, spinner, toast "הדיווח נשלח · נוכח/ת") · secondary "סטטוס אחר ‹" → Status picker.
   - **Reported:** "הדיווח שלי להיום" + status badge (dot + אושר/ממתין לאישור) · category icon tile + reason (`display`) + category name · "עודכן HH:MM · ניתן לשנות עד 23:59" · primary "עדכון דיווח".
3. **Template setup card** (soldier mode, new users only — until the template is saved or dismissed): "חדש · הגדרה ראשונה" · "הגדר/י את השבוע הקבוע שלך" · WeekTemplateStrip with the default · "הגדרת השבוע" (opens TemplateEditorSheet in setup mode) · "לא עכשיו" / ✕.
4. **WeekStrip card** "7 הימים הקרובים" + "{n}/7 ימים קדימה מדווחים" + "ליומן ‹" (soldier mode). 7 tiles: weekday, date, category icon or `+`. Tap → Status picker for that day.

### 7.2 Status picker (bottom sheet, shared)
Used for: today, a single future day, a date range, and commander edits.
- **Header:** eyebrow (date / "24.9 – 27.9 · יום חמישי עד יום ראשון" / "{soldier} · היום") + title ("איפה את/ה היום?", "איפה תהיה/י מחר?", "דיווח ל-{n} ימים", "עריכת דיווח", "דיווח במקום").
- **Range only:** row of day chips (days that already have a report get a blue ring) + note "{k} מהימים כבר מדווחים — הדיווח יוחלף".
- **Search field** "חיפוש סטטוס" (hidden on level 2).
- **Level 1:** "חיפושים נפוצים:" chips (חופש · רפואה · משמרת) → large **quick "נוכח/ת"** card (radio) → "או בחר/י קטגוריה" → 2×2 category cards (icon, name, "{n} סוגי דיווח" or the chosen reason).
- **Level 2:** back arrow, category name as title, list of reasons as radio rows.
- **Search results:** flat list with category name under each reason; empty state "לא נמצא סטטוס עבור ״…״" + suggestion chips.
- **Future day that has a report:** "מחיקת הדיווח" (red, with confirm).
- **Sticky footer:** primary pill — "בחר/י סטטוס" (disabled) → "שמירה · {reason}" / "דיווח ל-{n} ימים · {reason}" / "שמירה ואישור · {reason}" (commander). Loading "שומר…".

### 7.3 דיווחים עתידיים — Future reports calendar (soldier mode)
0. **Template card** "התבנית השבועית שלי" (soldier mode): "{n} ימים קבועים בשבוע · חוזרת כל שבוע" + "עריכה" · WeekTemplateStrip · primary **"החלה על 8 הימים הקרובים ({k})"** → ApplyTemplateSheet · caption "היום + 7 ימים · 22.9 – 29.9 · ממלא רק ימים ריקים". When nothing can be added: "כל הימים בטווח כבר מדווחים".
1. Info note: "הקש/י על ימים כדי לסמן אותם, או **החלק/י** על כמה ימים ברצף. אחרי הסימון לחצ/י ״דיווח״. ניתן לדווח עד {date+7}."
2. **CalendarMonth card:** month title (with year) between two labelled buttons — "‹ {previous month}" and "{next month} ›" — to move one month back/forward (up to 12 months each way). "חזרה להיום" appears when not on the current month. Weekday header. 7-column grid, cell height 62.
3. Legend card: 5 category colors · pending dot · "ימים שסימנת" (teal) · "לא זמין (מעבר ל-7 ימים)".

**Cell states** — no day is highlighted by default; only days the user selects turn teal.

| State | Rule | Look | Tap |
|---|---|---|---|
| Past | `date < today` | muted number; report label in secondary text; tiny grey dot if no report | Read-only sheet: status, category, time, "ימים שעברו מוצגים לצפייה בלבד" |
| Today | `date == today` | number in a filled teal circle | Toggles selection |
| Can report | `today ≤ date ≤ today+7` | **same as a normal day** (no background); hover/press feedback only | Toggles selection |
| Disabled | `date > today+7` | 35% opacity, struck-through number | Toast "ניתן לדווח עד 7 ימים קדימה בלבד" |
| Has report | any | tinted short label (category color) | — |
| Pending | reportable day with pending report | 6px blue dot top-right | — |
| **Selected** | chosen by the user | solid teal cell, dark ink | — |

**Selection (multi-select, persistent)**
- **Tap** a reportable day → toggles it in/out of the selection. Days need not be consecutive.
- **Swipe** (press and slide) across reportable days → adds every day between the start and the current finger position to the selection; live counter banner "{n} ימים נבחרו". A swipe that **starts on an already-selected day erases** instead: every day it passes over is removed from the selection. Moving the finger back during a swipe shrinks the live range. A tap on a selected day removes it. Non-reportable days are skipped. Disable page scroll during the swipe; light haptic on each new day. Implement with `react-native-gesture-handler` Pan + hit-testing cell layouts.
- Selection is kept while navigating between months.
- **Selection bar** (appears above the tab bar when ≥ 1 day is selected): "{n} ימים נבחרו" · "ניקוי" · chips of the selected dates (days that already have a report get a blue ring) · primary **"דיווח לימים שנבחרו"** → Status picker for all selected days. Page bottom padding grows so the bar never hides content.
- Saving clears the selection; closing the picker without saving keeps it.
- Keyboard / screen reader: each cell is a toggle button labelled "{long date} · {status}"; the selection bar is a labelled region.

### 7.4 הגדרות — Settings (both modes)
Grouped cards:
1. **מראה:** segmented בהיר / כהה (sun/moon). Switch is instant and keeps the current screen.
2. **תזכורת יומית:** switch + subtitle "כל יום · 08:00 · רק אם טרם דיווחת".
   - Fires **every day**, including the weekly-reminder day (the weekly one is extra, in the evening).
   - Read-only day strip א׳–ש׳: active days in `surface.accent`; the weekly day in `cmd.tint` with a calendar icon + note "ביום {day} נשלחת גם התזכורת השבועית".
   - **TimePicker** (default 08:00).
3. **תזכורת שבועית:** switch + subtitle "כל יום שבת ב-20:00 · תזכורת למלא את השבוע הקרוב" + day segmented א׳–ש׳ (**default ש׳**) + **TimePicker** (default 20:00).

- Soldier mode: link "הצגת התזכורת השבועית (כולל ״החלת התבנית״)" previews the weekly push — title "הגיע הזמן למלא את השבוע הקרוב", body with week and how many days will be filled, actions **"החלת התבנית"** (opens ApplyTemplateSheet) / "אחר כך".
4. **התבנית השבועית** (soldier mode only): template card with WeekTemplateStrip + "עריכת התבנית הקבועה".

**TimePicker:** a field (clock icon · "שעה" · value in `title` size · chevron) that opens a dropdown listbox of **all 24 hours** (00:00–23:00) in a 4-column grid; selected hour = teal. Picking closes it. Disabled (50% opacity) when its reminder is off. In the native app this can be the platform time picker limited to whole hours.
Footer: version.

### 7.5 הצוות שלי — Team (commander mode)
1. **Summary hero:** progress ring "{pct}%" · "{reported}/{total} דיווחו · {approved} אושרו" · dots: נוכחים · מחוץ לבסיס · לא דיווחו.
2. **SearchField** "חיפוש חייל/ת".
3. **Filter chips** (horizontal scroll, each with count): הכל · נוכחים · מחוץ ליחידה · חופשה · מחלה · חו"ל · ממתינים לאישור · לא דיווחו.
4. Caption: "{n} מוצגים · {filter}".
5. **SoldierRow list** (card, dividers):
   - Avatar (initials, category-tinted) · **name** · category icon + reason (or red "לא דיווח/ה") · badge "✓ אושר" / "◷ ממתין · HH:MM".
   - Trailing: **Edit** (pencil; label "דיווח" for non-reporters) and **Approve** (teal check; disabled when approved or missing).
   - Row tap → Soldier modal.
6. **At the bottom of the list** (reached after scrolling through all soldiers): full-width primary pill **"אישור הכל ({k})"** (`check-check`) + caption "יאושרו רק הדיווחים הממתינים מתוך הרשימה המוצגת". Disabled "אין ממתינים לאישור" when k = 0.
7. Empty state: "אין חיילים שתואמים לסינון" + "ניקוי סינון".

**Approve all:** confirm dialog "לאשר {k} דיווחים?" — body names the active filter and search, and states that non-reporters are excluded. Approves **only pending rows currently shown**. Toast "אושרו {k} דיווחים".

### 7.6 Soldier modal (commander)
Centered card: avatar 60 + name + rank/team + close · status block (category tile, reason, category, "סטטוס" badge, "עודכן HH:MM") · actions: **אישור** (primary, disabled if not pending) + **עריכה** / **דיווח** (soft). Edit opens the Status picker for that soldier; saving marks the report approved and shows "הדיווח של {first} עודכן ואושר".

### 7.8 Recurring weekly template (soldier mode only)
**Model:** one template per user = 7 entries (Sun→Sat), each a status or *none*. **Default for new users:** א׳–ד׳ נוכח/ת · ה׳ חופשה שנתית · ו׳ נוכח/ת · ש׳ none. Reports created from the template are ordinary reports (flagged `fromTemplate`); **editing a single day never changes the template**, and **editing the template never changes existing reports**.

**TemplateEditorSheet** (from setup card, template card, settings, apply sheet):
- Title "השבוע הקבוע שלי" (setup) / "עריכת התבנית השבועית" (edit) + one-line explanation.
- 7 rows: weekday · category icon · "יום {day}" + status (or "ללא קבוע"). Tap → Status picker in template mode (title "יום {day} בתבנית", eyebrow "התבנית השבועית · חוזרת כל שבוע", extra button "ללא סטטוס קבוע ביום זה", footer "שמירה ביום {day} · {status}"). Choosing updates the draft only.
- Note: "שינוי התבנית לא משנה ימים שכבר דווחו. לשינוי יום בודד — ערכו אותו ביומן."
- Sticky "שמירת השבוע הקבוע" / "שמירת התבנית". Closing without saving discards the draft.

**ApplyTemplateSheet — "החלת התבנית על 8 הימים הקרובים":**
- The template stays a fixed Sunday→Saturday pattern. Target = **a rolling range: today + the next 7 days** (8 days). Each date gets the template value of its own weekday — e.g. on Tuesday: Tue, Wed, Thu, Fri, Sat, Sun, Mon, Tue.
- One row per day: weekday + date · status icon · status · tag:
  - **"יתווסף"** (teal) — empty day inside the window → will be filled from the template.
  - **"קיים דיווח · נשאר"** — already reported → kept as is (fill-empty-only). Takes precedence over the other tags.
  - **"ללא קבוע"** — template has no status for that weekday.
- Note: "כל יום מקבל את ערך התבנית של אותו יום בשבוע. ממלא רק ימים ריקים — ימים שכבר דיווחת נשארים כמו שהם."
- Primary "החלת התבנית על {k} ימים" (disabled "אין ימים להוספה" when k = 0) + link "עריכת התבנית הקבועה".
- Success toast: "התבנית הוחלה על {k} ימים · שינוי יום בודד לא ישנה את התבנית". Filled days appear in the calendar like any pending report and are edited the normal way.

**Entry points:** setup card (My Report, new users) · template card (Future Reports) · weekly reminder action · Settings. None of these appear in commander mode.

### 7.7 Logged out
Navy full screen, yellow "1" logo, "דוח 1", "התנתקת בהצלחה", "התחברות מחדש".

---

## 8. States & feedback (every screen)
| State | Pattern |
|---|---|
| Loading | Skeleton rows (shimmer) for lists; spinner inside the pressed button for actions |
| Empty | Icon in a soft circle + one line + one action |
| Error | Inline red banner with retry; toast for transient failures; selection is kept |
| Success | Toast (inverted) with a check that pops in |
| Disabled | Greyed + reason text (never silently disabled) |

Copy tone: short, direct, gender-neutral with slash forms, no exclamation marks.

---

## 9. Accessibility
- Touch targets ≥ 44×44; calendar cells 62 tall.
- Text contrast ≥ 4.5:1 (teal buttons use dark ink; category text uses the tint rule).
- Status = color + icon + text everywhere.
- Every icon-only button has an `accessibilityLabel` in Hebrew.
- Sheets/modals trap focus and close on scrim tap and on back.
- Reduce Motion disables slide/scale animations.

---

## 10. Mock data (prototype parity)
Today = Tuesday 22.9.2026. User "מאי לוי", סרן, מפקדת צוות ב׳, פלוגה ב׳ · גדוד 71. Team of 14 fictional soldiers with a mix of approved / pending / missing and every category. History from early August; future reports on +1, +2, +5, +6. **Fictional names only** (SECURITY.md §5).

---

## 11. Open decisions vs. SPEC.md (resolve before build)
| # | This design | SPEC.md today | Suggested resolution |
|---|---|---|---|
| 1 | Date-range reporting via drag | "One day per tap, no ranges" | Keep ranges in UI; API receives one PUT per day (no contract change) or add a bulk endpoint |
| 2 | Bottom tab bar + account menu top-left | Side menu (F7) | Replace F7 with this shell |
| 3 | "Approve all shown" button | Select mode + "אישור (n)" | Keep both, or approve-all only |
| 4 | Weekly reminder (default Saturday) | Daily reminder + nudge only | Add weekly reminder to F6 |
| 5 | Light/Dark in MVP | Dark mode after MVP | Tokens already support it |
| 6 | Recurring weekly template + "apply to next week" | "No ranges, no recurring" | Template is client-side convenience; applying = one PUT per filled day. Needs a `GET/PUT /settings/template` field |

---

## 12. Reference screenshots
Store exported PNGs (390×844 @2x) in `docs/design/screens/` and keep this list in sync:

| File | Screen |
|---|---|
| `01-my-report-not-reported.png` | 7.1 not reported |
| `02-my-report-reported.png` | 7.1 reported |
| `03-picker-level1.png` / `04-picker-level2.png` / `05-picker-range.png` | 7.2 |
| `06-calendar.png` / `07-calendar-selected.png` / `08-calendar-past-day.png` | 7.3 |
| `09-settings.png` | 7.4 |
| `10-team.png` / `11-team-filtered.png` / `12-approve-all-confirm.png` | 7.5 |
| `13-soldier-modal.png` | 7.6 |
| `14-account-menu-soldier.png` / `15-account-menu-commander.png` | 4.2 |
| `16-calendar-dark.png` / `17-team-dark.png` | Dark theme |
| `18-template-setup-card.png` / `19-template-editor.png` / `20-apply-template.png` / `21-weekly-reminder.png` | 7.8 |
