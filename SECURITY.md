# SECURITY.md — Secure development rules (full stack)

These rules are **mandatory**. They override convenience and deadlines. An agent must never disable or bypass them to "make it work" — stop and report instead.
The app handles personal data of soldiers (names, whereabouts, medical documents). Treat all of it as sensitive.

---

## 1. Injection (SQL, command, template)
- **Never build SQL with string concatenation or template literals containing user input.**
- Use Drizzle query builder or `sql\`...\`` tagged templates with bound parameters only.
- `sql.raw()` / `sql.identifier()` are **forbidden with any user-controlled value**. Sorting/filter columns come from a server-side allowlist (`const SORTS = { name: users.lastName, … }`).
- `LIKE` search: bind the value and escape `%`, `_`, `\` before binding.
- No `child_process`, `eval`, `new Function`, or dynamic `require/import` with user input.
- DB errors are never returned to the client (they leak table/column names).

## 2. Input validation
- **Every** route has a Zod schema for `params`, `query`, `body` (and headers if used). Use `.strict()` to reject unknown fields.
- Validate types, lengths, formats: UUIDs with `.uuid()`, dates `YYYY-MM-DD`, `note` ≤ 200 chars, arrays max length (e.g. approve ≤ 200 ids).
- **Mass assignment:** never spread `request.body` into a DB insert/update. Pick fields explicitly. Users can't set `user_id`, `reported_by`, `approved_by`, `source`, `role`, timestamps.
- Business rules (7-day window, 23:59 lock, document required, commander-only reasons) are validated **on the server**, in `Asia/Jerusalem` time.
- Normalize before comparing (trim, lowercase emails).

## 3. Authentication
- Only Google sign-in via Supabase Auth. No passwords stored by us.
- Backend verifies the access token **on every request**: signature (Supabase JWKS/secret), `exp`, `aud`, `iss`. Reject missing/expired/malformed tokens with 401.
- User identity = token subject/email → lookup in `users`. Unknown user → 403. Inactive user → 403.
- Never trust a user id, role, or "isCommander" sent by the client.
- Mobile: store session in `expo-secure-store` (native). Web: Supabase default storage; keep token lifetime short and refresh.
- Logout clears the session locally and calls Supabase sign-out.

## 4. Authorization (IDOR / privilege escalation)
- **Deny by default.** Every route declares its required role.
- Self routes (`/reports`, `/settings`…) always scope queries by `request.user.id`, never by an id from the request.
- Acting on someone else: **every read and write** passes `assertCanActOn(actorId, target)`, which is true only if the actor is a **commander above the target** (recursive CTE over `groups`) or an **HR user assigned to the target's unit** (recursive CTE over `hr_assignments`). This includes document URLs, emergency events and favorites.
- **HR is a wider scope, not an escape hatch.** HR-only powers — editing past days, finalizing and un-finalizing — additionally require `role='admin'` **and** the same HR-scope check. A commander must never reach them; an HR user must never act outside their assigned units.
- Never infer HR from the client, an email domain, or the absence of a group. It comes from `users.role` plus a row in `hr_assignments`.
- Bulk actions: verify **each** id is in scope; if any isn't, reject the whole request (403) — no partial success.
- Test for it, for every endpoint: a commander from another branch gets 403; an HR user from another unit gets 403; a commander calling an HR-only route gets 403.

## 5. Database (Supabase / Postgres)
- `init.sql` enables **Row Level Security on every table with no policies** → the public Supabase REST API (anon key) can read/write nothing. Only the backend connects directly.
- The frontend uses the Supabase client **for auth only**. It never queries tables or storage directly.
- `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` live only on Render. Never in the mobile app, never in Git.
- Use the pooler with SSL (`sslmode=require`).
- Every change to a report is written to `report_audit` in the same transaction.
- Mock data only. **No real names, personal numbers, phone numbers, or medical data** in the repo, seed files, screenshots, tests, or prompts to AI tools.

## 6. File uploads (sick documents)
- Allowed: `image/jpeg`, `image/png`, `application/pdf`. Check the **magic bytes**, not only the extension/Content-Type.
- Max size 5 MB (`@fastify/multipart` limits: 1 file, 5MB, no extra fields).
- Generate the storage path server-side: `{userId}/{uuid}.{ext}`. Never use the uploaded filename in paths.
- Bucket is **private**. Access only through backend-issued **signed URLs, 60 seconds**, after authorization.
- Strip EXIF from images if possible (location metadata).

## 7. XSS & output
- React Native escapes text by default. On web: **no `dangerouslySetInnerHTML`**, no rendering user HTML/Markdown.
- Notes are plain text; render as text only.
- Don't put user input into URLs, `href`, or `WebView` without validation.

## 8. HTTP security (Fastify)
- `@fastify/helmet` on (HSTS, noSniff, frameguard, referrer policy).
- `@fastify/cors` with an **explicit allowlist** from `CORS_ORIGINS` — never `*` with credentials.
- `@fastify/rate-limit`: global 100 req/min per user/IP; stricter on `/documents` (10/min) and emergency start (5/min).
- Body size limit (default 100KB; uploads route only 5MB).
- HTTPS only in production (Render provides TLS). Reject plain HTTP.
- Auth uses `Authorization: Bearer` header, not cookies → CSRF risk is low; still never accept state-changing `GET`.
- No server-side fetching of user-supplied URLs (SSRF).

## 9. Errors & logging
- Central error handler: client gets `{ error: { code, message } }` with a safe message. No stack traces, SQL, or internal ids of other users.
- Log with pino, **redact**: `authorization` header, tokens, emails, notes, file content, personal numbers.
- Log security events: failed auth, 403s, bulk approvals, commander edits, emergency start/end.
- `NODE_ENV=production` on Render.

## 10. Secrets & config
- `.env` files are git-ignored; commit only `.env.example` with empty values.
- Only `EXPO_PUBLIC_*` vars go to the client, and they must be non-secret (Supabase URL, anon key, API URL).
- Rotate any key that was ever pasted into chat, a ticket, a commit, or an AI prompt.
- Add a secret scanner (e.g. `gitleaks`) as a pre-commit hook or CI step.

## 11. Dependencies & supply chain
- Lockfile committed; install with `pnpm i --frozen-lockfile` in CI/deploy.
- `pnpm audit --prod` before release; no high/critical vulnerabilities shipped.
- Prefer well-known packages; don't add a dependency for a few lines of code.
- Agents must not add packages outside the stack in CLAUDE.md without approval.

## 12. Mobile specifics
- No secrets in the app bundle (it can be decompiled).
- Push notification text contains **no personal data** (e.g. "יש לך עדכון בדיווח", not the reason/diagnosis).
- Deep links / redirect URLs registered in Supabase are an exact allowlist (app scheme + web app domain + localhost for dev).

## 13. Emergency mode integrity
- Only commanders of the target group (or an ancestor) can start/end an event.
- One open event per group (DB constraint).
- Test notifications only in a dev environment with test users — never send test "emergency" pushes to real devices in production.

## 14. AI-agent rules
- Never paste real personal data or secrets into prompts.
- Never commit generated code that disables validation, auth plugins, RLS, or rate limits.
- Review every agent PR against the checklist below.

## 15. System integrations (external systems → API)
Applies to `modules/integrations` (SPEC F11/F12). These routes have **no Supabase user**. They are `public` and authenticated by a machine key instead.
- **One secret per external system** (`INTEGRATION_CPR_KEY`, `INTEGRATION_PEOPLE_DIGITAL_KEY`), ≥32 random chars, stored only on Render (`sync: false`) and in the mock's own `.env`. A key opens **only its own system's** routes. If the key is missing or short, that system is disabled.
- Keys arrive in the `X-Integration-Key` header, never in a URL or body. They are compared in constant time (SHA-256 + `timingSafeEqual`), and the header is redacted in logs. Rotate a key by changing the env var on both sides.
- CORS stays closed to integrations: they are server-to-server, so the header is **not** in the CORS allowlist and a browser page can't call them.
- A key is **not** a user. It can only write the one reason its system owns (`sick_gimelim` / `annual_leave`) inside the integration window (today … today+30). It can't read reports, documents, or anything else.
- Every write is audited with that system's **inactive system user** as the actor, in the same transaction.
- The soldier directory (`GET /integrations/soldiers`) returns the least data possible: personal number, name, group. Active soldiers only. Searches are bound and LIKE-escaped. Rate limit: 30/min per system.
- The fake external website lives in `apps/integrations-mock` (TASKS I5), deployed as its own Render service. It holds the keys server-side only (the browser talks to it, never to `/integrations/*`), sits behind Basic Auth (constant-time compare), never logs keys, bodies or personal numbers, and must never have `DATABASE_URL` or the service-role key.

## 16. NFC speedgate (card serials, gate readers)
Applies to `modules/nfc` and `apps/nfc-reader` (SPEC F13).
- **Raw Calypso serials are never stored or logged.** Only `HMAC-SHA256(NFC_CARD_HMAC_SECRET, "calypso:v1:<serial>")` + last 4 digits. `calypsoSerial` is in the pino redaction list. The secret is ≥32 random bytes, lives only on Render (generated there), and rotating it invalidates every enrollment.
- **Reader credentials:** `Authorization: Gate <readerId>.<32-byte secret>`, returned once at provisioning; only its SHA-256 is stored and compared in constant time. Only an active reader at an active base passes. The speedgate route is `public` (no Supabase user) and rate-limited per reader.
- **The reader phone** keeps the token encrypted with an Android Keystore AES-256/GCM key, backups off, HTTPS only in release builds (cleartext allowed only in the debug manifest), no redirects followed.
- **Data minimisation:** gate mode reads only the application serial — never birth date or holder identifiers. Unknown cards and inactive users get no identity in the response.
- Enrollment and revocation are HR powers: admin **and** `is_in_hr_scope` (§4).

---

## PR security checklist
- [ ] All inputs validated with strict Zod schemas
- [ ] No string-built SQL, no `sql.raw` with user input
- [ ] Route has auth + correct role; acting-on-others routes call `assertCanActOn`, HR-only routes also check `role='admin'`
- [ ] Queries for "self" data use `request.user.id` only
- [ ] No mass assignment; fields picked explicitly
- [ ] Errors don't leak internals; logs redact sensitive fields
- [ ] Uploads: type by magic bytes, size limit, private bucket, signed URL
- [ ] No secrets or real personal data in code, tests, seed, or logs
- [ ] New dependency approved and audited
- [ ] Tests include at least one unauthorized/forbidden case
- [ ] Integration routes: `config.public` + `requireIntegration(<system>)`; wrong or other-system key → 401 tested
