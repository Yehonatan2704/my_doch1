# TASKS.md — 24h build plan, built for parallel work

Designed so **5 developers/agents work at the same time without blocking or conflicting**.
Two rules make that possible:

1. **Contracts before code.** Wave 0 freezes `packages/shared` (types, Zod schemas, constants) and the API contract. After that, backend and frontend build against the contract, not against each other.
2. **One owner per file.** Every task lists the paths it owns. **Never edit a file another lane owns** — open a `CONTRACT-CHANGE` issue instead (see §5).

Priority: **P0** must ship · **P1** if time allows · **P2** cut first.

---

## 0. Task status — every dev and every agent follows this, every session

**`TASKS.md` on `main` is the only source of truth for what's done.** Status lives in the checkbox at the start of each task line:

| Marker | Meaning | Suffix to append to the line |
|---|---|---|
| `[ ]` | Todo | — |
| `[~]` | In progress (claimed) | ` — IN PROGRESS: @github-user, branch <branch>` |
| `[x]` | Done (merged to `main`) | ` — DONE: @github-user, PR #<n>` |
| `[!]` | Blocked | ` — BLOCKED: <reason>, @github-user` |

**The loop (agents run it automatically, without being asked):**

1. **Sync.** `git checkout main && git pull`, then `scripts/graphify.sh` (refreshes the code graph, 0 tokens). CLAUDE.md is already loaded. From this file, read §0, §1 and your lane's block only. Find your lane in §1.
2. **Pick the next task** — in your lane, top to bottom, the first `[ ]` task whose dependencies are `[x]`:
   - Dependencies = the lane's *needs …* note, anything the task text says it needs (e.g. "C1 first"), and the Wave 0 gate.
   - Among ready tasks: all P0 before P1, P1 before P2. Never skip a ready P0.
   - Nothing ready? Build against the mock/stub (§7 "stub, don't wait") or mark the waiting task `[!]` and take the next ready one.
3. **Claim it** before writing code: change `[ ]` → `[~]` with the suffix, commit only that line as `chore(tasks): claim <id>`, and push straight to `main` (`git pull --rebase` first; claims touch different lines, so they don't conflict). Then create your branch `<lane><task>-<slug>` from `main`.
4. **Do the task** per CLAUDE.md. Only touch files your lane owns.
5. **Mark it done in the task's own PR**: change `[~]` → `[x]` with the suffix and PR number, once the CLAUDE.md "done" checks pass (lint, typecheck, test, ran it, SPEC boxes true). Merge to `main`.
6. **Go back to step 1 immediately.** A session ends with the next task claimed or with nothing ready in the lane — never just "done".

Rules: only change the marker and suffix of **your own** task lines (never tick another lane's task). Don't un-claim someone else's `[~]` — ask them. If a task was split or changed, add a sub-bullet under it; don't rewrite its text.

---

## 1. Lanes (one owner each)

| Lane | Owner role | Owns these paths (exclusive write access) |
|---|---|---|
| **A — Platform** | Infra/lead | root configs, `packages/shared/**`, `db/**`, `.github/**`, deploy configs, `apps/api/src/server.ts`, `apps/api/src/plugins/**`, `apps/api/src/db/**` |
| **B — API core** | Backend 1 | `apps/api/src/modules/{auth,statuses,reports,documents,settings}/**` + their tests |
| **C — API commander** | Backend 2 | `apps/api/src/modules/{commander,emergency,push}/**` + their tests |
| **D — App core** | Frontend 1 | `apps/mobile/theme/**`, `apps/mobile/components/**`, `apps/mobile/i18n/**`, `apps/mobile/lib/**`, `apps/mobile/app/(auth)/**`, `apps/mobile/app/(soldier)/**` |
| **E — App commander** | Frontend 2 | `apps/mobile/app/commander/**`, `apps/mobile/components/commander/**`, `apps/mobile/hooks/commander/**` |
| **I — Integrations** (v2) | Backend | `apps/api/src/modules/integrations/**` + `apps/api/test/integrations.test.ts`, `apps/integrations-mock/**`. Contract/DB pieces (`packages/shared`, `db/init.sql`, `plugins/`) go through Lane A. |

**Fewer people?** Collapse in this order: B+C → one backend lane; D+E → one frontend lane; A folds into whoever starts first. The wave structure stays the same.

Shared-but-append-only files (add your block, never rewrite someone else's): `apps/mobile/i18n/he.ts`, `packages/shared/src/constants.ts`, `.env.example`. Lane A resolves conflicts in these.

---

## 2. Dependency graph

```
        ┌──────────── WAVE 0 (all hands, ~2h) ────────────┐
        │ A0.1 repo   A0.2 contracts   A0.3 db   A0.4 mock API │
        └───────────────────────┬─────────────────────────┘
                                │  contract frozen
        ┌───────────┬───────────┼───────────┬───────────┐
     Lane A      Lane B      Lane C      Lane D      Lane E
     deploy      auth        commander   design sys   commander UI
     CI          reports     emergency   soldier UI   (on mock API)
                 documents   push        (on mock API)
        └───────────┴───────────┼───────────┴───────────┘
                                │  SYNC POINT (h14): swap mock → real API
                         ┌──────┴──────┐
                      integrate     harden & ship
```

**Only two hard cross-lane dependencies:** everyone waits for Wave 0, and the frontend lanes swap from the mock API to the real one at the sync point. Nothing else blocks.

---

## 3. Wave 0 — contracts (h0–h2) · **everyone works on this, then split**

- [x] **A0.1 (P0, Lane A)** Monorepo: pnpm workspaces, `apps/api`, `apps/mobile`, `packages/shared`, TS strict, ESLint + Prettier, `.env.example` ×2, `pnpm -r lint/typecheck/test` scripts. Push `main`, protect it. — DONE: @AlonLevi12, PR #2
  - Branch protection isn't available for private repos on GitHub Free — rely on the PR habit instead.
- [x] **A0.2 (P0, Lane A)** **Freeze the contract** in `packages/shared`: — DONE: @AlonLevi12, PR #2
  - `constants.ts` — `DEADLINE_HOUR=11`, `EDIT_LOCK="23:59"`, `FUTURE_WINDOW_DAYS=7`, `NOTE_MAX=200`, `FILE_MAX_BYTES=5242880`, `ALLOWED_MIME`, `TZ="Asia/Jerusalem"`, status codes.
  - `schemas.ts` — Zod for every request/response body in SPEC §6.
  - `types.ts` — inferred types only.
  - Publish as `@doch1/shared`. **After this task the contract only changes via §5.**
- [x] **A0.3 (P0, Lane A — owner: @AlonLevi12, needs the Supabase account)** Supabase project: run `db/init.sql`, enable Google auth provider, create private bucket `sick-documents`, replace seed emails with the team's Google accounts, share `DATABASE_URL` + keys via the secret store (never chat). Publish the four test logins (battalion / company / team commander / plain soldier). — DONE: @AlonLevi12, PR #9
  - `db/init.sql` run as-is (18 users, 495 reports, RLS on all 13 tables, 0 policies — confirmed via anon-key REST calls returning `[]`). Real emails swapped via a one-off `UPDATE` on Supabase only, never committed. Private bucket `sick-documents` created (5MB limit, jpeg/png/pdf only). Google auth provider + redirect URLs, `DATABASE_URL`/keys sharing, and CI DB config are still owner-dashboard steps — see PR description.
- [x] **A0.4 (P0, Lane A)** **Mock API** — this is what unblocks the frontend lanes. A tiny in-repo mock (MSW handlers in `apps/mobile/lib/mock/`, seeded from the same fixtures) answering every route in SPEC §6 with contract-valid data, toggled by `EXPO_PUBLIC_USE_MOCK=1`. Lane A owns it; D and E consume it from minute one. — DONE: @AlonLevi12, PR #2
  - Verified on web + in tests. Not yet run on a real iOS/Android device.

**Gate:** Wave 0 is done when `pnpm -r typecheck` passes, the Supabase DB is seeded, and `EXPO_PUBLIC_USE_MOCK=1` returns data for `/me`, `/statuses`, `/reports/today`, `/commander/groups/:id/reports`. Announce it — the other lanes start on this signal.
- **Gate status:** typecheck ✔ · mock ✔ · Supabase ✘ (A0.3). Frontend lanes (D, E) don't need Supabase — **they may start**. Backend lanes (B, C) may start against a **local Postgres** (CLAUDE.md → Commands) until A0.3 is done.

---

## 4. Waves 1–3 — parallel build

### Lane A — Platform (h2–h20)
- [x] **A1 (P0)** API skeleton + plugins: helmet, CORS allowlist, rate-limit, pino with redaction, central error handler, Drizzle connection, `drizzle:pull`. Merge early — B and C build on top of it. — DONE: @AlonLevi12, PR #2
  - Auth hook is a deny-all stub at `apps/api/src/modules/auth/authenticate.ts` — **B1 replaces its body**.
- [x] **A2 (P0)** Mobile skeleton: Expo Router layout, forced RTL, Heebo font, `theme/tokens.ts` from DESIGN.md, typed `lib/api.ts` client (bearer token + mock switch). — DONE: @AlonLevi12, PR #2
  - `setTokenProvider()` in `lib/api.ts` is where D2 plugs in the Supabase session.
- [x] **A3 (P0)** Deploy both: API → Render, web export → Vercel. Env vars, CORS origins, Supabase redirect URLs. **Working deploy by h6** so integration problems surface early, not at h22. — DONE: @AlonLevi12, PR #26
  - Web moved from Vercel to a Render static site (`doch1-web`): Vercel's free plan can't deploy private org repos. Both services are in `render.yaml`; CLAUDE.md → Deploy.
  - Live: web https://doch1-web.onrender.com (mock on) · API https://doch1-api.onrender.com/api/v1 (free plan: first request after idle takes ~1 min).
- [x] **A4 (P1)** CI: `lint + typecheck + test` on every PR, `pnpm i --frozen-lockfile`, secret scan (gitleaks). — DONE: @AlonLevi12, PR #4
  - CI runs the API's DB tests against Postgres + `init.sql`. Every PR into `main` must be green before merge.
- [x] **A5 (P0, h14)** Run the **sync point**: flip the frontend to the real API, fix contract drift, keep the mock working for tests. — DONE: @AlonLevi12, PR #32
  - Contract test `apps/api/test/contract.test.ts` (runs in CI): every SPEC §6 route parsed with the shared schemas + seeded numbers equal the mock's. One drift found and fixed: the commander list included the commander (SPEC §9 row 26). Live web switched to `EXPO_PUBLIC_USE_MOCK=0`.

### Lane B — API core (h2–h14) · *needs A1*
- [x] **B1 (P0)** Auth plugin + `/me`: verify Supabase JWT (signature, exp, aud, iss), map email → `users`, 403 unknown/inactive, `request.user`. *(F1)* — DONE: @bennathanzon-hub, PR #7
- [x] **B2 (P0)** `GET /statuses` — categories + reasons, commander-only filtered out for soldiers. — DONE: @bennathanzon-hub, PR #12
- [x] **B3 (P0)** Reports: `GET /reports/today`, `GET /reports?from&to`, `PUT /reports/:date`, `DELETE /reports/:date`. **All rules server-side** in Asia/Jerusalem: 7-day window, 23:59 lock, past days locked, **finalized days locked**, document required for גימלים, note only on allowed reasons, stage-1 approval resets on edit, audit row in the same transaction. Responses expose both stages (`approved*`, `finalized*`). *(F2–F5)* — DONE: @bennathanzon-hub, PR #13
- [x] **B4 (P0)** `POST /documents`: multipart, magic-byte type check, 5MB, server-generated path, private bucket. *(F3)* — DONE: @bennathanzon-hub, PR #16
- [x] **B5 (P1)** `GET/PUT /settings`. *(F6)* — DONE: @bennathanzon-hub, PR #17
- [x] **B6 (P0)** Tests: time-rule table (before/after 11:00, 23:59 edge, +7/+8 days), document-required, note-not-allowed, and one 401 + one 403 case per route. — DONE: @bennathanzon-hub, PR #18

### Lane C — API commander & emergency (h2–h16) · *needs A1*
- [x] **C1 (P0)** `assertCanActOn(actorId, target)` — commander subtree **or** HR assigned-unit subtree (both recursive CTEs) + `GET /commander/groups` tree. **Write this first — every other C task depends on it.** — DONE: @edo24edo, PR #6
- [x] **C2 (P0)** `GET /commander/groups/:groupId/reports?date&includeSub&pending` — rows, counts, star pinning, search/filter (allowlisted sort columns, escaped LIKE). *(F8)* — DONE: @edo24edo, PR #8
- [x] **C3 (P0)** Actions: `POST /commander/reports/approve` (bulk ≤200, all-or-nothing), `PUT /commander/soldiers/:userId/reports/:date` (edit + report-for, commander-only reasons allowed), `GET /commander/documents/:id/url` (60s signed URL), favorites. Audit every write. *(F9)* — DONE: @edo24edo, PR #10
- [x] **C4 (P1)** Emergency: `POST /commander/emergencies`, `GET /commander/emergencies/:id`, `POST .../end`, `GET /emergencies/active`, `POST /emergencies/:id/respond`. One open event per group. *(F10)* — DONE: @edo24edo, PR #14
- [x] **C5 (P1)** `POST /push-tokens` + send push on emergency start and on commander-edited report (no personal data in the text). — DONE: @edo24edo, PR #20
  - Delivery is **unverified against Expo**: no device and no credentials yet. The send path is exercised with a mocked `fetch`, so the payload and the fan-out are tested, but a real push has never left the building.
- [x] **C7 (P0)** HR (משא"ן) permissions — **API only, no UI**: HR passes `assertCanActOn` via `hr_assignments`; HR-only powers (edit past days, `POST /hr/reports/finalize`, `DELETE /hr/reports/:id/finalize`) gated on `role='admin'`; finalized days become read-only for soldier and commander; `source='hr'` + audit on every HR write. *(F9b)* — DONE: @edo24edo, PR #11
  - The `/hr/*` routes live in `modules/commander/` — Lane C owns that folder, and the lane table has no `hr` module. The URLs match SPEC §6 either way.
  - **Read-only-for-the-soldier is left to B3**: `PUT`/`DELETE /reports/:date` are Lane B's files. The commander and HR sides are enforced and tested here; B3 must reject a soldier editing a finalized day with `DAY_FINALIZED`.
- [x] **C6 (P0)** Tests: **for every route, a commander from another branch gets 403, and an HR user from another unit gets 403**; a commander calling an HR-only route gets 403; bulk approve/finalize with one out-of-scope id rejects the whole call; a soldier editing a finalized day gets 403. — DONE: @edo24edo, PR #15
  - The sweep lives in `apps/api/test/access-matrix.test.ts` and is table-driven: a test compares the table against Fastify's router, so **a new Lane C route with no matrix row fails the build**.
  - *A soldier editing a finalized day* is **not covered here** — `PUT /reports/:date` is B3's route and did not exist yet. It belongs to B6.

### Lane D — App core (h2–h18) · *needs A0.4 mock, A2*
- [x] **D1 (P0)** Design system from DESIGN.md: `TopBar`, `PillButton`, `HeroAction`, `CategoryTile`, `OptionRow`, `StatusCard`, `Countdown`, `Banner`, `Toast`, `EmptyState`, `ErrorState`, `Skeleton`. **Merge by h5** — Lane E imports these. — DONE: @bennathanzon-hub, PR #21
- [x] **D2 (P0)** Login + not-registered screens. *(F1)* — DONE: @bennathanzon-hub, PR #22
- [x] **D3 (P0)** Home, both states + one-tap "אני בבסיס" + refresh on app focus. *(F2)* — DONE: @bennathanzon-hub, PR #23
- [x] **D4 (P0)** Report flow: category → reason → note → document upload → send; also used for future dates and "change report". *(F3)* — DONE: @bennathanzon-hub, PR #25
- [x] **D5 (P0)** `CalendarMonth` component + Future reports screen (only +1…+7 active, edit/delete). *(F4)* — **`CalendarMonth` is shared with D6; build it once, here.** — DONE: @bennathanzon-hub, PR #27
- [x] **D6 (P0)** History screen: month view, red ring, 📎, day detail sheet. *(F5)* — DONE: @bennathanzon-hub, PR #29
- [x] **D7 (P1)** Side menu + Settings screen. *(F6, F7)* — DONE: @bennathanzon-hub, PR #30
- [x] **D8 (P2)** Local reminder + nudge scheduling, cancelled when the user reports. *(F6)* — DONE: @bennathanzon-hub, PR #31
  - Not yet verified on a real phone — check a reminder fires and stops after reporting during S2.

### Lane E — App commander & emergency (h5–h20) · *needs D1 components, A0.4 mock*
- [x] **E1 (P0)** Commander list screen: danger banner, group tree selector, date selector, two tabs, search, filter, summary chips, `SoldierRow` with star pinning. *(F8)* — DONE: @Edoalon, PR #33
- [x] **E2 (P0)** Soldier detail + edit sheet; document viewer. *(F9)* — DONE: @Edoalon, PR #34
- [x] **E3 (P0)** Approve single + bulk select mode with sticky "אישור (n)". *(F9)* — DONE: @Edoalon, PR #35
- [x] **E4 (P0)** Report-for-non-reporter from a "לא דיווח/ה" row. *(F9)* — DONE: @Edoalon, PR #36
- [x] **E5 (P1)** Emergency: commander toggle + confirm dialog + live view (5s polling); soldier `EmergencySheet`. *(F10)* — DONE: @Edoalon, PR #38
- [x] **E6 (P1)** "Not a commander" state. *(F8)* — DONE: @Edoalon, PR #37

### Lane I — Integrations (v2, after S3) · *mock external systems → automatic reports (SPEC F11, F12)*
- [x] **I1 (P1, Lane A files)** Contract + DB: integration constants/schemas/error codes in `packages/shared`, `reports.source` += `cpr`/`people_digital`, two inactive system users in `db/init.sql`, `drizzle:pull`, redact `x-integration-key`, keys in `.env.example` + `render.yaml`. — DONE: @bennathanzon-hub, PR #44
- [x] **I2 (P1)** `modules/integrations`: per-system `X-Integration-Key` auth, `GET /integrations/soldiers`, `POST /integrations/cpr/sick-leave`, `POST /integrations/people-digital/annual-leave` (overwrite, audit, notify). *(F11, F12)* — DONE: @bennathanzon-hub, PR #44
- [x] **I3 (P1)** Tests `apps/api/test/integrations.test.ts`: key scoping (401), validation, window, overwrite of finalized days, idempotency, directory filtering. — DONE: @bennathanzon-hub, PR #44
- [x] **I4 (P1)** Docs: SPEC F11/F12 + §6 + §9, SECURITY §15, CLAUDE.md env. The fake CPR / אנשים בדיגיטל app lives **outside this repo**. — DONE: @bennathanzon-hub, PR #44
  - Changed by I5: the fake website now lives in this repo, `apps/integrations-mock` (its own Render service).
- [x] **I5 (P1)** Fake external-systems website apps/integrations-mock + Render service. *(F11, F12)* — DONE: @bennathanzon-hub, PR #45
- [x] **I6 (P2)** Mock website: pick the soldier from a dropdown (all active soldiers, grouped by unit) instead of search-as-you-type. — DONE: @bennathanzon-hub, PR #47

### Lane N — NFC speedgate (v2) · *card taps at the base gate → presence reports (SPEC F13)*
- [x] **N1 (P1, Lane A files)** Contract + DB: NFC tables in `db/init.sql` (+ additive `db/migrations/002_nfc_speedgate.sql`), `reports.source` += `nfc`, shared schemas/constants/error, `isChangedByOther`. — DONE: @AlonLevi12, PR #52
- [x] **N2 (P1)** `modules/nfc`: reader provisioning, card enroll/revoke (HR-scoped), reader-authenticated `POST /speedgate/scans` with idempotency, duplicate window, multi-day reconciliation. Tests `apps/api/test/nfc.test.ts`. — DONE: @AlonLevi12, PR #52
- [x] **N3 (P1)** `apps/nfc-reader` gate mode: serial-only read, Keystore-encrypted token, HTTPS POST with idempotent retries, result screen. — DONE: @AlonLevi12, PR #52
- [ ] **N4 (P1, owner)** Run the migration on Supabase, provision a reader, enroll a test card, and verify entry/exit on a real phone. *needs N1–N3 merged + deployed*
- [ ] **N5 (P2)** HR screens for readers and card enrollment (API only today).

---

## 5. Changing the contract mid-build

Contract drift is the one thing that can break parallel work. The rule:

1. Anyone who needs a change to `packages/shared` opens an issue titled `CONTRACT-CHANGE: <what>` and **pings the affected lanes**.
2. **Only Lane A edits `packages/shared`.**
3. Lane A ships the change with **both shapes accepted** where possible, updates the mock in the same PR, and announces it.
4. Affected lanes adapt within the next task, not mid-task.

Never work around a contract mismatch by editing the other lane's files or by parsing a shape the contract doesn't describe.

---

## 6. Integration & shipping (h14–h24)

- [x] **S1 (P0, h14, Lane A)** Sync point: `EXPO_PUBLIC_USE_MOCK=0`, run both frontends against the real API, log every mismatch as `CONTRACT-CHANGE`. Timebox to 90 minutes. — DONE: @AlonLevi12, PR #32
  - Soldier app (D) run end-to-end against the real API + seeded DB: login session → home → one-tap report (row + audit written) → history. Lane E starts after the sync point, so it builds against the real API directly (the mock stays available for tests / `EXPO_PUBLIC_USE_MOCK=1`).
- [ ] **S2 (P0, all)** Journey test on a real phone (Expo Go) + web:
  soldier — log in → one-tap report → change to "elsewhere" with a document → schedule +3 days → see history;
  commander — see the group → approve in bulk → edit a report → report for a non-reporter → run and end an emergency.
- [x] **S3 (P0, Lane A + reviewers)** SECURITY.md PR checklist on **every** endpoint. Findings are fixed by the owning lane. — DONE: @AlonLevi12, PR #39
  - Checklist run on every endpoint (details in the PR). 1 finding fixed: HR-only powers (past-day edits, finalize) were gated on `role='admin'` + `can_act_on` (commander **or** HR scope), so an admin who also commands a group got HR powers over soldiers they only command. Now admin **and** `is_in_hr_scope` (SECURITY.md §4); regression test `apps/api/test/s3-security.test.ts`. Accepted: 2 moderate `decode-uri-component` advisories via Expo (client-side, no high/critical).
- [~] **S4 (P0, Lane A)** Final deploy + smoke test on the deployed URLs. — IN PROGRESS: @AlonLevi12, branch s4-final-smoke
  - `scripts/smoke.sh` (17 read-only checks of the live web + API). First run on the current deploy: all green. **Remaining:** run it once more after the last PRs (incl. Lane E) are merged and deployed, then mark `[x]`.
- [ ] **S5 (P1, D & E)** Empty / error / loading states everywhere; Hebrew copy review.

---

## 7. Working agreements

- Branch per task: `<lane><task>-<slug>`, e.g. `b3-reports-api`. Small PRs, merge to `main` **at least every 3 hours** — long-lived branches are how a 24h build dies.
- A task is done when: its SPEC acceptance boxes pass, `lint`/`typecheck`/`test` are green, and you ran it (API: curl or test; UI: web preview).
- Post a one-line status every 2 hours: `lane · task · state · blocked by`.
- Blocked more than 20 minutes → say so in the channel and pick up the next task in your lane. Never sit waiting.
- Stub, don't wait: if a dependency isn't ready, use the mock and add `// TODO(contract)`.

**Cut order if you're behind:** D8 → C5 → C4/E5 (emergency) → D7 → E4.
Never cut: B1 (auth), B3 (reports rules), C1/C6/C7 (access control), S3 (security pass).
