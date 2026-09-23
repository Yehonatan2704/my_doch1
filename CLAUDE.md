# CLAUDE.md — Rules for coding agents

Source of truth, in priority order: **CLAUDE.md → SPEC.md → SECURITY.md → DESIGN.md → TASKS.md**.
SPEC.md says *what*, this file says *how*. If they conflict, stop and ask.
**Don't read them end to end** — follow the Token rules below and read only the sections your task touches.

## Token rules (graphify) — apply to every prompt, including your first

A knowledge graph of the whole repo (code + these docs) lives in `graphify-out/`. It is built locally for free: a SessionStart hook (`.claude/settings.json`) runs `scripts/graphify.sh`, which installs graphify on first use and rebuilds the graph in ~2s with **0 LLM tokens**. If the hook's `graphify: graph ready` line is missing from your context, run `scripts/graphify.sh` once yourself.

1. **Locate before you read.** Before opening files to understand or change something, run
   `scripts/graphify.sh query "<3–6 concrete terms>" --budget 800` — it returns `file:line` for the relevant symbols and docs. Then read only those files/line ranges (`Read` with `offset`/`limit`), not whole folders.
   - Use real identifiers when you know them (`approveReports`, `assertCanActOn`, `reports`, `BULK_MAX`, `F4`, `C3`) — matching is by substring, no synonyms.
   - Other lookups: `explain "<symbol>"` (what it is + neighbours), `path "<A>" "<B>"` (how A reaches B), `affected "<symbol>"` (**run before editing a shared symbol** — what else breaks).
   - If a query returns nothing useful, fall back to `grep -rn`/Glob — don't widen the budget past 2000.
2. **Docs by section, not whole.** Get a doc's outline with `grep -n '^#' SPEC.md` (or a query like `"F4 future reports"`), then read just that section. For TASKS.md: §0, §1, your lane's block, and the task line. SECURITY.md still binds in full — read every section that touches what you change.
3. **Don't load the `/graphify` skill for routine lookups** — the script above is enough and far cheaper. Use the skill only for step 5.
4. **Don't read `graphify-out/graph.json` or `graph.html`**, and don't delegate plain lookups to subagents — one query is cheaper.
5. **Keep the shared doc cache fresh.** Code changes need nothing (the graph rebuilds from code for free). If your PR changes a doc the graph reads (`*.md`, `render.yaml`, `.github/workflows/*.yml`), run `/graphify . --update` before opening the PR and commit the new files it adds under `graphify-out/cache/semantic/`. Nothing else in `graphify-out/` is committed (it is gitignored).

**Then run the task loop in TASKS.md §0 — automatically, every session, without being asked:** pull `main` → pick the next ready task in your lane (dependencies `[x]`, P0 first) → claim it (`[~]`, pushed to `main`) → build it → mark it `[x]` in its own PR → pick the next one. Never finish a session without updating the status of the task you worked on.

## Stack (fixed — do not swap libraries without approval)

| Layer | Choice | Why |
|---|---|---|
| Mobile + web | **Expo (React Native) + Expo Router + TypeScript** | One codebase: iOS, Android, and a static web export |
| Data fetching | TanStack Query | Caching, refetch on focus |
| Forms/validation | Zod (shared schemas) | Same rules client + server |
| Backend | **Fastify + TypeScript** | Lighter and faster to ship than Nest for a 24h MVP; first-class schema validation |
| DB access | **Drizzle ORM** (`drizzle-kit pull` from DB) | Typed, parameterized queries by default |
| Database | **Supabase Postgres** | Schema + mock data in `db/init.sql` (source of truth) |
| Auth | **Supabase Auth — Google provider** | Frontend gets session; backend verifies JWT |
| Files | Supabase Storage, private bucket `sick-documents` | Backend-only access, signed URLs |
| Push | Expo Notifications (local reminders + remote push for emergency/changes) | |
| Deploy | Web (static site) + API → **Render**, DB → **Supabase** | One Blueprint (`render.yaml`); Vercel's free plan can't deploy private org repos |

## Repo structure

```
/
├─ CLAUDE.md  SPEC.md  DESIGN.md  SECURITY.md  TASKS.md
├─ db/init.sql                 # schema + mock data (run manually)
├─ apps/
│  ├─ mobile/                  # Expo app
│  │  ├─ app/                  # Expo Router screens
│  │  │  ├─ (auth)/login.tsx
│  │  │  ├─ (soldier)/index.tsx  report.tsx  future.tsx  history.tsx  settings.tsx
│  │  │  └─ commander/index.tsx  soldier/[id].tsx  emergency/[id].tsx   # real segment: /commander/… (a group would collide with (soldier)/index at "/")
│  │  ├─ components/           # design-system components (see DESIGN.md)
│  │  ├─ lib/api.ts            # typed fetch client (adds bearer token)
│  │  ├─ lib/mock/             # MSW mock API — unblocks frontend before the backend exists
│  │  ├─ lib/supabase.ts       # auth only (anon key)
│  │  └─ theme/tokens.ts
│  ├─ api/                     # Fastify
│  │  ├─ src/server.ts
│  │  ├─ src/plugins/          # auth, db, security (helmet, cors, rate-limit)
│  │  ├─ src/modules/<feature>/{routes,service,schemas}.ts
│  │  ├─ src/db/schema.ts      # generated by drizzle-kit pull
│  │  └─ test/
│  ├─ integrations-mock/       # fake CPR / אנשים בדיגיטל website (I5) — own Render service, never touches the DB
│  │  ├─ src/server.ts         # Basic Auth, adds X-Integration-Key, relays to /api/v1/integrations/*
│  │  └─ public/               # plain HTML/JS/CSS UI, no bundler
│  └─ nfc-reader/              # native Android gate reader (Java, Gradle) — speedgate mode, SPEC F13; see its README
└─ packages/shared/            # zod schemas, types, constants (statuses codes, limits)
```

Package manager: **pnpm workspaces**. Node 24 LTS (`.nvmrc`).

## Environment variables

`apps/api/.env` (Render):
```
DATABASE_URL=            # Supabase pooler URL (port 6543), sslmode=require
SUPABASE_URL=
SUPABASE_JWT_SECRET=     # or use JWKS from SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=   # storage only — never sent to the client
CORS_ORIGINS=https://doch1-web.onrender.com,http://localhost:8081
TZ_APP=Asia/Jerusalem
INTEGRATION_CPR_KEY=            # external systems (SPEC F11/F12), ≥32 chars, one per system; empty = disabled
INTEGRATION_PEOPLE_DIGITAL_KEY=
NFC_CARD_HMAC_SECRET=    # ≥32 random bytes; keys NFC card fingerprints (Render generates it). Changing it orphans every enrolled card
```
`apps/mobile/.env` (Render static site / EAS):
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_URL=https://<api>.onrender.com/api/v1
EXPO_PUBLIC_USE_MOCK=1        # 1 = mock API (before the sync point), 0 = real API
```
`apps/integrations-mock/.env` (Render service `doch1-integrations`; no DB or Supabase values, ever):
```
PORT=4000                                   # Render sets PORT
DOCH1_API_URL=http://localhost:3000/api/v1  # Render: https://doch1-api.onrender.com/api/v1
CPR_API_KEY=                                # = INTEGRATION_CPR_KEY on the API (≥32 chars)
PEOPLE_DIGITAL_API_KEY=                     # = INTEGRATION_PEOPLE_DIGITAL_KEY on the API
MOCK_USER=                                  # Basic Auth for the whole site
MOCK_PASSWORD=                              # ≥16 chars
```
Only `EXPO_PUBLIC_*` values may reach the client. Never commit `.env` files; keep `.env.example` updated.

## Commands
```
scripts/graphify.sh             # install (first run) + rebuild the code graph — runs automatically at session start
scripts/graphify.sh query "<terms>" --budget 800   # find file:line before reading code
pnpm i
pnpm --filter api dev          # http://localhost:3000
pnpm --filter mobile start     # Expo
pnpm --filter mobile web       # web preview
pnpm -r lint && pnpm -r typecheck && pnpm -r test
psql "$DATABASE_URL" -f db/init.sql   # or paste into Supabase SQL editor (DROPS ALL DATA — fresh DB only)
psql "$DATABASE_URL" -f db/migrations/001_week_template.sql  # existing DB: additive, keeps data, re-runnable
psql "$DATABASE_URL" -f db/migrations/002_nfc_speedgate.sql  # existing DB: NFC speedgate tables (F13), additive, re-runnable
pnpm --filter api drizzle:pull # regenerate src/db/schema.ts after DB changes

# Local Postgres (optional — lets backend lanes work and test before/without Supabase)
docker run -d --name doch1-pg -e POSTGRES_PASSWORD=dev -p 54329:5432 postgres:17-alpine
psql postgres://postgres:dev@localhost:54329/postgres -f db/init.sql
# then in apps/api/.env:  DATABASE_URL=postgres://postgres:dev@localhost:54329/postgres
```
`pnpm --filter api test` skips DB tests unless `DATABASE_URL` is set.
Web build: `npx expo export -p web` → output `dist/` (what Render's static site runs).

## Deploy (Lane A)
- **API → Render** from the Blueprint `render.yaml` (Frankfurt; auto-deploys when CI on `main` passes). Secrets are entered in the Render dashboard, never in the repo.
- **Web → Render static site `doch1-web`**, same Blueprint (SPA rewrite + security headers in `render.yaml`). Env: the `EXPO_PUBLIC_*` vars, baked in at build time; `EXPO_PUBLIC_USE_MOCK=1` until the sync point (A5), then `0`.
- **Fake external systems → Render web service `doch1-integrations`**, same Blueprint (`apps/integrations-mock`, see its README). Its keys must equal the API's `INTEGRATION_*` keys.
- **Supabase Auth → URL Configuration:** Site URL = `https://doch1-web.onrender.com`; Redirect URLs = `doch1://**`, `https://doch1-web.onrender.com/**`, `http://localhost:8081/**`.
- **After every deploy:** `scripts/smoke.sh` — read-only checks of the live web + API (health, auth, contract errors, CORS, SPA routes, security headers, API URL in the bundle, no secrets). Exit 0 = OK.
- API `CORS_ORIGINS` is set in `render.yaml` to the web app's URL + `http://localhost:8081`. If Render gives `doch1-web` a different URL, update it there.

## Parallel work (several agents at once)

TASKS.md splits the build into 5 lanes. Before starting, find your task's lane and obey it:

- **Write only inside the paths your lane owns** (TASKS.md §1). If you need something in another lane's files, open a `CONTRACT-CHANGE` note in your summary instead of editing it.
- **`packages/shared` is frozen after task A0.2** and may only be changed by Lane A. Everyone else imports from `@doch1/shared` and never redefines a type, schema or constant locally.
- **Until the sync point, the frontend runs against the mock API** (`EXPO_PUBLIC_USE_MOCK=1`). Never block on a backend task; build against the contract and the mock.
- `apps/mobile/i18n/he.ts`, `packages/shared/src/constants.ts` and `.env.example` are append-only: add your block at the end, never rewrite existing entries.
- **Branching: `main` only.** For every task: `git checkout main && git pull`, then create a feature branch from `main` named `<lane><task>-<slug>` (e.g. `b3-reports-api`), and open the PR **into `main`**. Never branch from or open PRs into `dev` (unused). Merge to `main` at least every 3 hours.
- In your summary, state: lane, task id, files created/changed, contract changes needed, SPEC boxes now passing.

## Working rules for agents

1. **One task = one feature from TASKS.md.** Don't touch unrelated files.
2. Before saying "done": `lint`, `typecheck`, `test` pass, and you ran the feature (API: curl/test; UI: web preview).
3. Every acceptance checkbox in SPEC.md for that feature must be true. Quote them in your summary.
4. **Server enforces all rules** (deadlines, 7-day window, subtree access, document required). Client checks are UX only.
5. Shared constants (limits, codes, deadline hour) live in `packages/shared` — never hard-code them twice.
6. Hebrew UI, **RTL forced** (native: `expo-localization` `forcesRTL` in `app.json`; web: `<html dir="rtl">` set in `app/_layout.tsx`); all strings in `apps/mobile/i18n/he.ts`.
7. Time logic uses `Asia/Jerusalem` explicitly (use `date-fns-tz`). Never rely on the server's local time.
8. Schema changes: edit `db/init.sql`, re-run it, then `drizzle:pull`. No other migration tool in MVP.
9. Follow **SECURITY.md** — it overrides convenience. Never weaken auth, validation, or RLS to "make it work".
10. If something in SPEC is ambiguous: pick the simplest option, mark it `// ASSUMPTION:` in code and add a row to SPEC §9.
11. Small commits with clear messages: `feat(api): approve reports in bulk`.

## Backend conventions
- **A module = a folder `src/modules/<feature>/` with a `routes.ts` that default-exports a Fastify plugin.** `server.ts` finds and mounts it under `/api/v1` automatically — never edit `server.ts` to register routes.
- **Every route requires a logged-in user by default.** Only `config: { public: true }` opts out (just `/health` today). Auth lives in `modules/auth/authenticate.ts` (B1) and sets `request.user = { id, role }`.
- Validate with the shared schemas: `const body = validate(putReportBodySchema, request.body)` (`plugins/errors.ts`) → 400 on failure.
- Fail with `throw new ApiError('DAY_LOCKED')` — status and Hebrew message come from `ERROR_HTTP` in `@doch1/shared`. Anything else thrown becomes a 500 `INTERNAL` with no details.
- DB: `import { db } from '../../db/client'` (Drizzle, typed from `src/db/schema.ts`). Per-route rate limits go in the route's `config: { rateLimit: { max, timeWindow } }`.
- Each module: `schemas.ts` (Zod) → `routes.ts` (thin; validate, call service) → `service.ts` (logic + DB).
- `request.user` is set by the auth plugin only; services receive `userId` from it — **never from body/params for "self" actions**.
- Any route that touches another user's data calls `assertCanActOn(actorId, soldierId | groupId)` first — it covers both commanders (group subtree) and HR (assigned-unit subtree). HR-only routes (past-day edits, finalize) also assert `role='admin'`.
- Write to `report_audit` inside the same transaction as any report change.
- Return shape: success → data object; error → `{ error: { code, message } }` with correct HTTP status.

## Frontend conventions
- **All server calls go through `api.*` in `lib/api.ts`** (typed from `@doch1/shared`; waits for the mock when `EXPO_PUBLIC_USE_MOCK=1`; throws `ApiError { status, code, message }` whose `message` is safe Hebrew to show). Never call `fetch` directly.
- TanStack Query is set up in `app/_layout.tsx` (refetch on focus/foreground already wired). Wrap `api.*` calls in `useQuery`/`useMutation` hooks.
- Styles use `theme/tokens.ts` (`color`, `type`, `space`, `radius`, `shadow`). Fonts: `font.regular/medium/bold` (Heebo, loaded in the root layout).
- Mock identity: `EXPO_PUBLIC_MOCK_USER_ID` (default = team commander). Mock users/ids: `lib/mock/fixtures.ts`.
- Screens are thin; logic in hooks (`useTodayReport`, `useSubmitReport`…).
- `refetchOnWindowFocus` / AppState listener to refresh today's report.
- Components come from `components/` and use tokens from `theme/tokens.ts` only — no raw hex values in screens.
- Tokens stored with `expo-secure-store` on native.

## Definition of done (MVP)
Soldier can log in with Google, report today in one tap, report elsewhere with reasons/note/document, schedule up to 7 days, view history, set reminders. Commander can see subtree, approve single/bulk, edit/report-for, run an emergency roll-call. Deployed: web + API on Render, DB on Supabase.
