import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { documentUrlResponseSchema, reportSchema } from '@doch1/shared';

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

// Every mutation in this file targets team 258751, so it can't disturb the C2 fixtures.
const U = {
  team1Cmd: '00000000-0000-0000-0000-000000000003',
  team2Cmd: '00000000-0000-0000-0000-000000000004',
  soldier13: '00000000-0000-0000-0000-000000000013', // owns the seeded sick note (team 258750)
  s21: '00000000-0000-0000-0000-000000000021', // reported today
  s22: '00000000-0000-0000-0000-000000000022', // reported today
  s23: '00000000-0000-0000-0000-000000000023', // did NOT report today
  // Soldier 24 belongs to the C7 suite. Test files run in parallel against one database, so
  // each file owns a disjoint set of users.
  hrBattalion: '00000000-0000-0000-0000-000000000098',
  hrTeam2: '00000000-0000-0000-0000-000000000099',
};
const DOC = '00000000-0000-0000-0000-0000000d0001';
const MISSING = '00000000-0000-0000-0000-0000000000ff';

describe.skipIf(!process.env.DATABASE_URL)('C3 commander actions', () => {
  let app: FastifyInstance;
  let db: typeof import('../src/db/client')['db'];
  let schema: typeof import('../src/db/schema');
  let orm: typeof import('drizzle-orm');
  let reasonId: Record<string, number>;
  let today: string;

  beforeAll(async () => {
    app = await (await import('../src/server')).buildServer();
    db = (await import('../src/db/client')).db;
    schema = await import('../src/db/schema');
    orm = await import('drizzle-orm');

    const reasons = await db
      .select({ id: schema.statusReasons.id, code: schema.statusReasons.code })
      .from(schema.statusReasons);
    reasonId = Object.fromEntries(reasons.map((r) => [r.code, r.id]));
    const [d] = await db.execute<{ d: string }>(orm.sql`select app_today()::text as d`);
    today = String(d?.d);
  });
  afterAll(() => app.close());

  // Put team 258751 back the way init.sql left it.
  afterEach(async () => {
    const { and, eq, inArray, isNull, sql } = orm;
    const { favorites, reportAudit, reports } = schema;
    const team2 = [U.team2Cmd, U.s21, U.s22, U.s23];
    await db.delete(reportAudit).where(
      and(inArray(reportAudit.userId, team2), sql`${reportAudit.createdAt} > now() - interval '5 minutes'`),
    );
    await db.delete(reports).where(and(eq(reports.userId, U.s23), eq(reports.reportDate, today)));
    await db
      .update(reports)
      .set({ approvedBy: null, approvedAt: null })
      .where(and(inArray(reports.userId, team2), eq(reports.reportDate, today), isNull(reports.finalizedAt)));
    await db.delete(favorites).where(eq(favorites.commanderId, U.team2Cmd));
  });

  const call = (
    method: 'POST' | 'PUT' | 'DELETE' | 'GET',
    url: string,
    userId?: string,
    payload?: unknown,
  ) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      headers: userId ? { 'x-test-user': userId } : {},
      ...(payload === undefined ? {} : { payload: payload as object }),
    });

  const reportIdOf = async (userId: string, date: string) => {
    const [r] = await db
      .select({ id: schema.reports.id })
      .from(schema.reports)
      .where(orm.and(orm.eq(schema.reports.userId, userId), orm.eq(schema.reports.reportDate, date)));
    return String(r?.id);
  };

  const auditFor = (userId: string, action: string) =>
    db
      .select({ id: schema.reportAudit.id, actorId: schema.reportAudit.actorId })
      .from(schema.reportAudit)
      .where(
        orm.and(
          orm.eq(schema.reportAudit.userId, userId),
          orm.eq(schema.reportAudit.action, action),
          orm.sql`${schema.reportAudit.createdAt} > now() - interval '2 minutes'`,
        ),
      );

  describe('POST /commander/reports/approve', () => {
    test('approves a single report and audits it', async () => {
      const id = await reportIdOf(U.s21, today);
      const res = await call('POST', '/commander/reports/approve', U.team2Cmd, { reportIds: [id] });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ approvedCount: 1 });

      const [row] = await db
        .select({ approvedBy: schema.reports.approvedBy, approvedAt: schema.reports.approvedAt })
        .from(schema.reports)
        .where(orm.eq(schema.reports.id, id));
      expect(row?.approvedBy).toBe(U.team2Cmd);
      expect(row?.approvedAt).toBeTruthy();
      expect(await auditFor(U.s21, 'approve')).toHaveLength(1);
    });

    test('approves in bulk', async () => {
      const ids = [await reportIdOf(U.s21, today), await reportIdOf(U.s22, today)];
      const res = await call('POST', '/commander/reports/approve', U.team2Cmd, { reportIds: ids });
      expect(res.json()).toEqual({ approvedCount: 2 });
    });

    test('one out-of-scope id rejects the whole call and changes nothing', async () => {
      const mine = await reportIdOf(U.s21, today);
      const theirs = await reportIdOf(U.soldier13, today);
      const res = await call('POST', '/commander/reports/approve', U.team2Cmd, {
        reportIds: [mine, theirs],
      });
      expect(res.statusCode).toBe(403);

      const [row] = await db
        .select({ approvedAt: schema.reports.approvedAt })
        .from(schema.reports)
        .where(orm.eq(schema.reports.id, mine));
      expect(row?.approvedAt).toBeNull();
      expect(await auditFor(U.s21, 'approve')).toHaveLength(0);
    });

    test('an id that does not exist is refused as out of scope, not 404', async () => {
      const res = await call('POST', '/commander/reports/approve', U.team2Cmd, {
        reportIds: [MISSING],
      });
      expect(res.statusCode).toBe(403);
    });

    test('a commander cannot approve their own report', async () => {
      const id = await reportIdOf(U.team2Cmd, today);
      expect((await call('POST', '/commander/reports/approve', U.team2Cmd, { reportIds: [id] })).statusCode).toBe(403);
    });

    test('a finalized report is read-only for the commander', async () => {
      const old = await reportIdOf(U.s21, await daysAgo(10));
      const res = await call('POST', '/commander/reports/approve', U.team2Cmd, { reportIds: [old] });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('DAY_FINALIZED');
    });

    test('rejects an empty list and more than 200 ids', async () => {
      expect((await call('POST', '/commander/reports/approve', U.team2Cmd, { reportIds: [] })).statusCode).toBe(400);
      const many = Array.from({ length: 201 }, () => MISSING);
      expect((await call('POST', '/commander/reports/approve', U.team2Cmd, { reportIds: many })).statusCode).toBe(400);
    });

    test('unauthenticated → 401, plain soldier → 403', async () => {
      const id = await reportIdOf(U.s21, today);
      expect((await call('POST', '/commander/reports/approve', undefined, { reportIds: [id] })).statusCode).toBe(401);
      expect((await call('POST', '/commander/reports/approve', U.s22, { reportIds: [id] })).statusCode).toBe(403);
    });
  });

  describe('PUT /commander/soldiers/:userId/reports/:date', () => {
    const put = (actor: string, soldier: string, date: string, body: unknown) =>
      call('PUT', `/commander/soldiers/${soldier}/reports/${date}`, actor, body);

    test('reports for a soldier who did not report, and audits a create', async () => {
      const res = await put(U.team2Cmd, U.s23, today, { reasonId: reasonId.present });
      expect(res.statusCode).toBe(200);
      const report = reportSchema.parse(res.json());
      expect(report.source).toBe('commander');
      expect(report.reportedBy.id).toBe(U.team2Cmd);
      expect(report.lastModifiedBy.id).toBe(U.team2Cmd);
      expect(report.reason.code).toBe('present');
      expect(report.approvedAt).toBeTruthy(); // SPEC §9 row 37
      expect(await auditFor(U.s23, 'create')).toHaveLength(1);
    });

    test('edits an existing report and audits an update', async () => {
      const res = await put(U.team2Cmd, U.s21, today, { reasonId: reasonId.errands_day });
      expect(res.statusCode).toBe(200);
      const report = reportSchema.parse(res.json());
      expect(report.reason.code).toBe('errands_day');
      expect(report.source).toBe('commander');
      expect(report.approvedAt).toBeTruthy(); // SPEC §9 row 37
      const audit = await auditFor(U.s21, 'update');
      expect(audit).toHaveLength(1);
      expect(audit[0]?.actorId).toBe(U.team2Cmd);
    });

    test('commander-only reasons are allowed here', async () => {
      const res = await put(U.team2Cmd, U.s21, today, { reasonId: reasonId.course });
      expect(res.statusCode).toBe(200);
      expect(reportSchema.parse(res.json()).reason.code).toBe('course');
    });

    test('a note is refused on a reason that does not allow one', async () => {
      const res = await put(U.team2Cmd, U.s21, today, { reasonId: reasonId.present, note: 'שלום' });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('NOTE_NOT_ALLOWED');
    });

    test('a reason that requires a document is refused when there is none', async () => {
      const res = await put(U.team2Cmd, U.s21, today, { reasonId: reasonId.sick_gimelim });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('DOCUMENT_REQUIRED');
    });

    test('a commander may write today and up to 7 days ahead', async () => {
      expect((await put(U.team2Cmd, U.s23, await daysAhead(7), { reasonId: reasonId.present })).statusCode).toBe(200);
      const res = await put(U.team2Cmd, U.s23, await daysAhead(8), { reasonId: reasonId.present });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('OUT_OF_WINDOW');
      await db
        .delete(schema.reports)
        .where(orm.and(orm.eq(schema.reports.userId, U.s23), orm.gt(schema.reports.reportDate, today)));
    });

    test('a commander may not write a past day', async () => {
      const res = await put(U.team2Cmd, U.s21, await daysAgo(1), { reasonId: reasonId.present });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('DAY_LOCKED');
    });

    test('a commander may not touch a finalized day', async () => {
      const res = await put(U.team2Cmd, U.s21, await daysAgo(10), { reasonId: reasonId.present });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('DAY_FINALIZED');
    });

    test('HR may write a past day, and the write is marked as HR', async () => {
      const date = await daysAgo(1);
      const before = await snapshot(U.s21, date);
      try {
        const res = await put(U.hrTeam2, U.s21, date, { reasonId: reasonId.errands_day });
        expect(res.statusCode).toBe(200);
        const report = reportSchema.parse(res.json());
        expect(report.source).toBe('hr');
        expect(report.lastModifiedBy.id).toBe(U.hrTeam2);
      } finally {
        await restore(U.s21, date, before);
      }
    });

    test('a commander from another branch → 403', async () => {
      expect((await put(U.team1Cmd, U.s21, today, { reasonId: reasonId.present })).statusCode).toBe(403);
    });

    test('an HR user from another unit → 403', async () => {
      expect((await put(U.hrTeam2, U.soldier13, today, { reasonId: reasonId.present })).statusCode).toBe(403);
    });

    test('a soldier cannot use the commander editor on a peer', async () => {
      expect((await put(U.s22, U.s21, today, { reasonId: reasonId.present })).statusCode).toBe(403);
    });

    test('rejects an unknown reason, an over-long note and unknown fields', async () => {
      expect((await put(U.team2Cmd, U.s21, today, { reasonId: 99999 })).statusCode).toBe(400);
      expect(
        (await put(U.team2Cmd, U.s21, today, { reasonId: reasonId.after_duty, note: 'x'.repeat(201) })).statusCode,
      ).toBe(400);
      expect(
        (await put(U.team2Cmd, U.s21, today, { reasonId: reasonId.present, documentId: DOC })).statusCode,
      ).toBe(400);
    });

    test('the soldier id cannot be spoofed through the body', async () => {
      const res = await put(U.team2Cmd, U.s21, today, {
        reasonId: reasonId.present,
        userId: U.soldier13,
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('favorites', () => {
    test('starring and unstarring a soldier in scope', async () => {
      expect((await call('PUT', `/commander/favorites/${U.s21}`, U.team2Cmd)).statusCode).toBe(204);
      const listed = await call('GET', `/commander/groups/00000000-0000-0000-0000-00000000a004/reports`, U.team2Cmd);
      expect(listed.json().rows[0].soldier.id).toBe(U.s21);
      expect(listed.json().rows[0].isFavorite).toBe(true);

      // Starring twice is harmless.
      expect((await call('PUT', `/commander/favorites/${U.s21}`, U.team2Cmd)).statusCode).toBe(204);
      expect((await call('DELETE', `/commander/favorites/${U.s21}`, U.team2Cmd)).statusCode).toBe(204);
      const after = await call('GET', `/commander/groups/00000000-0000-0000-0000-00000000a004/reports`, U.team2Cmd);
      expect(after.json().rows.every((r: { isFavorite: boolean }) => !r.isFavorite)).toBe(true);
    });

    test('a soldier out of scope cannot be starred', async () => {
      expect((await call('PUT', `/commander/favorites/${U.soldier13}`, U.team2Cmd)).statusCode).toBe(403);
      expect((await call('DELETE', `/commander/favorites/${U.soldier13}`, U.team2Cmd)).statusCode).toBe(403);
    });
  });

  describe('GET /commander/documents/:documentId/url', () => {
    test('a document belonging to another branch → 403', async () => {
      expect((await call('GET', `/commander/documents/${DOC}/url`, U.team2Cmd)).statusCode).toBe(403);
    });

    test('an unknown document → 404', async () => {
      expect((await call('GET', `/commander/documents/${MISSING}/url`, U.team1Cmd)).statusCode).toBe(404);
    });

    test('in scope → a signed URL that expires in 60 seconds', async () => {
      process.env.SUPABASE_URL = 'https://project.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ signedURL: '/object/sign/sick-documents/x.pdf?token=abc' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      try {
        const res = await call('GET', `/commander/documents/${DOC}/url`, U.team1Cmd);
        expect(res.statusCode).toBe(200);
        const body = documentUrlResponseSchema.parse(res.json());
        expect(body.url).toContain('/storage/v1/object/sign/sick-documents/');
        expect(res.body).not.toContain('service-role-secret');

        const ttl = (Date.parse(body.expiresAt) - Date.now()) / 1000;
        expect(ttl).toBeGreaterThan(50);
        expect(ttl).toBeLessThanOrEqual(60);

        const [, init] = fetchSpy.mock.calls[0] ?? [];
        expect(JSON.parse(String(init?.body))).toEqual({ expiresIn: 60 });
      } finally {
        fetchSpy.mockRestore();
        delete process.env.SUPABASE_URL;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      }
    });

    test('HR covering the unit may open the document too', async () => {
      process.env.SUPABASE_URL = 'https://project.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ signedURL: '/object/sign/sick-documents/x.pdf?token=abc' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      try {
        expect((await call('GET', `/commander/documents/${DOC}/url`, U.hrBattalion)).statusCode).toBe(200);
        expect((await call('GET', `/commander/documents/${DOC}/url`, U.hrTeam2)).statusCode).toBe(403);
      } finally {
        spy.mockRestore();
        delete process.env.SUPABASE_URL;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      }
    });
  });

  // ---- helpers ----

  async function daysAgo(n: number) {
    const [r] = await db.execute<{ d: string }>(orm.sql`select (app_today() - ${n}::int)::text as d`);
    return String(r?.d);
  }
  async function daysAhead(n: number) {
    const [r] = await db.execute<{ d: string }>(orm.sql`select (app_today() + ${n}::int)::text as d`);
    return String(r?.d);
  }
  async function snapshot(userId: string, date: string) {
    const [r] = await db
      .select()
      .from(schema.reports)
      .where(orm.and(orm.eq(schema.reports.userId, userId), orm.eq(schema.reports.reportDate, date)));
    return r;
  }
  async function restore(userId: string, date: string, row: Awaited<ReturnType<typeof snapshot>>) {
    if (!row) return;
    await db
      .update(schema.reports)
      .set({ reasonId: row.reasonId, note: row.note, source: row.source, lastModifiedBy: row.lastModifiedBy })
      .where(orm.and(orm.eq(schema.reports.userId, userId), orm.eq(schema.reports.reportDate, date)));
    await db
      .delete(schema.reportAudit)
      .where(
        orm.and(
          orm.eq(schema.reportAudit.userId, userId),
          orm.sql`${schema.reportAudit.createdAt} > now() - interval '2 minutes'`,
        ),
      );
  }
});
