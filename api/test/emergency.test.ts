import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  activeEmergenciesResponseSchema,
  emergencyDetailResponseSchema,
  startEmergencyResponseSchema,
} from '@doch1/shared';

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

// Emergencies are their own tables, so this file only ever creates and removes events —
// it never touches the reports the other suites assert on.
const U = {
  battalionCmd: '00000000-0000-0000-0000-000000000001',
  companyCmd: '00000000-0000-0000-0000-000000000002',
  team1Cmd: '00000000-0000-0000-0000-000000000003',
  team2Cmd: '00000000-0000-0000-0000-000000000004',
  s11: '00000000-0000-0000-0000-000000000011',
  s12: '00000000-0000-0000-0000-000000000012',
  s21: '00000000-0000-0000-0000-000000000021',
  hrBattalion: '00000000-0000-0000-0000-000000000098',
  hrTeam2: '00000000-0000-0000-0000-000000000099',
};
const G = {
  battalion: '00000000-0000-0000-0000-00000000a001',
  company: '00000000-0000-0000-0000-00000000a002',
  team1: '00000000-0000-0000-0000-00000000a003',
  team2: '00000000-0000-0000-0000-00000000a004',
};
const SEEDED_CLOSED = '00000000-0000-0000-0000-0000000e0001';
const MISSING = '00000000-0000-0000-0000-0000000000ff';

describe.skipIf(!process.env.DATABASE_URL)('C4 emergency roll-call (F10)', () => {
  let app: FastifyInstance;
  let db: typeof import('../src/db/client')['db'];
  let schema: typeof import('../src/db/schema');
  let orm: typeof import('drizzle-orm');
  const created = new Set<string>();

  beforeAll(async () => {
    db = (await import('../src/db/client')).db;
    schema = await import('../src/db/schema');
    orm = await import('drizzle-orm');
  });

  // Starting an emergency is rate-limited to 5/min per user (SECURITY.md §8), and the limiter's
  // store lives on the app instance. A fresh app per test keeps that limit real in production
  // while letting each test start from an empty bucket.
  beforeEach(async () => {
    app = await (await import('../src/server')).buildServer();
  });
  afterEach(async () => {
    await app.close();
    // Only the events this test created — never a blanket delete, which would take out rows
    // another suite is relying on.
    if (created.size > 0) {
      await db.delete(schema.emergencyEvents).where(orm.inArray(schema.emergencyEvents.id, [...created]));
      created.clear();
    }
  });

  const call = (method: 'POST' | 'GET', url: string, userId?: string, payload?: unknown) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      headers: userId ? { 'x-test-user': userId } : {},
      ...(payload === undefined ? {} : { payload: payload as object }),
    });

  async function start(actor: string, groupId: string, includeSub = true, message?: string) {
    const res = await call('POST', '/commander/emergencies', actor, {
      groupId,
      includeSub,
      ...(message === undefined ? {} : { message }),
    });
    expect(res.statusCode).toBe(200);
    const { id } = startEmergencyResponseSchema.parse(res.json());
    created.add(id);
    return id;
  }

  describe('POST /commander/emergencies', () => {
    test('a commander starts one for their own group', async () => {
      const id = await start(U.team1Cmd, G.team1);
      const detail = emergencyDetailResponseSchema.parse(
        (await call('GET', `/commander/emergencies/${id}`, U.team1Cmd)).json(),
      );
      expect(detail.group.id).toBe(G.team1);
      expect(detail.startedBy.id).toBe(U.team1Cmd);
      expect(detail.endedAt).toBeNull();
    });

    test('a commander may start one for a group below them, with a message', async () => {
      const id = await start(U.battalionCmd, G.team2, true, 'תרגיל');
      const detail = emergencyDetailResponseSchema.parse(
        (await call('GET', `/commander/emergencies/${id}`, U.battalionCmd)).json(),
      );
      expect(detail.message).toBe('תרגיל');
    });

    test('only one open event per group', async () => {
      await start(U.team1Cmd, G.team1);
      const res = await call('POST', '/commander/emergencies', U.team1Cmd, {
        groupId: G.team1,
        includeSub: true,
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('EMERGENCY_ALREADY_OPEN');
    });

    test('the group can be re-used once the event has ended', async () => {
      const first = await start(U.team1Cmd, G.team1);
      expect((await call('POST', `/commander/emergencies/${first}/end`, U.team1Cmd)).statusCode).toBe(204);
      await expect(start(U.team1Cmd, G.team1)).resolves.toBeTruthy();
    });

    test('a commander from another branch → 403', async () => {
      expect(
        (await call('POST', '/commander/emergencies', U.team1Cmd, { groupId: G.team2, includeSub: true }))
          .statusCode,
      ).toBe(403);
    });

    test('a commander cannot start one for a group above them → 403', async () => {
      expect(
        (await call('POST', '/commander/emergencies', U.team1Cmd, { groupId: G.battalion, includeSub: true }))
          .statusCode,
      ).toBe(403);
    });

    test('a plain soldier → 403, unauthenticated → 401', async () => {
      const body = { groupId: G.team1, includeSub: true };
      expect((await call('POST', '/commander/emergencies', U.s11, body)).statusCode).toBe(403);
      expect((await call('POST', '/commander/emergencies', undefined, body)).statusCode).toBe(401);
    });

    test('rejects a bad body', async () => {
      expect((await call('POST', '/commander/emergencies', U.team1Cmd, { groupId: 'nope' })).statusCode).toBe(400);
      expect(
        (await call('POST', '/commander/emergencies', U.team1Cmd, {
          groupId: G.team1,
          includeSub: true,
          message: 'x'.repeat(201),
        })).statusCode,
      ).toBe(400);
    });
  });

  describe('GET /emergencies/active (soldier banner)', () => {
    test('everyone in the group sees it, including the commander who started it', async () => {
      const id = await start(U.team1Cmd, G.team1);
      for (const user of [U.s11, U.s12, U.team1Cmd]) {
        const body = activeEmergenciesResponseSchema.parse((await call('GET', '/emergencies/active', user)).json());
        expect(body.events.map((e) => e.id)).toEqual([id]);
        expect(body.events[0]?.myResponse).toBeNull();
      }
    });

    test('a soldier in another team sees nothing', async () => {
      await start(U.team1Cmd, G.team1);
      const body = activeEmergenciesResponseSchema.parse((await call('GET', '/emergencies/active', U.s21)).json());
      expect(body.events).toEqual([]);
    });

    test('includeSub reaches the teams below', async () => {
      const id = await start(U.companyCmd, G.company, true);
      for (const user of [U.s11, U.s21, U.companyCmd]) {
        const body = activeEmergenciesResponseSchema.parse((await call('GET', '/emergencies/active', user)).json());
        expect(body.events.map((e) => e.id)).toEqual([id]);
      }
    });

    test('without includeSub it stays on its own group', async () => {
      await start(U.companyCmd, G.company, false);
      const below = activeEmergenciesResponseSchema.parse((await call('GET', '/emergencies/active', U.s11)).json());
      expect(below.events).toEqual([]);
      const own = activeEmergenciesResponseSchema.parse(
        (await call('GET', '/emergencies/active', U.companyCmd)).json(),
      );
      expect(own.events).toHaveLength(1);
    });

    test('a closed event never shows', async () => {
      const body = activeEmergenciesResponseSchema.parse((await call('GET', '/emergencies/active', U.s11)).json());
      expect(body.events.map((e) => e.id)).not.toContain(SEEDED_CLOSED);
    });

    test('HR has no group, so no banner', async () => {
      await start(U.battalionCmd, G.battalion, true);
      const body = activeEmergenciesResponseSchema.parse(
        (await call('GET', '/emergencies/active', U.hrBattalion)).json(),
      );
      expect(body.events).toEqual([]);
    });
  });

  describe('POST /emergencies/:id/respond', () => {
    test('a soldier answers, and can change the answer while it is open', async () => {
      const id = await start(U.team1Cmd, G.team1);
      expect((await call('POST', `/emergencies/${id}/respond`, U.s11, { status: 'ok' })).statusCode).toBe(204);

      let body = activeEmergenciesResponseSchema.parse((await call('GET', '/emergencies/active', U.s11)).json());
      expect(body.events[0]?.myResponse).toBe('ok');

      expect(
        (await call('POST', `/emergencies/${id}/respond`, U.s11, { status: 'need_help' })).statusCode,
      ).toBe(204);
      body = activeEmergenciesResponseSchema.parse((await call('GET', '/emergencies/active', U.s11)).json());
      expect(body.events[0]?.myResponse).toBe('need_help');
    });

    test('a soldier outside the event → 403', async () => {
      const id = await start(U.team1Cmd, G.team1);
      expect((await call('POST', `/emergencies/${id}/respond`, U.s21, { status: 'ok' })).statusCode).toBe(403);
    });

    test('answering a closed event → 409', async () => {
      const id = await start(U.team1Cmd, G.team1);
      await call('POST', `/commander/emergencies/${id}/end`, U.team1Cmd);
      const res = await call('POST', `/emergencies/${id}/respond`, U.s11, { status: 'ok' });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('EMERGENCY_ENDED');
    });

    test('rejects an unknown event, a bad id and a bad status', async () => {
      const id = await start(U.team1Cmd, G.team1);
      expect((await call('POST', `/emergencies/${MISSING}/respond`, U.s11, { status: 'ok' })).statusCode).toBe(404);
      expect((await call('POST', '/emergencies/nope/respond', U.s11, { status: 'ok' })).statusCode).toBe(400);
      expect((await call('POST', `/emergencies/${id}/respond`, U.s11, { status: 'maybe' })).statusCode).toBe(400);
    });

    test('unauthenticated → 401', async () => {
      const id = await start(U.team1Cmd, G.team1);
      expect((await call('POST', `/emergencies/${id}/respond`, undefined, { status: 'ok' })).statusCode).toBe(401);
    });
  });

  describe('GET /commander/emergencies/:id (live view)', () => {
    test('counts every active member and pins "need help" to the top', async () => {
      const id = await start(U.team1Cmd, G.team1);
      await call('POST', `/emergencies/${id}/respond`, U.s11, { status: 'ok' });
      await call('POST', `/emergencies/${id}/respond`, U.s12, { status: 'need_help' });

      const detail = emergencyDetailResponseSchema.parse(
        (await call('GET', `/commander/emergencies/${id}`, U.team1Cmd)).json(),
      );
      // The commander plus soldiers 11–18.
      expect(detail.responses).toHaveLength(9);
      expect(detail.counts).toEqual({ ok: 1, needHelp: 1, noResponse: 7 });
      expect(detail.responses[0]?.soldier.id).toBe(U.s12);
      expect(detail.responses[0]?.status).toBe('need_help');
      expect(detail.responses[0]?.respondedAt).toBeTruthy();
      // "ok" sorts last, after everyone who hasn't answered.
      expect(detail.responses.at(-1)?.soldier.id).toBe(U.s11);
    });

    test('a commander above the event can watch it', async () => {
      const id = await start(U.team1Cmd, G.team1);
      expect((await call('GET', `/commander/emergencies/${id}`, U.battalionCmd)).statusCode).toBe(200);
      expect((await call('GET', `/commander/emergencies/${id}`, U.companyCmd)).statusCode).toBe(200);
    });

    test('a commander from another branch → 403', async () => {
      const id = await start(U.team1Cmd, G.team1);
      expect((await call('GET', `/commander/emergencies/${id}`, U.team2Cmd)).statusCode).toBe(403);
    });

    test('an HR user from another unit → 403, one covering it → 200', async () => {
      const id = await start(U.team1Cmd, G.team1);
      expect((await call('GET', `/commander/emergencies/${id}`, U.hrTeam2)).statusCode).toBe(403);
      expect((await call('GET', `/commander/emergencies/${id}`, U.hrBattalion)).statusCode).toBe(200);
    });

    test('a plain soldier cannot read the live view → 403', async () => {
      const id = await start(U.team1Cmd, G.team1);
      expect((await call('GET', `/commander/emergencies/${id}`, U.s11)).statusCode).toBe(403);
    });

    test('an unknown event → 404', async () => {
      expect((await call('GET', `/commander/emergencies/${MISSING}`, U.team1Cmd)).statusCode).toBe(404);
    });
  });

  describe('POST /commander/emergencies/:id/end', () => {
    test('ending clears the soldiers’ banner', async () => {
      const id = await start(U.team1Cmd, G.team1);
      expect((await call('POST', `/commander/emergencies/${id}/end`, U.team1Cmd)).statusCode).toBe(204);

      const body = activeEmergenciesResponseSchema.parse((await call('GET', '/emergencies/active', U.s11)).json());
      expect(body.events).toEqual([]);

      const detail = emergencyDetailResponseSchema.parse(
        (await call('GET', `/commander/emergencies/${id}`, U.team1Cmd)).json(),
      );
      expect(detail.endedAt).toBeTruthy();
    });

    test('ending twice → 409', async () => {
      const id = await start(U.team1Cmd, G.team1);
      await call('POST', `/commander/emergencies/${id}/end`, U.team1Cmd);
      const res = await call('POST', `/commander/emergencies/${id}/end`, U.team1Cmd);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('EMERGENCY_ENDED');
    });

    test('a commander from another branch cannot end it → 403', async () => {
      const id = await start(U.team1Cmd, G.team1);
      expect((await call('POST', `/commander/emergencies/${id}/end`, U.team2Cmd)).statusCode).toBe(403);
      expect((await call('POST', `/commander/emergencies/${id}/end`, U.s11)).statusCode).toBe(403);
    });

    test('a commander above the event may end it', async () => {
      const id = await start(U.team1Cmd, G.team1);
      expect((await call('POST', `/commander/emergencies/${id}/end`, U.battalionCmd)).statusCode).toBe(204);
    });

    test('an unknown event → 404', async () => {
      expect((await call('POST', `/commander/emergencies/${MISSING}/end`, U.team1Cmd)).statusCode).toBe(404);
    });
  });

  describe('the F8 toggle sees the open event', () => {
    test('openEmergencyId appears on the group reports list', async () => {
      const id = await start(U.team1Cmd, G.team1);
      const res = await call('GET', `/commander/groups/${G.team1}/reports`, U.team1Cmd);
      expect(res.json().openEmergencyId).toBe(id);
    });
  });
});
