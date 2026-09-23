import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { reportDateParamsSchema } from '@doch1/shared';
import { buildServer } from '../src/server';
import { ApiError, validate } from '../src/plugins/errors';

const testModule: FastifyPluginAsync = async (api) => {
  api.get('/protected', async () => ({ secret: true }));
  api.get('/boom', { config: { public: true } }, async () => {
    throw new Error('relation "users" does not exist at /srv/db.ts:42');
  });
  api.get('/forbidden', { config: { public: true } }, async () => {
    throw new ApiError('DAY_FINALIZED');
  });
  api.put('/validate/:date', { config: { public: true } }, async (req) =>
    validate(reportDateParamsSchema, req.params),
  );
};

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildServer({ modules: [testModule] });
});
afterAll(() => app.close());

describe('A1 server skeleton', () => {
  test('health is public', async () => {
    const res = await app.inject({ url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  test('every other route is denied by default (401, contract shape)', async () => {
    const res = await app.inject({ url: '/api/v1/protected' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: expect.any(String) } });
  });

  test('unknown route → 404 contract shape', async () => {
    const res = await app.inject({ url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  test('internal errors never leak details', async () => {
    const res = await app.inject({ url: '/api/v1/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('INTERNAL');
    expect(res.body).not.toMatch(/relation|users|srv|db\.ts/);
  });

  test('ApiError maps to its code and status', async () => {
    const res = await app.inject({ url: '/api/v1/forbidden' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('DAY_FINALIZED');
  });

  test('validate() → 400 VALIDATION_ERROR on bad input', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/v1/validate/2026-02-30' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  test('helmet headers present', async () => {
    const res = await app.inject({ url: '/api/v1/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  test('CORS: allowlisted origin only', async () => {
    const ok = await app.inject({ url: '/api/v1/health', headers: { origin: 'http://localhost:8081' } });
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    const evil = await app.inject({ url: '/api/v1/health', headers: { origin: 'https://evil.example' } });
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('body over 100KB → 413', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/validate/2026-09-22',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ x: 'a'.repeat(110 * 1024) }),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  test('rate limit: 101st request in a minute → 429 RATE_LIMITED', async () => {
    const fresh = await buildServer({ modules: [] });
    let last;
    for (let i = 0; i < 101; i++) last = await fresh.inject({ url: '/api/v1/health' });
    expect(last!.statusCode).toBe(429);
    expect(last!.json().error.code).toBe('RATE_LIMITED');
    await fresh.close();
  });
});

// Runs only when a database is reachable (e.g. DATABASE_URL pointing at a local Postgres with
// db/init.sql applied). Skipped in plain `pnpm test`.
describe.skipIf(!process.env.DATABASE_URL)('A1 database connection', () => {
  test('drizzle reads the seeded statuses', async () => {
    const { db } = await import('../src/db/client');
    const rows = await db.query.statusCategories.findMany();
    expect(rows.map((r) => r.code)).toEqual(
      expect.arrayContaining(['on_base', 'outside_unit', 'annual_leave', 'abroad', 'sick_leave']),
    );
  });
});
