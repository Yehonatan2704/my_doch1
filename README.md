# דו"ח 1 — New

A rebuild of the IDF daily attendance-reporting app: soldiers report where they are each day, commanders approve and correct, and משא"ן has the final word.

**This repo currently holds the specification, not the code.** It is written to be executed by coding agents working in parallel — start with `CLAUDE.md`.

## Read in this order

| File | What it is |
|---|---|
| **CLAUDE.md** | Rules for coding agents: stack, repo layout, env vars, conventions, parallel-work rules. **Start here.** |
| **SPEC.md** | What we build: roles, business rules, every feature with acceptance criteria, the API contract |
| **SECURITY.md** | Mandatory secure-development rules + the PR checklist |
| **DESIGN.md** | Design tokens, components, every screen, accessibility |
| **TASKS.md** | The 24h build plan, split into 5 lanes that can run in parallel |
| **db/init.sql** | Postgres schema + mock data. Tested on PostgreSQL 16; safe to re-run |

## The app in one minute

- **Soldier** — one tap for "אני בבסיס", or a category → reason flow for anything else. Sick leave requires a document; four reasons allow a free-text note. Can pre-report up to 7 days ahead, one day per tap. Sees their own history with a red ring on days someone else changed.
- **Commander** — sees their group *and every group below it*. Approves one report or many at once, edits a report, reports for a soldier who didn't, and starts an emergency roll-call ("ירוק בעיניים") where soldiers answer **אני בסדר** or **צריך עזרה**.
- **משא"ן (HR)** — sits outside the chain of command, scoped to assigned units. Has the final word: closes ("finalizes") a day, which locks it for everyone else, and can do so even when the commander never approved. API and permissions only in the MVP — no HR screens yet.

## Getting started

```bash
# 1. Database (Supabase SQL editor, or psql)
psql "$DATABASE_URL" -f db/init.sql
```

Before running it, replace the placeholder emails at the top of the users block in `db/init.sql` with your team's real Google accounts — that's how you log in as a battalion / company / team commander or a plain soldier.

Using Claude Code? Nothing to set up: when a session starts, a hook runs `scripts/graphify.sh`. The first time, it installs [graphify](https://github.com/safishamsi/graphify), which needs Python ≥ 3.10 (`brew install python@3.13`). Every time, it rebuilds a knowledge graph of the repo in about 2 seconds without using any LLM tokens. Claude then uses the graph to find the right `file:line` before it reads any code (see CLAUDE.md, "Token rules"). You can write plain prompts; you don't need to mention graphify.

Then follow **TASKS.md** Wave 0. Nothing else starts until the contract in `packages/shared` is frozen and the mock API answers.

## Stack

Expo (React Native + web) · Fastify · Drizzle · Supabase (Postgres, Google auth, Storage) · Render (web + API).

## Conventions

- Hebrew UI, RTL, `Asia/Jerusalem` for every date calculation.
- All business rules are enforced on the server; the client only mirrors them.
- The mock data is entirely fictional. **Never commit real names, personal numbers or medical documents** — see SECURITY.md §5.
