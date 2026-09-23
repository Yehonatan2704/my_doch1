import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { commanderGroupsResponseSchema } from '@doch1/shared';

// The real auth plugin is B1's job and still denies everything. Tests drive identity through a
// header so they can exercise authorization (C1) without depending on Supabase tokens.
vi.mock('../src/modules/auth/authenticate', () => ({
  authenticate: async (request: { headers: Record<string, string>; user?: unknown }) => {
    const id = request.headers['x-test-user'];
    if (!id) throw new (await import('../src/plugins/errors')).ApiError('UNAUTHORIZED');
    const { db } = await import('../src/db/client');
    const { users } = await import('../src/db/schema');
    const { eq } = await import('drizzle-orm');
    const [u] = await db.select().from(users).where(eq(users.id, id));
    if (!u) throw new (await import('../src/plugins/errors')).ApiError('NOT_REGISTERED');
    request.user = { id: u.id, role: u.role };
  },
}));

const U = {
  battalionCmd: '00000000-0000-0000-0000-000000000001',
  companyCmd: '00000000-0000-0000-0000-000000000002',
  team1Cmd: '00000000-0000-0000-0000-000000000003',
  team2Cmd: '00000000-0000-0000-0000-000000000004',
  team1Soldier: '00000000-0000-0000-0000-000000000011',
  team1Soldier2: '00000000-0000-0000-0000-000000000012',
  team2Soldier: '00000000-0000-0000-0000-000000000021',
  hrBattalion: '00000000-0000-0000-0000-000000000098',
  hrTeam2: '00000000-0000-0000-0000-000000000099',
};
const G = {
  battalion: '00000000-0000-0000-0000-00000000a001',
  company: '00000000-0000-0000-0000-00000000a002',
  team1: '00000000-0000-0000-0000-00000000a003',
  team2: '00000000-0000-0000-0000-00000000a004',
};

const forbidden = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: 'FORBIDDEN' });

describe.skipIf(!process.env.DATABASE_URL)('C1 assertCanActOn', () => {
  let a: typeof import('../src/modules/commander/access');
  beforeAll(async () => {
    a = await import('../src/modules/commander/access');
  });

  test('a commander reaches their whole subtree, at any depth', async () => {
    await expect(a.canActOnSoldier(U.battalionCmd, U.team1Soldier)).resolves.toBe(true);
    await expect(a.canActOnSoldier(U.battalionCmd, U.team2Cmd)).resolves.toBe(true);
    await expect(a.canActOnSoldier(U.team1Cmd, U.team1Soldier)).resolves.toBe(true);
  });

  test('a commander from another branch is forbidden', async () => {
    await forbidden(a.assertCanActOn(U.team1Cmd, { soldierId: U.team2Soldier }));
    await forbidden(a.assertCanActOn(U.team2Cmd, { soldierId: U.team1Soldier }));
  });

  test('a commander cannot act upwards or on themselves', async () => {
    await forbidden(a.assertCanActOn(U.team1Cmd, { soldierId: U.companyCmd }));
    await forbidden(a.assertCanActOn(U.team1Cmd, { soldierId: U.battalionCmd }));
    await forbidden(a.assertCanActOn(U.team1Cmd, { soldierId: U.team1Cmd }));
  });

  test('a plain soldier can act on nobody', async () => {
    await forbidden(a.assertCanActOn(U.team1Soldier, { soldierId: U.team1Soldier2 }));
    await forbidden(a.assertCanActOn(U.team1Soldier, { groupId: G.team1 }));
  });

  test('HR reaches its assigned units, including the commanders in them', async () => {
    await expect(a.canActOnSoldier(U.hrBattalion, U.battalionCmd)).resolves.toBe(true);
    await expect(a.canActOnSoldier(U.hrBattalion, U.team2Soldier)).resolves.toBe(true);
    await expect(a.canActOnSoldier(U.hrTeam2, U.team2Cmd)).resolves.toBe(true);
  });

  test('HR from another unit is forbidden', async () => {
    await forbidden(a.assertCanActOn(U.hrTeam2, { soldierId: U.team1Soldier }));
    await forbidden(a.assertCanActOn(U.hrTeam2, { groupId: G.team1 }));
  });

  test('group scope follows the same subtree', async () => {
    await expect(a.canActOnGroup(U.battalionCmd, G.team2)).resolves.toBe(true);
    await expect(a.canActOnGroup(U.team1Cmd, G.team1)).resolves.toBe(true);
    await expect(a.canActOnGroup(U.team1Cmd, G.team2)).resolves.toBe(false);
    await expect(a.canActOnGroup(U.team1Cmd, G.battalion)).resolves.toBe(false);
    await expect(a.canActOnGroup(U.hrTeam2, G.team2)).resolves.toBe(true);
  });

  test('bulk is all-or-nothing: one id out of scope rejects the whole call', async () => {
    const inScope = [U.team1Soldier, U.team1Soldier2];
    await expect(a.assertCanActOn(U.team1Cmd, { soldierIds: inScope })).resolves.toBeUndefined();
    await forbidden(a.assertCanActOn(U.team1Cmd, { soldierIds: [...inScope, U.team2Soldier] }));
    await forbidden(a.assertCanActOn(U.team1Cmd, { soldierIds: [] }));
    // An id that doesn't exist at all is out of scope too.
    await forbidden(
      a.assertCanActOn(U.team1Cmd, { soldierIds: ['00000000-0000-0000-0000-0000000000ff'] }),
    );
  });

  test('HR-only powers require role=admin', () => {
    expect(() => a.assertHr({ id: U.hrBattalion, role: 'admin' })).not.toThrow();
    expect(() => a.assertHr({ id: U.battalionCmd, role: 'soldier' })).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
});

describe.skipIf(!process.env.DATABASE_URL)('C1 GET /commander/groups', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await (await import('../src/server')).buildServer();
  });
  afterAll(() => app.close());

  const get = (userId?: string) =>
    app.inject({
      url: '/api/v1/commander/groups',
      headers: userId ? { 'x-test-user': userId } : {},
    });

  test('requires authentication', async () => {
    const res = await get();
    expect(res.statusCode).toBe(401);
  });

  test('a commander gets their subtree as a tree, matching the contract', async () => {
    const res = await get(U.battalionCmd);
    expect(res.statusCode).toBe(200);
    const body = commanderGroupsResponseSchema.parse(res.json());
    const battalion = body.groups[0];
    expect(body.groups).toHaveLength(1);
    expect(battalion).toMatchObject({ id: G.battalion, code: '100' });
    const company = battalion?.children[0];
    expect(battalion?.children.map((c) => c.id)).toEqual([G.company]);
    expect(company?.children.map((c) => c.id).sort()).toEqual([G.team1, G.team2].sort());
  });

  test("a mid-level commander's tree is rooted at their own group", async () => {
    const body = commanderGroupsResponseSchema.parse((await get(U.team1Cmd)).json());
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0]).toMatchObject({ id: G.team1, children: [] });
  });

  test('HR gets the assigned units, not the command chain', async () => {
    const body = commanderGroupsResponseSchema.parse((await get(U.hrTeam2)).json());
    expect(body.groups.map((g) => g.id)).toEqual([G.team2]);
  });

  test('a non-commander gets an empty tree', async () => {
    const body = commanderGroupsResponseSchema.parse((await get(U.team1Soldier)).json());
    expect(body.groups).toEqual([]);
  });
});
