import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { REASON_CODES, statusesResponseSchema, type StatusesResponse } from '@doch1/shared';
import { buildServer } from '../src/server';
import statusesRoutes from '../src/modules/statuses/routes';
import type { AuthUser } from '../src/plugins/types';

const SOLDIER: AuthUser = { id: '00000000-0000-0000-0000-000000000011', role: 'soldier' };
const TEAM_COMMANDER: AuthUser = { id: '00000000-0000-0000-0000-000000000003', role: 'soldier' };
const HR: AuthUser = { id: '00000000-0000-0000-0000-000000000098', role: 'admin' };
const ADMIN_WITHOUT_ASSIGNMENT: AuthUser = {
  id: 'b2b2b2b2-0000-0000-0000-000000000000',
  role: 'admin',
};
const COMMANDER_ONLY = ['course', 'attached_other_unit'];

describe('B2 GET /statuses — auth', () => {
  test('requires a logged-in user (401)', async () => {
    const app = await buildServer({ modules: [statusesRoutes] });
    const res = await app.inject({ url: '/api/v1/statuses' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
    await app.close();
  });
});

// Needs the seeded DB (db/init.sql). The route is mounted with the identity the auth hook would set.
describe.skipIf(!process.env.DATABASE_URL)('B2 GET /statuses', () => {
  let app: FastifyInstance;
  let as: AuthUser;
  beforeAll(async () => {
    app = Fastify();
    app.addHook('onRequest', async (req) => {
      req.user = as;
    });
    await app.register(statusesRoutes);
  });
  afterAll(() => app.close());

  async function statuses(user: AuthUser): Promise<StatusesResponse> {
    as = user;
    const res = await app.inject({ url: '/statuses' });
    expect(res.statusCode).toBe(200);
    return statusesResponseSchema.parse(res.json());
  }
  const reasonCodes = (s: StatusesResponse) =>
    s.categories.flatMap((c) => c.reasons.map((r) => r.code));

  test('soldier: 5 categories in order, commander-only reasons hidden', async () => {
    const s = await statuses(SOLDIER);
    expect(s.categories.map((c) => c.code)).toEqual([
      'on_base',
      'outside_unit',
      'annual_leave',
      'abroad',
      'sick_leave',
    ]);
    expect(reasonCodes(s)).toHaveLength(REASON_CODES.length - COMMANDER_ONLY.length);
    for (const code of COMMANDER_ONLY) expect(reasonCodes(s)).not.toContain(code);
    expect(s.categories.flatMap((c) => c.reasons).every((r) => !r.commanderOnly)).toBe(true);
  });

  test('flags per SPEC §4: document on גימלים only, note on the four allowed reasons', async () => {
    const reasons = (await statuses(SOLDIER)).categories.flatMap((c) => c.reasons);
    expect(reasons.filter((r) => r.requiresDocument).map((r) => r.code)).toEqual(['sick_gimelim']);
    expect(
      reasons
        .filter((r) => r.allowsNote)
        .map((r) => r.code)
        .sort(),
    ).toEqual(['after_duty', 'role_outside_unit', 'training_abroad', 'training_local'].sort());
    const onBase = (await statuses(SOLDIER)).categories[0]!;
    expect(onBase.reasons.map((r) => r.code)).toEqual(['present']);
  });

  test('commander sees commander-only reasons, flagged', async () => {
    const s = await statuses(TEAM_COMMANDER);
    expect(reasonCodes(s)).toHaveLength(REASON_CODES.length);
    const outside = s.categories.find((c) => c.code === 'outside_unit')!;
    expect(outside.reasons.filter((r) => r.commanderOnly).map((r) => r.code)).toEqual(
      COMMANDER_ONLY,
    );
  });

  test('HR with an assignment sees commander-only reasons', async () => {
    expect(reasonCodes(await statuses(HR))).toEqual(expect.arrayContaining(COMMANDER_ONLY));
  });

  test('role admin alone (no hr_assignments row) does not', async () => {
    const codes = reasonCodes(await statuses(ADMIN_WITHOUT_ASSIGNMENT));
    for (const code of COMMANDER_ONLY) expect(codes).not.toContain(code);
  });
});
