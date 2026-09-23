import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// B1 still ships a deny-all stub, so tests drive identity through a header (see C1's tests).
vi.mock('../src/modules/auth/authenticate', () => ({
  authenticate: async (request: { headers: Record<string, string>; user?: unknown }) => {
    const id = request.headers['x-test-user'];
    const { ApiError } = await import('../src/plugins/errors');
    if (!id) throw new ApiError('UNAUTHORIZED');
    const { db } = await import('../src/db/client');
    const { users } = await import('../src/db/schema');
    const { eq } = await import('drizzle-orm');
    const [u] = await db.select().from(users).where(eq(users.id, id));
    if (!u) throw new ApiError('NOT_REGISTERED');
    request.user = { id: u.id, role: u.role };
  },
}));

// Targets all live in team 258750. The actors below are each outside it in a different way.
const TARGET_GROUP = '00000000-0000-0000-0000-00000000a003';
const TARGET_SOLDIER = '00000000-0000-0000-0000-000000000011';
const TARGET_DOC = '00000000-0000-0000-0000-0000000d0001'; // owned by soldier 13, team 258750

const ACTOR = {
  otherBranchCommander: '00000000-0000-0000-0000-000000000004', // commands team 258751
  otherUnitHr: '00000000-0000-0000-0000-000000000099', // HR for team 258751 only
  plainSoldier: '00000000-0000-0000-0000-000000000021', // team 258751
  ownCommander: '00000000-0000-0000-0000-000000000003', // legitimately commands the target
};

type Kind =
  /** Acting on someone else's data: every outsider must be refused. */
  | 'scoped'
  /** Scoped, and additionally HR-only: even the target's own commander is refused. */
  | 'hr-only'
  /** Any member of the event may call it, so "plain soldier" is not an outsider here. */
  | 'member'
  /** Answers about the caller themselves — no 403 semantics, just authentication. */
  | 'self';

type Row = {
  method: 'GET' | 'PUT' | 'POST' | 'DELETE';
  url: string;
  kind: Kind;
  body?: unknown;
  /** What a legitimate caller gets on a `self` route (default 200). */
  ok?: number;
};

/**
 * Every route this lane owns. `covers every registered route` below fails if one is added without
 * a row here, so "for every route" (C6) is enforced rather than assumed.
 */
let ROUTES: Row[] = [];

describe.skipIf(!process.env.DATABASE_URL)('C6 access-control matrix', () => {
  let app: FastifyInstance;
  let db: typeof import('../src/db/client')['db'];
  let schema: typeof import('../src/db/schema');
  let orm: typeof import('drizzle-orm');
  let eventId: string;
  let reportId: string;

  beforeAll(async () => {
    app = await (await import('../src/server')).buildServer();
    db = (await import('../src/db/client')).db;
    schema = await import('../src/db/schema');
    orm = await import('drizzle-orm');

    const [d] = await db.execute<{ d: string }>(orm.sql`select app_today()::text as d`);
    const [report] = await db
      .select({ id: schema.reports.id })
      .from(schema.reports)
      .where(
        orm.and(
          orm.eq(schema.reports.userId, TARGET_SOLDIER),
          orm.eq(schema.reports.reportDate, String(d?.d)),
        ),
      );
    reportId = String(report?.id);

    // An *ended* event: the "one open event per group" index only covers open ones, so this
    // can't collide with the C4 suite running in parallel on the same group. Every route below
    // checks scope before it looks at the event's state, which is what this file asserts.
    const [event] = await db
      .insert(schema.emergencyEvents)
      .values({
        groupId: TARGET_GROUP,
        includeSubgroups: false,
        startedBy: ACTOR.ownCommander,
        endedAt: orm.sql`now()`,
        endedBy: ACTOR.ownCommander,
      })
      .returning({ id: schema.emergencyEvents.id });
    eventId = String(event?.id);

    ROUTES = [
      { method: 'GET', url: '/commander/groups', kind: 'self' },
      { method: 'GET', url: `/commander/groups/${TARGET_GROUP}/reports`, kind: 'scoped' },
      {
        method: 'POST',
        url: '/commander/reports/approve',
        kind: 'scoped',
        body: { reportIds: [reportId] },
      },
      {
        method: 'PUT',
        url: `/commander/soldiers/${TARGET_SOLDIER}/reports/${String(d?.d)}`,
        kind: 'scoped',
        body: { reasonId: 1 },
      },
      { method: 'GET', url: `/commander/documents/${TARGET_DOC}/url`, kind: 'scoped' },
      { method: 'PUT', url: `/commander/favorites/${TARGET_SOLDIER}`, kind: 'scoped' },
      { method: 'DELETE', url: `/commander/favorites/${TARGET_SOLDIER}`, kind: 'scoped' },
      {
        method: 'POST',
        url: '/commander/emergencies',
        kind: 'scoped',
        body: { groupId: TARGET_GROUP, includeSub: true },
      },
      { method: 'GET', url: `/commander/emergencies/${eventId}`, kind: 'scoped' },
      { method: 'POST', url: `/commander/emergencies/${eventId}/end`, kind: 'scoped' },
      { method: 'GET', url: '/emergencies/active', kind: 'self' },
      {
        method: 'POST',
        url: '/push-tokens',
        kind: 'self',
        ok: 204,
        body: { token: 'ExponentPushToken[matrix]', platform: 'ios' },
      },
      {
        method: 'POST',
        url: `/emergencies/${eventId}/respond`,
        kind: 'member',
        body: { status: 'ok' },
      },
      {
        method: 'POST',
        url: '/hr/reports/finalize',
        kind: 'hr-only',
        body: { reportIds: [reportId] },
      },
      { method: 'DELETE', url: `/hr/reports/${reportId}/finalize`, kind: 'hr-only' },
    ];
  });

  afterAll(async () => {
    await app.close();
    await db
      .delete(schema.emergencyEvents)
      .where(orm.eq(schema.emergencyEvents.id, eventId));
    await db
      .delete(schema.pushTokens)
      .where(orm.eq(schema.pushTokens.token, 'ExponentPushToken[matrix]'));
  });

  const call = (row: Row, userId?: string) =>
    app.inject({
      method: row.method,
      url: `/api/v1${row.url}`,
      headers: userId ? { 'x-test-user': userId } : {},
      ...(row.body === undefined ? {} : { payload: row.body as object }),
    });

  const label = (row: Row) => `${row.method} ${row.url.replace(/[0-9a-f-]{36}/g, ':id')}`;

  const LANE_C_ROUTE = /^(GET|PUT|POST|DELETE) \/(commander|hr|emergencies|push-tokens)(\/|$)/;

  test('the table covers every registered route', () => {
    const registered = flatten(app.printRoutes({ commonPrefix: false }))
      // Lane C's paths only: /health is Lane A's and the self routes are Lane B's (covered by
      // lane-b-access.test.ts). HEAD and OPTIONS are generated by Fastify.
      .filter((r) => LANE_C_ROUTE.test(r));
    const covered = new Set(ROUTES.map((r) => `${r.method} ${template(r.url)}`));
    expect([...new Set(registered)].filter((r) => !covered.has(r))).toEqual([]);
  });

  test('every route requires authentication', async () => {
    for (const row of ROUTES) {
      expect.soft(await call(row).then((r) => r.statusCode), label(row)).toBe(401);
    }
  });

  test('a commander from another branch is refused everywhere', async () => {
    for (const row of ROUTES.filter((r) => r.kind !== 'self')) {
      expect.soft(await call(row, ACTOR.otherBranchCommander).then((r) => r.statusCode), label(row)).toBe(403);
    }
  });

  test('an HR user from another unit is refused everywhere', async () => {
    for (const row of ROUTES.filter((r) => r.kind !== 'self')) {
      expect.soft(await call(row, ACTOR.otherUnitHr).then((r) => r.statusCode), label(row)).toBe(403);
    }
  });

  test('a plain soldier cannot act on anyone else', async () => {
    for (const row of ROUTES.filter((r) => r.kind === 'scoped' || r.kind === 'hr-only')) {
      expect.soft(await call(row, ACTOR.plainSoldier).then((r) => r.statusCode), label(row)).toBe(403);
    }
  });

  test('the target’s own commander is still refused the HR-only routes', async () => {
    for (const row of ROUTES.filter((r) => r.kind === 'hr-only')) {
      expect.soft(await call(row, ACTOR.ownCommander).then((r) => r.statusCode), label(row)).toBe(403);
    }
  });

  test('the self routes answer for anyone logged in', async () => {
    for (const row of ROUTES.filter((r) => r.kind === 'self')) {
      expect.soft(await call(row, ACTOR.plainSoldier).then((r) => r.statusCode), label(row)).toBe(row.ok ?? 200);
    }
  });
});

/** Turn Fastify's route tree into flat "METHOD /path" entries. */
function flatten(tree: string): string[] {
  const stack: string[] = [];
  const out: string[] = [];
  for (const line of tree.split('\n')) {
    const m = /^(?<indent>[│\s]*)(?:├──|└──)\s(?<seg>\S*)\s*(?:\((?<methods>[^)]*)\))?\s*$/.exec(line);
    if (!m?.groups) continue;
    const depth = Math.floor((m.groups.indent ?? '').length / 4);
    const seg = m.groups.seg ?? '';
    stack[depth] = (depth > 0 ? (stack[depth - 1] ?? '') : '') + seg;
    const path = stack[depth];
    if (!m.groups.methods || path === '*') continue;
    for (const method of m.groups.methods.split(',').map((s) => s.trim())) {
      out.push(`${method} ${path.replace(/^\/api\/v1/, '')}`);
    }
  }
  return out;
}

/** Replace the concrete ids in a table url with the router's parameter names. */
const template = (url: string) =>
  url
    .replace(/\/commander\/groups\/[^/]+\/reports/, '/commander/groups/:groupId/reports')
    .replace(/\/commander\/soldiers\/[^/]+\/reports\/[^/]+/, '/commander/soldiers/:userId/reports/:date')
    .replace(/\/commander\/documents\/[^/]+\/url/, '/commander/documents/:documentId/url')
    .replace(/\/commander\/favorites\/[^/]+/, '/commander/favorites/:soldierId')
    .replace(/\/commander\/emergencies\/[^/]+\/end/, '/commander/emergencies/:id/end')
    .replace(/\/commander\/emergencies\/(?!:)[^/]+$/, '/commander/emergencies/:id')
    .replace(/\/emergencies\/[^/]+\/respond/, '/emergencies/:id/respond')
    .replace(/\/hr\/reports\/(?!finalize)[^/]+\/finalize/, '/hr/reports/:reportId/finalize');
