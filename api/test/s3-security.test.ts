// S3 security pass — regression tests for findings. Sandbox rows only; removed afterwards.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

const SUPABASE_URL = 'https://s3-test.supabase.co';
const SECRET = 's3-security-test-secret-32-chars-min!!';
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_JWT_SECRET = SECRET;

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function tokenFor(email: string) {
  const now = Math.floor(Date.now() / 1000);
  const input = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub: '00000000-0000-4000-8000-000000000000',
    email,
    aud: 'authenticated',
    iss: `${SUPABASE_URL}/auth/v1`,
    iat: now,
    exp: now + 600,
    app_metadata: { provider: 'google', providers: ['google'] },
  })}`;
  return `${input}.${createHmac('sha256', SECRET).update(input).digest('base64url')}`;
}

const X = {
  commanded: '53535353-0000-0000-0000-000000005a00', // group the admin commands, NOT HR-assigned
  assigned: '53535353-0000-0000-0000-000000005b00', // group the admin is HR for
  admin: '53535353-0000-0000-0000-000000000501',
  soldierA: '53535353-0000-0000-0000-000000000502', // in `commanded`
  soldierB: '53535353-0000-0000-0000-000000000503', // in `assigned`
  adminEmail: 's3.admin@example.com',
};
const USERS = [X.admin, X.soldierA, X.soldierB];

describe.skipIf(!process.env.DATABASE_URL)('S3: HR powers need HR scope, not just the admin role', () => {
  let app: FastifyInstance;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sql: any;
  let yesterday: string;

  const call = (method: string, url: string, body?: unknown) =>
    app
      .inject({
        method: method as 'GET',
        url: `/api/v1${url}`,
        headers: { authorization: `Bearer ${tokenFor(X.adminEmail)}` },
        ...(body === undefined ? {} : { payload: body as object }),
      })
      .then((r) => ({ status: r.statusCode, json: r.body ? r.json() : null }));

  async function cleanup() {
    await sql`delete from report_audit where user_id = any(${USERS}) or actor_id = any(${USERS})`;
    await sql`delete from reports where user_id = any(${USERS})`;
    await sql`delete from groups where id in (${X.commanded}, ${X.assigned})`;
    await sql`delete from users where id = any(${USERS})`;
  }

  beforeAll(async () => {
    const { buildServer } = await import('../src/server');
    ({ sqlClient: sql } = await import('../src/db/client'));
    app = await buildServer();
    await cleanup();
    await sql`insert into users (id, personal_number, first_name, last_name, email, role) values
      (${X.admin}, '953500001', 'מנהל', 'בדיקה', ${X.adminEmail}, 'admin'),
      (${X.soldierA}, '953500002', 'חייל', 'א', 's3.a@example.com', 'soldier'),
      (${X.soldierB}, '953500003', 'חייל', 'ב', 's3.b@example.com', 'soldier')`;
    await sql`insert into groups (id, name, code, parent_id, commander_id) values
      (${X.commanded}, 'S3 מפוקדת', 'S3-CMD', null, ${X.admin}),
      (${X.assigned}, 'S3 משא"ן', 'S3-HR', null, null)`;
    await sql`update users set group_id = ${X.commanded} where id = ${X.soldierA}`;
    await sql`update users set group_id = ${X.assigned} where id = ${X.soldierB}`;
    await sql`insert into hr_assignments (hr_user_id, group_id) values (${X.admin}, ${X.assigned})`;
    [{ yesterday }] = await sql`select (app_today() - 1)::text as yesterday`;
    await sql`insert into reports (user_id, report_date, reason_id, reported_by, last_modified_by)
      values (${X.soldierA}, ${yesterday}, 1, ${X.soldierA}, ${X.soldierA}),
             (${X.soldierB}, ${yesterday}, 1, ${X.soldierB}, ${X.soldierB})`;
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  const reportId = async (userId: string) =>
    (await sql`select id from reports where user_id = ${userId}`)[0].id as string;

  test('past-day edit: refused for a soldier the admin only commands', async () => {
    const r = await call('PUT', `/commander/soldiers/${X.soldierA}/reports/${yesterday}`, { reasonId: 1 });
    expect(r.json.error.code).toBe('DAY_LOCKED');
  });

  test('past-day edit: allowed inside the HR-assigned unit', async () => {
    const r = await call('PUT', `/commander/soldiers/${X.soldierB}/reports/${yesterday}`, { reasonId: 1 });
    expect(r.status).toBe(200);
  });

  test('finalize: 403 for a commanded-only soldier, whole bulk rejected', async () => {
    const [a, b] = [await reportId(X.soldierA), await reportId(X.soldierB)];
    expect((await call('POST', '/hr/reports/finalize', { reportIds: [a] })).status).toBe(403);
    expect((await call('POST', '/hr/reports/finalize', { reportIds: [a, b] })).status).toBe(403);
    const [row] = await sql`select finalized_at from reports where id = ${b}`;
    expect(row.finalized_at).toBeNull();
  });

  test('finalize / unfinalize: allowed inside the HR-assigned unit', async () => {
    const b = await reportId(X.soldierB);
    expect((await call('POST', '/hr/reports/finalize', { reportIds: [b] })).status).toBe(200);
    expect((await call('DELETE', `/hr/reports/${b}/finalize`)).status).toBe(204);
  });
});
