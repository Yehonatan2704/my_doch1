import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import { buildServer } from '../src/server';
import authRoutes from '../src/modules/auth/routes';
import statusesRoutes from '../src/modules/statuses/routes';
import reportsRoutes from '../src/modules/reports/routes';
import documentsRoutes from '../src/modules/documents/routes';
import settingsRoutes from '../src/modules/settings/routes';
import { jerusalemDate } from '../src/modules/reports/time';

// B6: one 401 and one 403 case for every Lane B route, through the real server and the real
// auth hook (B1) with signed tokens — nothing is mocked except Supabase Storage's HTTP API.
// The rule tests (time table, document required, note not allowed) live in reports.test.ts.

const SUPABASE_URL = 'https://test-project.supabase.co';
const SECRET = 'b6-test-secret-b6-test-secret-b6-test!!';
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_JWT_SECRET = SECRET;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
vi.stubGlobal(
  'fetch',
  vi.fn(async () => new Response('{}', { status: 200 })),
);

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(email: string, over: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const input = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub: 'b6',
    email,
    aud: 'authenticated',
    iss: `${SUPABASE_URL}/auth/v1`,
    exp: now + 600,
    app_metadata: { provider: 'google' },
    ...over,
  })}`;
  return `${input}.${createHmac('sha256', SECRET).update(input).digest('base64url')}`;
}

const ACTIVE = { id: 'b6000000-0000-0000-0000-000000000001', email: 'b6.soldier@example.com' };
const INACTIVE = { id: 'b6000000-0000-0000-0000-000000000002', email: 'b6.inactive@example.com' };
const OTHERS_DOC = '00000000-0000-0000-0000-0000000d0001'; // seeded, owned by soldier 13

const TOMORROW = (() => {
  const d = new Date(`${jerusalemDate(new Date())}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
})();
const today = () => jerusalemDate(new Date());

const PDF_UPLOAD = {
  payload: Buffer.from(
    '------b6\r\nContent-Disposition: form-data; name="file"; filename="n.pdf"\r\n' +
      'Content-Type: application/pdf\r\n\r\n%PDF-1.4\n%%EOF\r\n------b6--\r\n',
  ),
  headers: { 'content-type': 'multipart/form-data; boundary=----b6' },
};

type Row = {
  route: string; // "METHOD /pattern", as registered
  method: 'GET' | 'PUT' | 'POST' | 'DELETE';
  url: () => string;
  body?: () => { payload: unknown; headers?: Record<string, string> };
};

const json = (payload: unknown) => () => ({ payload });

/** Every Lane B route. The first test fails if a route is added without a row here. */
const ROUTES: Row[] = [
  { route: 'GET /me', method: 'GET', url: () => '/me' },
  { route: 'GET /statuses', method: 'GET', url: () => '/statuses' },
  { route: 'GET /reports/today', method: 'GET', url: () => '/reports/today' },
  { route: 'GET /reports', method: 'GET', url: () => `/reports?from=${today()}&to=${TOMORROW}` },
  {
    route: 'PUT /reports/:date',
    method: 'PUT',
    url: () => `/reports/${TOMORROW}`,
    body: json({ reasonId: 1 }),
  },
  { route: 'DELETE /reports/:date', method: 'DELETE', url: () => `/reports/${TOMORROW}` },
  { route: 'POST /documents', method: 'POST', url: () => '/documents', body: () => PDF_UPLOAD },
  { route: 'GET /settings', method: 'GET', url: () => '/settings' },
  {
    route: 'PUT /settings',
    method: 'PUT',
    url: () => '/settings',
    body: json({ nudgeEnabled: true }),
  },
  { route: 'GET /settings/template', method: 'GET', url: () => '/settings/template' },
  {
    route: 'PUT /settings/template',
    method: 'PUT',
    url: () => '/settings/template',
    body: json({ days: [null, null, null, null, null, null, null] }),
  },
];

const LANE_B_MODULES: FastifyPluginAsync[] = [
  authRoutes,
  statusesRoutes,
  reportsRoutes,
  documentsRoutes,
  settingsRoutes,
];

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildServer(); // every module, discovered like in production
});
afterAll(() => app.close());

function call(row: Row, bearer?: string) {
  const body = row.body?.();
  return app.inject({
    method: row.method,
    url: `/api/v1${row.url()}`,
    payload: body?.payload as string,
    headers: { ...body?.headers, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
  });
}

describe('B6 the matrix covers every Lane B route', () => {
  test('registered routes == matrix rows', async () => {
    const registered: string[] = [];
    for (const m of LANE_B_MODULES) {
      const f = Fastify();
      f.addHook('onRoute', (r) => {
        for (const method of [r.method].flat())
          if (method !== 'HEAD') registered.push(`${method} ${r.url}`);
      });
      await f.register(m);
      await f.ready();
      await f.close();
    }
    expect(registered.sort()).toEqual(ROUTES.map((r) => r.route).sort());
  });
});

describe('B6 401 on every Lane B route', () => {
  describe.each(ROUTES)('$route', (row) => {
    test.each([
      ['no token', undefined],
      ['expired token', token(ACTIVE.email, { exp: Math.floor(Date.now() / 1000) - 60 })],
      [
        'token from another project',
        token(ACTIVE.email, { iss: 'https://evil.supabase.co/auth/v1' }),
      ],
    ])('%s → 401', async (_name, bearer) => {
      const res = await call(row, bearer);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });
  });
});

describe.skipIf(!process.env.DATABASE_URL)('B6 403 on every Lane B route', () => {
  let sql: typeof import('../src/db/client').sqlClient;
  beforeAll(async () => {
    ({ sqlClient: sql } = await import('../src/db/client'));
    await cleanup();
    await sql`insert into users (id, personal_number, first_name, last_name, email, is_active) values
      (${ACTIVE.id}, '9999906', 'בדיקה', 'פעיל', ${ACTIVE.email}, true),
      (${INACTIVE.id}, '9999907', 'בדיקה', 'לא-פעיל', ${INACTIVE.email}, false)`;
  });
  afterAll(cleanup);
  async function cleanup() {
    const ids = [ACTIVE.id, INACTIVE.id];
    await sql`delete from report_audit where user_id in ${sql(ids)} or actor_id in ${sql(ids)}`;
    await sql`delete from users where id in ${sql(ids)}`; // reports, documents, settings cascade
  }

  describe.each(ROUTES)('$route', (row) => {
    test('unregistered Google account → 403 NOT_REGISTERED', async () => {
      const res = await call(row, token('stranger@example.com'));
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('NOT_REGISTERED');
    });

    test('inactive user → 403 INACTIVE_USER', async () => {
      const res = await call(row, token(INACTIVE.email));
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('INACTIVE_USER');
    });

    test('control: an active user is neither 401 nor 403', async () => {
      const res = await call(row, token(ACTIVE.email));
      expect([401, 403]).not.toContain(res.statusCode);
    });
  });

  test("PUT /reports/:date with another soldier's document → 403 FORBIDDEN", async () => {
    const [gimelim] = await sql<{ id: number }[]>`
      select id from status_reasons where code = 'sick_gimelim'`;
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/reports/${TOMORROW}`,
      headers: { authorization: `Bearer ${token(ACTIVE.email)}` },
      payload: { reasonId: gimelim!.id, documentId: OTHERS_DOC },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });
});
