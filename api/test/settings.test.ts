import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { settingsSchema, weekTemplateSchema } from '@doch1/shared';
import { buildServer } from '../src/server';
import settingsRoutes from '../src/modules/settings/routes';
import { registerErrorHandling } from '../src/plugins/errors';

describe('B5 /settings — auth', () => {
  test.each([
    ['GET', '/api/v1/settings/template'],
    ['PUT', '/api/v1/settings/template'],
  ] as const)('%s %s requires a logged-in user (401)', async (method, url) => {
    const app = await buildServer({ modules: [settingsRoutes] });
    const res = await app.inject({
      method,
      url,
      payload: method === 'PUT' ? { days: [null, null, null, null, null, null, null] } : undefined,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  test.each(['GET', 'PUT'] as const)('%s requires a logged-in user (401)', async (method) => {
    const app = await buildServer({ modules: [settingsRoutes] });
    const res = await app.inject({
      method,
      url: '/api/v1/settings',
      payload: method === 'PUT' ? { nudgeEnabled: true } : undefined,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
    await app.close();
  });
});

// Needs the seeded DB (db/init.sql). A dedicated user so seeded settings stay intact.
describe.skipIf(!process.env.DATABASE_URL)('B5 /settings', () => {
  const ME = 'b5000000-0000-0000-0000-000000000001';
  const OTHER = '00000000-0000-0000-0000-000000000011';
  let app: FastifyInstance;
  let sql: typeof import('../src/db/client').sqlClient;

  beforeAll(async () => {
    ({ sqlClient: sql } = await import('../src/db/client'));
    await sql`delete from users where id = ${ME}`;
    await sql`insert into users (id, personal_number, first_name, last_name, email)
      values (${ME}, '9999905', 'בדיקה', 'הגדרות', 'b5.soldier@example.com')`;
    app = Fastify();
    registerErrorHandling(app);
    app.addHook('onRequest', async (req) => {
      req.user = { id: ME, role: 'soldier' };
    });
    await app.register(settingsRoutes);
  });
  afterAll(async () => {
    await sql`delete from users where id = ${ME}`; // settings cascade
    await app.close();
  });
  beforeEach(async () => {
    await sql`delete from user_settings where user_id = ${ME}`;
  });

  const get = () => app.inject({ url: '/settings' });
  const put = (payload: unknown) =>
    app.inject({ method: 'PUT', url: '/settings', payload: payload as object });

  test('no row yet → SPEC F6 defaults (08:00, 30 min), nothing written', async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(settingsSchema.parse(res.json())).toEqual({
      reminderEnabled: false,
      reminderTime: '08:00',
      nudgeEnabled: false,
      nudgeIntervalMin: 30,
      notifyCommanderChange: true,
      notifyHrChange: true,
      weeklyReminderEnabled: false,
      weeklyReminderDay: 6,
      weeklyReminderTime: '20:00',
      templateOnboarded: false,
    });
    expect(await sql`select 1 from user_settings where user_id = ${ME}`).toHaveLength(0);
  });

  test('partial PUT creates the row, then changes only the fields sent', async () => {
    const first = await put({ reminderEnabled: true, reminderTime: '07:45' });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      reminderEnabled: true,
      reminderTime: '07:45',
      nudgeIntervalMin: 30,
    });

    const second = await put({ nudgeEnabled: true, nudgeIntervalMin: 15, notifyHrChange: false });
    expect(settingsSchema.parse(second.json())).toEqual({
      reminderEnabled: true,
      reminderTime: '07:45',
      nudgeEnabled: true,
      nudgeIntervalMin: 15,
      notifyCommanderChange: true,
      notifyHrChange: false,
      weeklyReminderEnabled: false,
      weeklyReminderDay: 6,
      weeklyReminderTime: '20:00',
      templateOnboarded: false,
    });
    expect((await get()).json()).toEqual(second.json());
  });

  test('weekly reminder + onboarding fields round-trip', async () => {
    const res = await put({
      weeklyReminderEnabled: true,
      weeklyReminderDay: 0,
      weeklyReminderTime: '19:30',
      templateOnboarded: true,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      weeklyReminderEnabled: true,
      weeklyReminderDay: 0,
      weeklyReminderTime: '19:30',
      templateOnboarded: true,
    });
  });

  test('only my row changes', async () => {
    const [before] = await sql`select * from user_settings where user_id = ${OTHER}`;
    await put({ notifyCommanderChange: false });
    const [after] = await sql`select * from user_settings where user_id = ${OTHER}`;
    expect(after).toEqual(before);
  });

  test.each([
    ['empty body', {}],
    ['interval not 15/30/60', { nudgeIntervalMin: 20 }],
    ['bad time', { reminderTime: '8:00' }],
    ['time out of range', { reminderTime: '24:00' }],
    ['wrong type', { nudgeEnabled: 'yes' }],
    ['weekly day out of range', { weeklyReminderDay: 7 }],
    ['weekly bad time', { weeklyReminderTime: '25:00' }],
    ['unknown field (mass assignment)', { userId: OTHER, nudgeEnabled: true }],
    ['not an object', [true]],
  ])('%s → 400', async (_name, payload) => {
    const res = await put(payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe.skipIf(!process.env.DATABASE_URL)('/settings/template', () => {
  const ME = 'b5000000-0000-0000-0000-000000000002';
  let app: FastifyInstance;
  let sql: typeof import('../src/db/client').sqlClient;
  let ids: Record<string, number>;

  beforeAll(async () => {
    ({ sqlClient: sql } = await import('../src/db/client'));
    await sql`delete from users where id = ${ME}`;
    await sql`insert into users (id, personal_number, first_name, last_name, email)
      values (${ME}, '9999916', 'בדיקה', 'תבנית', 'b5.template@example.com')`;
    const rows = await sql<{ id: number; code: string }[]>`select id, code from status_reasons`;
    ids = Object.fromEntries(rows.map((r) => [r.code, r.id]));
    app = Fastify();
    registerErrorHandling(app);
    app.addHook('onRequest', async (req) => {
      req.user = { id: ME, role: 'soldier' };
    });
    await app.register(settingsRoutes);
  });
  afterAll(async () => {
    await sql`delete from users where id = ${ME}`;
    await app.close();
  });
  beforeEach(async () => {
    await sql`delete from user_week_template where user_id = ${ME}`;
  });

  const put = (payload: unknown) =>
    app.inject({ method: 'PUT', url: '/settings/template', payload: payload as object });

  test('no row → default week (Sun–Wed present, Thu annual leave, Fri present, Sat none)', async () => {
    const res = await app.inject({ url: '/settings/template' });
    expect(res.statusCode).toBe(200);
    const p = { reasonId: ids.present };
    expect(weekTemplateSchema.parse(res.json())).toEqual({
      days: [p, p, p, p, { reasonId: ids.annual_leave }, p, null],
    });
  });

  test('PUT replaces fully and GET returns it', async () => {
    const days = [null, { reasonId: ids.errands_day }, null, null, null, null, null];
    const res = await put({ days });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ days });
    expect((await app.inject({ url: '/settings/template' })).json()).toEqual({ days });
  });

  test('commander-only reason → 422 REASON_NOT_ALLOWED', async () => {
    const res = await put({ days: [{ reasonId: ids.course }, null, null, null, null, null, null] });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('REASON_NOT_ALLOWED');
  });

  test.each([
    ['unknown reason', { days: [{ reasonId: 9999 }, null, null, null, null, null, null] }],
    ['6 days', { days: [null, null, null, null, null, null] }],
    ['extra field', { days: [{ reasonId: 1, note: 'x' }, null, null, null, null, null, null] }],
    ['missing days', {}],
  ])('%s → 400', async (_n, payload) => {
    const res = await put(payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
