import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
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

// This file mutates only soldier 24 (team 258751), so it can't disturb the other suites.
const U = {
  battalionCmd: '00000000-0000-0000-0000-000000000001',
  team1Cmd: '00000000-0000-0000-0000-000000000003',
  team2Cmd: '00000000-0000-0000-0000-000000000004',
  soldier13: '00000000-0000-0000-0000-000000000013', // team 258750 — outside hrTeam2's units
  s24: '00000000-0000-0000-0000-000000000024',
  hrBattalion: '00000000-0000-0000-0000-000000000098', // covers the whole battalion
  hrTeam2: '00000000-0000-0000-0000-000000000099', // covers team 258751 only
};
const MISSING = '00000000-0000-0000-0000-0000000000ff';

describe.skipIf(!process.env.DATABASE_URL)('C7 HR finalization (F9b)', () => {
  let app: FastifyInstance;
  let db: typeof import('../src/db/client')['db'];
  let schema: typeof import('../src/db/schema');
  let orm: typeof import('drizzle-orm');
  let recent: string; // a day inside the commander's window, not finalized by the seed
  let reasonId: Record<string, number>;

  beforeAll(async () => {
    app = await (await import('../src/server')).buildServer();
    db = (await import('../src/db/client')).db;
    schema = await import('../src/db/schema');
    orm = await import('drizzle-orm');
    const [d] = await db.execute<{ d: string }>(orm.sql`select app_today()::text as d`);
    recent = String(d?.d);
    const reasons = await db
      .select({ id: schema.statusReasons.id, code: schema.statusReasons.code })
      .from(schema.statusReasons);
    reasonId = Object.fromEntries(reasons.map((r) => [r.code, r.id]));
  });
  afterAll(() => app.close());

  afterEach(async () => {
    const { and, eq, sql } = orm;
    const { reportAudit, reports } = schema;
    // Today's reports are never finalized by the seed — put them back that way.
    await db
      .update(reports)
      .set({ finalizedBy: null, finalizedAt: null, approvedBy: null, approvedAt: null })
      .where(and(eq(reports.userId, U.s24), eq(reports.reportDate, recent)));
    await db
      .delete(reportAudit)
      .where(and(eq(reportAudit.userId, U.s24), sql`${reportAudit.createdAt} > now() - interval '5 minutes'`));
    await db.delete(reports).where(and(eq(reports.userId, U.s24), eq(reports.reportDate, recent)));
  });

  const call = (method: 'POST' | 'DELETE' | 'PUT', url: string, userId?: string, payload?: unknown) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      headers: userId ? { 'x-test-user': userId } : {},
      ...(payload === undefined ? {} : { payload: payload as object }),
    });

  /** Soldier 24 has no report today; make one so each test starts from a known state. */
  async function todayReport(): Promise<string> {
    const [r] = await db
      .insert(schema.reports)
      .values({
        userId: U.s24,
        reportDate: recent,
        reasonId: Number(reasonId.present),
        reportedBy: U.s24,
        lastModifiedBy: U.s24,
      })
      .returning({ id: schema.reports.id });
    return String(r?.id);
  }

  const finalizedAt = async (id: string) => {
    const [r] = await db
      .select({ at: schema.reports.finalizedAt, by: schema.reports.finalizedBy })
      .from(schema.reports)
      .where(orm.eq(schema.reports.id, id));
    return r;
  };

  const auditActions = async (userId: string) =>
    (
      await db
        .select({ action: schema.reportAudit.action, actorId: schema.reportAudit.actorId })
        .from(schema.reportAudit)
        .where(
          orm.and(
            orm.eq(schema.reportAudit.userId, userId),
            orm.sql`${schema.reportAudit.createdAt} > now() - interval '2 minutes'`,
          ),
        )
    ).map((r) => r.action);

  describe('POST /hr/reports/finalize', () => {
    test('HR closes a day, and the close is audited', async () => {
      const id = await todayReport();
      const res = await call('POST', '/hr/reports/finalize', U.hrTeam2, { reportIds: [id] });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ finalizedCount: 1 });

      const row = await finalizedAt(id);
      expect(row?.by).toBe(U.hrTeam2);
      expect(row?.at).toBeTruthy();
      expect(await auditActions(U.s24)).toContain('finalize');
    });

    test('HR does not need stage-1 approval to have happened', async () => {
      const id = await todayReport();
      expect((await call('POST', '/hr/reports/finalize', U.hrTeam2, { reportIds: [id] })).statusCode).toBe(200);
    });

    test('a commander calling an HR-only route → 403', async () => {
      const id = await todayReport();
      for (const commander of [U.team2Cmd, U.battalionCmd]) {
        const res = await call('POST', '/hr/reports/finalize', commander, { reportIds: [id] });
        expect(res.statusCode).toBe(403);
      }
      expect(await finalizedAt(id).then((r) => r?.at)).toBeNull();
    });

    test('a plain soldier → 403, unauthenticated → 401', async () => {
      const id = await todayReport();
      expect((await call('POST', '/hr/reports/finalize', U.s24, { reportIds: [id] })).statusCode).toBe(403);
      expect((await call('POST', '/hr/reports/finalize', undefined, { reportIds: [id] })).statusCode).toBe(401);
    });

    test('an HR user from another unit → 403', async () => {
      const [other] = await db
        .select({ id: schema.reports.id })
        .from(schema.reports)
        .where(orm.and(orm.eq(schema.reports.userId, U.soldier13), orm.eq(schema.reports.reportDate, recent)));
      const res = await call('POST', '/hr/reports/finalize', U.hrTeam2, { reportIds: [String(other?.id)] });
      expect(res.statusCode).toBe(403);
    });

    test('one out-of-scope id rejects the whole call and finalizes nothing', async () => {
      const mine = await todayReport();
      const [theirs] = await db
        .select({ id: schema.reports.id })
        .from(schema.reports)
        .where(orm.and(orm.eq(schema.reports.userId, U.soldier13), orm.eq(schema.reports.reportDate, recent)));
      const res = await call('POST', '/hr/reports/finalize', U.hrTeam2, {
        reportIds: [mine, String(theirs?.id)],
      });
      expect(res.statusCode).toBe(403);
      expect(await finalizedAt(mine).then((r) => r?.at)).toBeNull();
      expect(await auditActions(U.s24)).not.toContain('finalize');
    });

    test('an id that does not exist is refused as out of scope', async () => {
      expect((await call('POST', '/hr/reports/finalize', U.hrTeam2, { reportIds: [MISSING] })).statusCode).toBe(403);
    });

    test('rejects an empty list and more than 200 ids', async () => {
      expect((await call('POST', '/hr/reports/finalize', U.hrTeam2, { reportIds: [] })).statusCode).toBe(400);
      const many = Array.from({ length: 201 }, () => MISSING);
      expect((await call('POST', '/hr/reports/finalize', U.hrTeam2, { reportIds: many })).statusCode).toBe(400);
    });

    test('battalion HR reaches a soldier in any team below it', async () => {
      const id = await todayReport();
      expect((await call('POST', '/hr/reports/finalize', U.hrBattalion, { reportIds: [id] })).statusCode).toBe(200);
    });
  });

  describe('a finalized day is read-only for everyone but HR', () => {
    test('the commander can no longer edit it', async () => {
      const id = await todayReport();
      await call('POST', '/hr/reports/finalize', U.hrTeam2, { reportIds: [id] });

      const res = await call('PUT', `/commander/soldiers/${U.s24}/reports/${recent}`, U.team2Cmd, {
        reasonId: reasonId.errands_day,
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('DAY_FINALIZED');
    });

    test('the commander can no longer approve it', async () => {
      const id = await todayReport();
      await call('POST', '/hr/reports/finalize', U.hrTeam2, { reportIds: [id] });

      const res = await call('POST', '/commander/reports/approve', U.team2Cmd, { reportIds: [id] });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('DAY_FINALIZED');
    });

    test('HR can still change it, and the write is stamped as HR', async () => {
      const id = await todayReport();
      await call('POST', '/hr/reports/finalize', U.hrTeam2, { reportIds: [id] });

      const res = await call('PUT', `/commander/soldiers/${U.s24}/reports/${recent}`, U.hrTeam2, {
        reasonId: reasonId.errands_day,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().source).toBe('hr');
      expect(res.json().lastModifiedBy.id).toBe(U.hrTeam2);
    });
  });

  describe('DELETE /hr/reports/:reportId/finalize', () => {
    test('HR re-opens a day, and the re-open is audited', async () => {
      const id = await todayReport();
      await call('POST', '/hr/reports/finalize', U.hrTeam2, { reportIds: [id] });

      const res = await call('DELETE', `/hr/reports/${id}/finalize`, U.hrTeam2);
      expect(res.statusCode).toBe(204);
      const row = await finalizedAt(id);
      expect(row?.at).toBeNull();
      expect(row?.by).toBeNull();
      expect(await auditActions(U.s24)).toContain('unfinalize');
    });

    test('the commander can edit again once HR re-opens the day', async () => {
      const id = await todayReport();
      await call('POST', '/hr/reports/finalize', U.hrTeam2, { reportIds: [id] });
      await call('DELETE', `/hr/reports/${id}/finalize`, U.hrTeam2);

      const res = await call('PUT', `/commander/soldiers/${U.s24}/reports/${recent}`, U.team2Cmd, {
        reasonId: reasonId.errands_day,
      });
      expect(res.statusCode).toBe(200);
    });

    test('a commander calling it → 403', async () => {
      const id = await todayReport();
      await call('POST', '/hr/reports/finalize', U.hrTeam2, { reportIds: [id] });
      expect((await call('DELETE', `/hr/reports/${id}/finalize`, U.team2Cmd)).statusCode).toBe(403);
      expect((await call('DELETE', `/hr/reports/${id}/finalize`, U.team1Cmd)).statusCode).toBe(403);
      expect(await finalizedAt(id).then((r) => r?.at)).toBeTruthy();
    });

    test('an HR user from another unit → 403', async () => {
      const [other] = await db
        .select({ id: schema.reports.id })
        .from(schema.reports)
        .where(orm.and(orm.eq(schema.reports.userId, U.soldier13), orm.eq(schema.reports.reportDate, recent)));
      expect((await call('DELETE', `/hr/reports/${String(other?.id)}/finalize`, U.hrTeam2)).statusCode).toBe(403);
    });

    test('an unknown report id → 403, a malformed one → 400', async () => {
      expect((await call('DELETE', `/hr/reports/${MISSING}/finalize`, U.hrTeam2)).statusCode).toBe(403);
      expect((await call('DELETE', '/hr/reports/not-a-uuid/finalize', U.hrTeam2)).statusCode).toBe(400);
    });
  });
});
