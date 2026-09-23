import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SYSTEM_USER_IDS } from '@doch1/shared';

// Commander calls (the "still editable later" case) drive identity through a header, like the
// other suites. The integration routes don't use it — they are public + X-Integration-Key.
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

// Generated per run: a literal key in the repo would trip the secret scanner (and be a bad habit).
const CPR_KEY = randomBytes(32).toString('hex');
const PEOPLE_KEY = randomBytes(32).toString('hex');

// This file only writes future days of soldier 17 (team 258750), which no other suite touches.
const S17 = { id: '00000000-0000-0000-0000-000000000017', pn: '9000017' };
const TEAM1_CMD = '00000000-0000-0000-0000-000000000003';
const HR_BATTALION = '00000000-0000-0000-0000-000000000098';

describe.skipIf(!process.env.DATABASE_URL)('I2 integrations (F11, F12)', () => {
  let app: FastifyInstance;
  let db: typeof import('../src/db/client')['db'];
  let schema: typeof import('../src/db/schema');
  let orm: typeof import('drizzle-orm');
  let reasonId: Record<string, number>;
  let today: string;
  const day = (n: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  beforeAll(async () => {
    process.env.INTEGRATION_CPR_KEY = CPR_KEY;
    process.env.INTEGRATION_PEOPLE_DIGITAL_KEY = PEOPLE_KEY;
    app = await (await import('../src/server')).buildServer();
    db = (await import('../src/db/client')).db;
    schema = await import('../src/db/schema');
    orm = await import('drizzle-orm');
    const [d] = await db.execute<{ d: string }>(orm.sql`select app_today()::text as d`);
    today = String(d?.d);
    const reasons = await db
      .select({ id: schema.statusReasons.id, code: schema.statusReasons.code })
      .from(schema.statusReasons);
    reasonId = Object.fromEntries(reasons.map((r) => [r.code, r.id]));
  });
  afterAll(() => app.close());

  afterEach(async () => {
    process.env.INTEGRATION_CPR_KEY = CPR_KEY;
    process.env.INTEGRATION_PEOPLE_DIGITAL_KEY = PEOPLE_KEY;
    const { and, eq, gt } = orm;
    await db
      .delete(schema.reportAudit)
      .where(and(eq(schema.reportAudit.userId, S17.id), gt(schema.reportAudit.reportDate, today)));
    await db
      .delete(schema.reports)
      .where(and(eq(schema.reports.userId, S17.id), gt(schema.reports.reportDate, today)));
  });

  const post = (url: string, key: string | null, payload: unknown) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/integrations${url}`,
      headers: key ? { 'x-integration-key': key } : {},
      payload: payload as object,
    });
  // null = send no key header at all.
  const cpr = (body: object, key: string | null = CPR_KEY) =>
    post('/cpr/sick-leave', key, { personalNumber: S17.pn, issueDate: today, days: 3, ...body });
  const leave = (body: object, key: string | null = PEOPLE_KEY) =>
    post('/people-digital/annual-leave', key, {
      personalNumber: S17.pn,
      startDate: day(2),
      endDate: day(5),
      ...body,
    });
  const soldiers = (query: string, key: string | null = CPR_KEY) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/integrations/soldiers${query}`,
      headers: key ? { 'x-integration-key': key } : {},
    });

  const futureReports = () =>
    db
      .select()
      .from(schema.reports)
      .where(orm.and(orm.eq(schema.reports.userId, S17.id), orm.gt(schema.reports.reportDate, today)))
      .orderBy(schema.reports.reportDate);
  const audit = () =>
    db
      .select({ action: schema.reportAudit.action, actorId: schema.reportAudit.actorId })
      .from(schema.reportAudit)
      .where(
        orm.and(orm.eq(schema.reportAudit.userId, S17.id), orm.gt(schema.reportAudit.reportDate, today)),
      );

  describe('key auth (401)', () => {
    test.each([
      ['no key', null],
      ['wrong key', 'x'.repeat(40)],
      ["the other system's key", PEOPLE_KEY],
    ])('CPR route with %s', async (_n, key) => {
      const res = await cpr({}, key);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('INTEGRATION_UNAUTHORIZED');
    });

    test('leave route with the CPR key', async () => {
      expect((await leave({}, CPR_KEY)).statusCode).toBe(401);
    });

    test('a Supabase bearer token is not an integration key', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/soldiers',
        headers: { authorization: 'Bearer abc', 'x-test-user': TEAM1_CMD },
      });
      expect(res.statusCode).toBe(401);
    });

    test('a system whose key is unset or too short is disabled', async () => {
      process.env.INTEGRATION_CPR_KEY = '';
      expect((await cpr({}, '')).statusCode).toBe(401);
      process.env.INTEGRATION_CPR_KEY = 'short';
      expect((await cpr({}, 'short')).statusCode).toBe(401);
    });

    test('nothing is written on a rejected call', async () => {
      await cpr({}, PEOPLE_KEY);
      expect(await futureReports()).toHaveLength(0);
    });
  });

  describe('validation', () => {
    test.each([
      ['unknown field', { userId: S17.id }],
      ['0 days', { days: 0 }],
      ['31 days', { days: 31 }],
      ['bad date', { issueDate: '23/09/2026' }],
      ['bad personal number', { personalNumber: '12ab' }],
    ])('CPR: %s → 400', async (_n, body) => {
      expect((await cpr(body)).statusCode).toBe(400);
    });

    test('leave: end before start → 400', async () => {
      expect((await leave({ startDate: day(5), endDate: day(2) })).statusCode).toBe(400);
    });

    test.each([
      ['unknown', '1234567'],
      ['a system user', '0000001'],
    ])('%s personal number → 404', async (_n, pn) => {
      const res = await cpr({ personalNumber: pn });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('SOLDIER_NOT_FOUND');
    });

    test.each([
      ['CPR issueDate is not today', () => cpr({ issueDate: day(-1) })],
      ['CPR issueDate in the future', () => cpr({ issueDate: day(1) })],
      ['leave starts yesterday', () => leave({ startDate: day(-1) })],
      ['leave ends after today+30', () => leave({ endDate: day(31) })],
    ])('%s → 422', async (_n, send) => {
      const res = await send();
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('INTEGRATION_OUT_OF_WINDOW');
    });
  });

  describe('CPR gimelim (F11)', () => {
    test('3 gimelim today → sick_gimelim on today+1 … today+3, no document, audited', async () => {
      const res = await cpr({});
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        personalNumber: S17.pn,
        reasonCode: 'sick_gimelim',
        dates: [day(1), day(2), day(3)],
        created: 3,
        updated: 0,
        unchanged: 0,
      });
      const rows = await futureReports();
      expect(rows.map((r) => r.reportDate)).toEqual([day(1), day(2), day(3)]);
      for (const r of rows) {
        expect(r.reasonId).toBe(reasonId.sick_gimelim);
        expect(r.source).toBe('cpr');
        expect(r.documentId).toBeNull();
        expect(r.reportedBy).toBe(SYSTEM_USER_IDS.cpr);
        expect(r.lastModifiedBy).toBe(SYSTEM_USER_IDS.cpr);
      }
      const a = await audit();
      expect(a).toHaveLength(3);
      expect(a.every((r) => r.action === 'create' && r.actorId === SYSTEM_USER_IDS.cpr)).toBe(true);
    });

    test('30 days reaches exactly today+30', async () => {
      const res = await cpr({ days: 30 });
      expect(res.statusCode).toBe(200);
      expect(res.json().dates.at(-1)).toBe(day(30));
    });

    test('re-sending is idempotent: nothing changes, no new audit rows', async () => {
      await cpr({});
      const res = await cpr({});
      expect(res.json()).toMatchObject({ created: 0, updated: 0, unchanged: 3 });
      expect(await audit()).toHaveLength(3);
    });
  });

  describe('אנשים בדיגיטל annual leave (F12)', () => {
    test('start … end inclusive', async () => {
      const res = await leave({});
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        reasonCode: 'annual_leave',
        dates: [day(2), day(3), day(4), day(5)],
        created: 4,
      });
      const rows = await futureReports();
      expect(rows.every((r) => r.source === 'people_digital' && r.reasonId === reasonId.annual_leave)).toBe(
        true,
      );
    });

    test('a one-day leave starting today+30 is allowed', async () => {
      const res = await leave({ startDate: day(30), endDate: day(30) });
      expect(res.statusCode).toBe(200);
      expect(res.json().dates).toEqual([day(30)]);
    });
  });

  describe('overwrite', () => {
    test("replaces the soldier's report and an approved + finalized one; both end up editable", async () => {
      const [self] = await db
        .insert(schema.reports)
        .values({
          userId: S17.id,
          reportDate: day(2),
          reasonId: Number(reasonId.role_outside_unit),
          note: 'הערה',
          reportedBy: S17.id,
          lastModifiedBy: S17.id,
        })
        .returning({ id: schema.reports.id });
      const [closed] = await db
        .insert(schema.reports)
        .values({
          userId: S17.id,
          reportDate: day(3),
          reasonId: Number(reasonId.present),
          reportedBy: S17.id,
          lastModifiedBy: S17.id,
          approvedBy: TEAM1_CMD,
          approvedAt: orm.sql`now()` as unknown as string,
          finalizedBy: HR_BATTALION,
          finalizedAt: orm.sql`now()` as unknown as string,
        })
        .returning({ id: schema.reports.id });

      const res = await leave({});
      expect(res.json()).toMatchObject({ created: 2, updated: 2, unchanged: 0 });

      const rows = await futureReports();
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const id of [self!.id, closed!.id]) {
        const r = byId.get(id)!;
        expect(r.reasonId).toBe(reasonId.annual_leave);
        expect(r.source).toBe('people_digital');
        expect(r.note).toBeNull();
        expect(r.approvedAt).toBeNull();
        expect(r.finalizedAt).toBeNull();
        expect(r.lastModifiedBy).toBe(SYSTEM_USER_IDS.people_digital);
        expect(r.reportedBy).toBe(S17.id); // who first reported the day doesn't change
      }
      expect((await audit()).map((a) => a.action).sort()).toEqual([
        'create',
        'create',
        'unfinalize',
        'update',
        'update',
      ]);

      // "We can still change it later": the soldier's commander edits an imported day.
      const edit = await app.inject({
        method: 'PUT',
        url: `/api/v1/commander/soldiers/${S17.id}/reports/${day(3)}`,
        headers: { 'x-test-user': TEAM1_CMD },
        payload: { reasonId: reasonId.present },
      });
      expect(edit.statusCode).toBe(200);
    });

    test('CPR over leave: the later import wins', async () => {
      await leave({});
      const res = await cpr({});
      expect(res.json()).toMatchObject({ created: 1, updated: 2 });
      const rows = await futureReports();
      expect(rows.filter((r) => r.reasonId === reasonId.sick_gimelim)).toHaveLength(3);
    });
  });

  describe('GET /integrations/soldiers', () => {
    test('either key works; only active, non-system users; least data', async () => {
      for (const key of [CPR_KEY, PEOPLE_KEY]) {
        const res = await soldiers('', key);
        expect(res.statusCode).toBe(200);
        const list = res.json().soldiers as Record<string, unknown>[];
        expect(list.length).toBeGreaterThan(0);
        expect(list.some((s) => String(s.personalNumber).startsWith('000000'))).toBe(false);
        expect(Object.keys(list[0]!).sort()).toEqual(['firstName', 'groupName', 'lastName', 'personalNumber']);
      }
    });

    test('search by personal number and by name; limit applies', async () => {
      const byPn = (await soldiers(`?q=${S17.pn}`)).json().soldiers;
      expect(byPn).toHaveLength(1);
      expect(byPn[0].groupName).toBe('צוות 258750');
      const byName = (await soldiers(`?q=${encodeURIComponent(byPn[0].firstName)}`)).json().soldiers;
      expect(byName.some((s: { personalNumber: string }) => s.personalNumber === S17.pn)).toBe(true);
      expect((await soldiers('?limit=2')).json().soldiers).toHaveLength(2);
    });

    test('LIKE metacharacters are matched literally', async () => {
      expect((await soldiers('?q=%25')).json().soldiers).toHaveLength(0);
      expect((await soldiers('?q=_')).json().soldiers).toHaveLength(0);
    });

    test('no key → 401, bad limit → 400', async () => {
      expect((await soldiers('', null)).statusCode).toBe(401);
      expect((await soldiers('?limit=500')).statusCode).toBe(400);
    });
  });
});
