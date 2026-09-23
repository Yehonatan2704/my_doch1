import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// B1's auth is in place for real routes, but these tests drive identity through a header so
// they don't need Supabase tokens (see C1's tests).
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

/**
 * This suite owns a group of its own, outside the seeded battalion.
 *
 * Push tokens are global: if this file registered a token for a seeded soldier, an emergency
 * started by the C4 suite would look that token up and make a real HTTP call to Expo. Its own
 * group keeps the fan-out tests isolated and the network out of the test run.
 */
const G5 = '00000000-0000-0000-0000-0000000c5001';
const CMD = '00000000-0000-0000-0000-0000000c5011';
const SOL_A = '00000000-0000-0000-0000-0000000c5012';
const SOL_B = '00000000-0000-0000-0000-0000000c5013';
const HR = '00000000-0000-0000-0000-0000000c5014';
const OUTSIDER = '00000000-0000-0000-0000-000000000011'; // a seeded soldier, in another group
const ALL = [CMD, SOL_A, SOL_B, HR];

type PushMessage = { to: string; title: string; body: string; data?: Record<string, string> };

describe.skipIf(!process.env.DATABASE_URL)('C5 push notifications', () => {
  let app: FastifyInstance;
  let db: typeof import('../src/db/client')['db'];
  let schema: typeof import('../src/db/schema');
  let orm: typeof import('drizzle-orm');
  let push: typeof import('../src/modules/push/service');
  let today: string;
  let reasonId: Record<string, number>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    db = (await import('../src/db/client')).db;
    schema = await import('../src/db/schema');
    orm = await import('drizzle-orm');
    push = await import('../src/modules/push/service');

    const [d] = await db.execute<{ d: string }>(orm.sql`select app_today()::text as d`);
    today = String(d?.d);
    const reasons = await db
      .select({ id: schema.statusReasons.id, code: schema.statusReasons.code })
      .from(schema.statusReasons);
    reasonId = Object.fromEntries(reasons.map((r) => [r.code, r.id]));

    await cleanup();
    await db.insert(schema.users).values([
      person(CMD, '9500011', 'מפקד', 'בדיקה'),
      person(SOL_A, '9500012', 'חייל', 'אלף'),
      person(SOL_B, '9500013', 'חייל', 'בית'),
      { ...person(HR, '9500014', 'משאן', 'בדיקה'), role: 'admin' },
    ]);
    await db
      .insert(schema.groups)
      .values({ id: G5, name: 'קבוצת בדיקה C5', code: 'C5-TEST', commanderId: CMD });
    await db
      .update(schema.users)
      .set({ groupId: G5 })
      .where(orm.inArray(schema.users.id, [CMD, SOL_A, SOL_B]));
    await db.insert(schema.hrAssignments).values({ hrUserId: HR, groupId: G5 });
    await db
      .insert(schema.userSettings)
      .values([SOL_A, SOL_B, CMD].map((userId) => ({ userId })));
  });

  afterAll(cleanup);

  beforeEach(async () => {
    // Starting an emergency is rate-limited per user; a fresh app resets the limiter's store.
    app = await (await import('../src/server')).buildServer();
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"data":[]}', { status: 200 }));
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    await app.close();
    await db.delete(schema.pushTokens).where(orm.inArray(schema.pushTokens.userId, ALL));
    await db.delete(schema.reportAudit).where(orm.inArray(schema.reportAudit.userId, ALL));
    await db.delete(schema.reports).where(orm.inArray(schema.reports.userId, ALL));
    await db.delete(schema.emergencyEvents).where(orm.eq(schema.emergencyEvents.groupId, G5));
    await db
      .update(schema.userSettings)
      .set({ notifyCommanderChange: true, notifyHrChange: true })
      .where(orm.inArray(schema.userSettings.userId, ALL));
  });

  const call = (method: 'POST' | 'PUT', url: string, userId?: string, payload?: unknown) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      headers: userId ? { 'x-test-user': userId } : {},
      ...(payload === undefined ? {} : { payload: payload as object }),
    });

  const registerToken = (userId: string, suffix: string) =>
    call('POST', '/push-tokens', userId, {
      token: `ExponentPushToken[c5-${suffix}]`,
      platform: 'ios',
    });

  /** Every message posted to Expo across all batches. */
  function sentMessages(): PushMessage[] {
    const calls = fetchSpy.mock.calls as unknown as [unknown, RequestInit | undefined][];
    return calls
      .filter(([url]) => String(url).includes('exp.host'))
      .flatMap(([, init]) => JSON.parse(String(init?.body)) as PushMessage[]);
  }

  describe('POST /push-tokens', () => {
    test('registers a token for the logged-in user', async () => {
      expect((await registerToken(SOL_A, 'a')).statusCode).toBe(204);
      const [row] = await db
        .select({ userId: schema.pushTokens.userId, platform: schema.pushTokens.platform })
        .from(schema.pushTokens)
        .where(orm.eq(schema.pushTokens.token, 'ExponentPushToken[c5-a]'));
      expect(row?.userId).toBe(SOL_A);
      expect(row?.platform).toBe('ios');
    });

    test('re-registering the same device moves it to the current user', async () => {
      await registerToken(SOL_A, 'a');
      await registerToken(SOL_B, 'a');
      const rows = await db
        .select({ userId: schema.pushTokens.userId })
        .from(schema.pushTokens)
        .where(orm.eq(schema.pushTokens.token, 'ExponentPushToken[c5-a]'));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.userId).toBe(SOL_B);
    });

    test('the token is always the caller’s — the body cannot name another user', async () => {
      const res = await call('POST', '/push-tokens', SOL_A, {
        token: 'ExponentPushToken[c5-a]',
        platform: 'ios',
        userId: SOL_B,
      });
      expect(res.statusCode).toBe(400);
    });

    test('rejects a bad platform and an over-long token', async () => {
      expect(
        (await call('POST', '/push-tokens', SOL_A, { token: 'x', platform: 'symbian' })).statusCode,
      ).toBe(400);
      expect(
        (await call('POST', '/push-tokens', SOL_A, { token: 'x'.repeat(256), platform: 'ios' }))
          .statusCode,
      ).toBe(400);
    });

    test('unauthenticated → 401', async () => {
      const res = await call('POST', '/push-tokens', undefined, {
        token: 'ExponentPushToken[c5-a]',
        platform: 'ios',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('push on emergency start', () => {
    test('everyone in scope is notified, except the commander who started it', async () => {
      await registerToken(SOL_A, 'a');
      await registerToken(SOL_B, 'b');
      await registerToken(CMD, 'cmd');
      fetchSpy.mockClear();

      const res = await call('POST', '/commander/emergencies', CMD, {
        groupId: G5,
        includeSub: true,
      });
      expect(res.statusCode).toBe(200);

      const to = sentMessages().map((m) => m.to);
      expect(to).toContain('ExponentPushToken[c5-a]');
      expect(to).toContain('ExponentPushToken[c5-b]');
      expect(to).not.toContain('ExponentPushToken[c5-cmd]');
    });

    test('the text carries no personal data and no commander message', async () => {
      await registerToken(SOL_A, 'a');
      fetchSpy.mockClear();
      await call('POST', '/commander/emergencies', CMD, {
        groupId: G5,
        includeSub: true,
        message: 'רותם סער נפצעה',
      });

      const [msg] = sentMessages();
      expect(msg?.title).toBe('מצב חירום');
      expect(msg?.body).toBe('דווח/י מיד על מצבך');
      // The commander's free text may name people, so it never reaches the push.
      expect(JSON.stringify(msg)).not.toContain('רותם');
      expect(JSON.stringify(msg)).not.toContain('סער');
      expect(msg?.data?.type).toBe('emergency');
    });

    test('someone outside the group is never notified', async () => {
      await registerToken(SOL_A, 'a');
      fetchSpy.mockClear();
      // Fan-out only, no event row: the outsider's group is not in scope.
      await push.notifyEmergencyStarted('00000000-0000-0000-0000-0000000c5099', G5, true, CMD);
      const to = sentMessages().map((m) => m.to);
      expect(to).toEqual(['ExponentPushToken[c5-a]']);
      expect(to).not.toContain(OUTSIDER);
    });

    test('the roll-call still starts when Expo is unreachable', async () => {
      await registerToken(SOL_A, 'a');
      fetchSpy.mockRejectedValue(new Error('network down'));

      const res = await call('POST', '/commander/emergencies', CMD, {
        groupId: G5,
        includeSub: true,
      });
      expect(res.statusCode).toBe(200);

      const [event] = await db
        .select({ id: schema.emergencyEvents.id })
        .from(schema.emergencyEvents)
        .where(orm.eq(schema.emergencyEvents.groupId, G5));
      expect(event?.id).toBeTruthy();
    });
  });

  describe('push on a commander-edited report', () => {
    const edit = (actor: string, soldier: string) =>
      call('PUT', `/commander/soldiers/${soldier}/reports/${today}`, actor, {
        reasonId: reasonId.errands_day,
      });

    test('the soldier is notified, with no reason in the text', async () => {
      await registerToken(SOL_A, 'a');
      fetchSpy.mockClear();
      expect((await edit(CMD, SOL_A)).statusCode).toBe(200);

      const [msg] = sentMessages();
      expect(msg?.to).toBe('ExponentPushToken[c5-a]');
      expect(msg?.title).toBe('דוח 1');
      expect(msg?.body).toBe('יש עדכון בדיווח שלך');
      // No reason, category or diagnosis (SECURITY.md §12).
      expect(JSON.stringify(msg)).not.toContain('errands');
      expect(JSON.stringify(msg)).not.toContain('סידורים');
    });

    test('the commander toggle is respected', async () => {
      await registerToken(SOL_A, 'a');
      await db
        .update(schema.userSettings)
        .set({ notifyCommanderChange: false })
        .where(orm.eq(schema.userSettings.userId, SOL_A));
      fetchSpy.mockClear();

      await edit(CMD, SOL_A);
      expect(sentMessages()).toHaveLength(0);
    });

    test('an HR edit uses the separate HR toggle', async () => {
      await registerToken(SOL_A, 'a');
      await db
        .update(schema.userSettings)
        // Commander notifications off, HR notifications on: an HR edit must still arrive.
        .set({ notifyCommanderChange: false, notifyHrChange: true })
        .where(orm.eq(schema.userSettings.userId, SOL_A));
      fetchSpy.mockClear();

      expect((await edit(HR, SOL_A)).statusCode).toBe(200);
      expect(sentMessages()).toHaveLength(1);

      await db
        .update(schema.userSettings)
        .set({ notifyHrChange: false })
        .where(orm.eq(schema.userSettings.userId, SOL_A));
      fetchSpy.mockClear();
      await edit(HR, SOL_A);
      expect(sentMessages()).toHaveLength(0);
    });

    test('a soldier with no registered device is simply skipped', async () => {
      fetchSpy.mockClear();
      expect((await edit(CMD, SOL_B)).statusCode).toBe(200);
      expect(sentMessages()).toHaveLength(0);
    });

    test('the edit still succeeds when Expo is unreachable', async () => {
      await registerToken(SOL_A, 'a');
      fetchSpy.mockRejectedValue(new Error('network down'));
      expect((await edit(CMD, SOL_A)).statusCode).toBe(200);
    });

    test('a rejected edit sends nothing', async () => {
      await registerToken(SOL_A, 'a');
      fetchSpy.mockClear();
      // A commander from the seeded battalion has no business in this group.
      const res = await call('PUT', `/commander/soldiers/${SOL_A}/reports/${today}`, OUTSIDER, {
        reasonId: reasonId.errands_day,
      });
      expect(res.statusCode).toBe(403);
      expect(sentMessages()).toHaveLength(0);
    });
  });

  // ---- fixture helpers ----

  function person(id: string, personalNumber: string, firstName: string, lastName: string) {
    return {
      id,
      personalNumber,
      firstName,
      lastName,
      email: `c5.${personalNumber}@example.com`,
      role: 'soldier',
    };
  }

  /** Torn down in FK order: rows that point at the group and users go before they do. */
  async function cleanup() {
    const { eq, inArray } = orm;
    await db.delete(schema.pushTokens).where(inArray(schema.pushTokens.userId, ALL));
    await db.delete(schema.reportAudit).where(inArray(schema.reportAudit.userId, ALL));
    await db.delete(schema.reports).where(inArray(schema.reports.userId, ALL));
    await db.delete(schema.emergencyEvents).where(eq(schema.emergencyEvents.groupId, G5));
    await db.delete(schema.hrAssignments).where(inArray(schema.hrAssignments.hrUserId, ALL));
    await db.delete(schema.userSettings).where(inArray(schema.userSettings.userId, ALL));
    await db.update(schema.groups).set({ commanderId: null }).where(eq(schema.groups.id, G5));
    await db.update(schema.users).set({ groupId: null }).where(inArray(schema.users.id, ALL));
    await db.delete(schema.users).where(inArray(schema.users.id, ALL));
    await db.delete(schema.groups).where(eq(schema.groups.id, G5));
  }
});
