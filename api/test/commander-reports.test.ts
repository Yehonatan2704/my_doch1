import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { groupReportsResponseSchema, type GroupReportsResponse } from '@doch1/shared';

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

const U = {
  battalionCmd: '00000000-0000-0000-0000-000000000001',
  companyCmd: '00000000-0000-0000-0000-000000000002',
  team1Cmd: '00000000-0000-0000-0000-000000000003',
  team2Cmd: '00000000-0000-0000-0000-000000000004',
  soldier11: '00000000-0000-0000-0000-000000000011',
  soldier13: '00000000-0000-0000-0000-000000000013', // starred, after_duty + note today
  soldier14: '00000000-0000-0000-0000-000000000014', // annual_leave today
  soldier16: '00000000-0000-0000-0000-000000000016', // starred, did not report today
  hrBattalion: '00000000-0000-0000-0000-000000000098',
  hrTeam2: '00000000-0000-0000-0000-000000000099',
};
const G = {
  battalion: '00000000-0000-0000-0000-00000000a001',
  company: '00000000-0000-0000-0000-00000000a002',
  team1: '00000000-0000-0000-0000-00000000a003',
  team2: '00000000-0000-0000-0000-00000000a004',
};

describe.skipIf(!process.env.DATABASE_URL)('C2 GET /commander/groups/:groupId/reports', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await (await import('../src/server')).buildServer();
  });
  afterAll(() => app.close());

  const raw = (groupId: string, userId?: string, query = '') =>
    app.inject({
      url: `/api/v1/commander/groups/${groupId}/reports${query}`,
      headers: userId ? { 'x-test-user': userId } : {},
    });

  async function get(groupId: string, userId: string, query = ''): Promise<GroupReportsResponse> {
    const res = await raw(groupId, userId, query);
    expect(res.statusCode).toBe(200);
    return groupReportsResponseSchema.parse(res.json());
  }

  const names = (b: GroupReportsResponse) => b.rows.map((r) => r.soldier.id);

  describe('authorization', () => {
    test('unauthenticated → 401', async () => {
      expect((await raw(G.team1)).statusCode).toBe(401);
    });

    test('a commander from another branch → 403', async () => {
      expect((await raw(G.team1, U.team2Cmd)).statusCode).toBe(403);
      expect((await raw(G.team2, U.team1Cmd)).statusCode).toBe(403);
    });

    test('a commander cannot look upwards → 403', async () => {
      expect((await raw(G.battalion, U.team1Cmd)).statusCode).toBe(403);
    });

    test('an HR user from another unit → 403', async () => {
      expect((await raw(G.team1, U.hrTeam2)).statusCode).toBe(403);
    });

    test('a plain soldier → 403', async () => {
      expect((await raw(G.team1, U.soldier11)).statusCode).toBe(403);
    });

    test('HR sees the units assigned to it', async () => {
      expect((await raw(G.team2, U.hrTeam2)).statusCode).toBe(200);
      expect((await raw(G.team1, U.hrBattalion)).statusCode).toBe(200);
    });

    test('a malformed group id → 400, not 403', async () => {
      expect((await raw('not-a-uuid', U.team1Cmd)).statusCode).toBe(400);
    });
  });

  describe('rows and counts (team 258750, today)', () => {
    test('every active member gets a row, reported or not — except the actor', async () => {
      const body = await get(G.team1, U.team1Cmd);
      // Soldiers 11–18. Never the commander themselves: same rule as can_act_on(), so a
      // "select all → approve" can't include a row the approve call would reject.
      expect(body.rows).toHaveLength(8);
      expect(names(body)).not.toContain(U.team1Cmd);
      const notReported = body.rows.filter((r) => r.report === null);
      expect(notReported).toHaveLength(3);
    });

    test('counts summarise the whole group', async () => {
      const { counts } = await get(G.team1, U.team1Cmd);
      expect(counts).toEqual({
        total: 8,
        present: 3,
        away: 2,
        notReported: 3,
        pendingApproval: 3,
      });
    });

    test('counts ignore the row filters, so the chips stay stable', async () => {
      const filtered = await get(G.team1, U.team1Cmd, '?category=annual_leave');
      expect(filtered.rows).toHaveLength(1);
      expect(filtered.counts.total).toBe(8);
    });

    test('the report carries both approval stages and the embedded reason', async () => {
      const body = await get(G.team1, U.team1Cmd);
      const withNote = body.rows.find((r) => r.soldier.id === U.soldier13)?.report;
      expect(withNote?.reason.code).toBe('after_duty');
      expect(withNote?.reason.categoryCode).toBe('outside_unit');
      expect(withNote?.note).toBeTruthy();
      expect(withNote?.approvedAt).toBeNull();

      const approved = body.rows.find((r) => r.soldier.id === U.soldier11)?.report;
      expect(approved?.approvedBy?.id).toBe(U.team1Cmd);
      expect(approved?.approvedAt).toBeTruthy();
      expect(approved?.finalizedAt).toBeNull();
    });

    // `openEmergencyId` is covered by the C4 suite (test/emergency.test.ts), which owns the
    // emergency tables. Asserting it from here as well would race with it: the files run in
    // parallel against one database, and an event C4 opens on an ancestor group legitimately
    // shows up on this list.
  });

  describe('filters', () => {
    test('pending=true keeps only reports still awaiting approval', async () => {
      const body = await get(G.team1, U.team1Cmd, '?pending=true');
      expect(body.rows).toHaveLength(3);
      expect(body.rows.every((r) => r.report !== null && r.report.approvedAt === null)).toBe(true);
    });

    test('category=not_reported keeps only the soldiers with no report', async () => {
      const body = await get(G.team1, U.team1Cmd, '?category=not_reported');
      expect(body.rows).toHaveLength(3);
      expect(body.rows.every((r) => r.report === null)).toBe(true);
    });

    test('category filters by the report category', async () => {
      const body = await get(G.team1, U.team1Cmd, '?category=annual_leave');
      expect(names(body)).toEqual([U.soldier14]);
    });

    test('an unknown category → 400', async () => {
      expect((await raw(G.team1, U.team1Cmd, '?category=nope')).statusCode).toBe(400);
    });

    test('search matches first, last and full name', async () => {
      const byFirst = await get(G.team1, U.team1Cmd, '?q=%D7%AA%D7%9E%D7%A8'); // תמר
      expect(names(byFirst)).toEqual([U.soldier13]);
      const byFull = await get(G.team1, U.team1Cmd, '?q=%D7%AA%D7%9E%D7%A8%20%D7%96%D7%99%D7%95'); // תמר זיו
      expect(names(byFull)).toEqual([U.soldier13]);
    });

    test('LIKE metacharacters in the search are escaped, not interpreted', async () => {
      // An unescaped '%' would match every soldier; escaped, it matches nobody.
      expect((await get(G.team1, U.team1Cmd, '?q=%25')).rows).toHaveLength(0);
      expect((await get(G.team1, U.team1Cmd, '?q=_')).rows).toHaveLength(0);
    });

    test('a date in the past still lists the group', async () => {
      const body = await get(G.team1, U.team1Cmd, '?date=2000-01-01');
      expect(body.date).toBe('2000-01-01');
      expect(body.counts.notReported).toBe(8);
    });

    test('a malformed date → 400', async () => {
      expect((await raw(G.team1, U.team1Cmd, '?date=2026-02-30')).statusCode).toBe(400);
    });

    test('an unknown query field is rejected', async () => {
      expect((await raw(G.team1, U.team1Cmd, '?sortBy=name')).statusCode).toBe(400);
    });
  });

  describe('includeSub and ordering', () => {
    test('includeSub=false is just that group', async () => {
      // The company group's only member is its commander — who never lists themselves.
      const body = await get(G.company, U.companyCmd);
      expect(names(body)).toEqual([]);
    });

    test('includeSub=true walks the whole subtree', async () => {
      const body = await get(G.company, U.companyCmd, '?includeSub=true');
      // team 258750 (9) + team 258751 (5); the company commander (the actor) is not listed
      expect(body.rows).toHaveLength(14);
      expect(body.counts.total).toBe(14);
      const groupNames = new Set(body.rows.map((r) => r.soldier.groupName));
      expect(groupNames.size).toBe(2);
    });

    test('starred soldiers are pinned to the top', async () => {
      const body = await get(G.team1, U.team1Cmd);
      const starred = body.rows.filter((r) => r.isFavorite).map((r) => r.soldier.id);
      expect(starred).toEqual([U.soldier13, U.soldier16]);
      expect(names(body).slice(0, 2)).toEqual(starred);
    });

    test('sort=category groups the away reasons together, stars still first', async () => {
      const body = await get(G.team1, U.team1Cmd, '?sort=category');
      expect(body.rows[0]?.isFavorite).toBe(true);
      const unstarred = body.rows.filter((r) => !r.isFavorite);
      const categories = unstarred.map((r) => r.report?.reason.categoryCode ?? null);
      // Nulls (nobody reported) sort last.
      expect(categories.filter((c) => c !== null)).toEqual(
        categories.slice(0, categories.filter((c) => c !== null).length),
      );
    });

    test('an unknown sort is rejected rather than reaching the ORDER BY', async () => {
      expect((await raw(G.team1, U.team1Cmd, '?sort=lastName')).statusCode).toBe(400);
      expect((await raw(G.team1, U.team1Cmd, '?sort=name;drop')).statusCode).toBe(400);
    });
  });
});
