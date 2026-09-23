// A5 sync point: the real API must answer every SPEC §6 route with the shapes in @doch1/shared,
// and with the same seeded numbers the mock (apps/mobile/lib/mock) shows — so switching
// EXPO_PUBLIC_USE_MOCK to 0 changes nothing on screen. Seeded data is only read; every write goes
// to a private sandbox unit (a5 users/group below) that is removed afterwards.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  activeEmergenciesResponseSchema,
  approveReportsResponseSchema,
  commanderGroupsResponseSchema,
  emergencyDetailResponseSchema,
  errorResponseSchema,
  finalizeReportsResponseSchema,
  groupReportsResponseSchema,
  meResponseSchema,
  putReportResponseSchema,
  reportsResponseSchema,
  settingsSchema,
  startEmergencyResponseSchema,
  statusesResponseSchema,
  todayReportResponseSchema,
  type StatusesResponse,
} from '@doch1/shared';

const SUPABASE_URL = 'https://contract-test.supabase.co';
const SECRET = 'contract-test-secret-at-least-32-chars!!';
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

// seeded (db/init.sql) — read only
const SEED = {
  team1Cmd: 'cmd.team1@example.com',
  companyCmd: 'cmd.company@example.com',
  soldier11: 'soldier01@example.com',
  hrTeam2: 'hr.team2@example.com',
  team1: '00000000-0000-0000-0000-00000000a003',
  team2: '00000000-0000-0000-0000-00000000a004',
  drill: '00000000-0000-0000-0000-0000000e0001',
};

// sandbox — written to, then deleted
const X = {
  group: 'a5a5a5a5-0000-0000-0000-00000000a5a0',
  cmd: 'a5a5a5a5-0000-0000-0000-000000000a51',
  soldier: 'a5a5a5a5-0000-0000-0000-000000000a52',
  hr: 'a5a5a5a5-0000-0000-0000-000000000a53',
  cmdEmail: 'a5.cmd@example.com',
  soldierEmail: 'a5.soldier@example.com',
  hrEmail: 'a5.hr@example.com',
};
const SANDBOX_USERS = [X.cmd, X.soldier, X.hr];

describe.skipIf(!process.env.DATABASE_URL)('A5 contract: real API ≡ shared contract ≡ mock', () => {
  let app: FastifyInstance;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sql: any;
  let today: string;
  let plus2: string;

  async function call(email: string, method: string, url: string, body?: unknown) {
    const res = await app.inject({
      method: method as 'GET',
      url: `/api/v1${url}`,
      headers: { authorization: `Bearer ${tokenFor(email)}` },
      ...(body === undefined ? {} : { payload: body as object }),
    });
    return { status: res.statusCode, json: res.body ? res.json() : null };
  }

  async function cleanup() {
    await sql`delete from report_audit where user_id = any(${SANDBOX_USERS}) or actor_id = any(${SANDBOX_USERS})`;
    await sql`delete from reports where user_id = any(${SANDBOX_USERS})`;
    await sql`delete from emergency_events where group_id = ${X.group} or started_by = any(${SANDBOX_USERS})`;
    await sql`delete from groups where id = ${X.group}`;
    await sql`delete from users where id = any(${SANDBOX_USERS})`;
  }

  beforeAll(async () => {
    const { buildServer } = await import('../src/server');
    ({ sqlClient: sql } = await import('../src/db/client'));
    app = await buildServer();
    await cleanup();
    await sql`insert into users (id, personal_number, first_name, last_name, email, role) values
      (${X.cmd}, '955500001', 'מפקד', 'בדיקה', ${X.cmdEmail}, 'soldier'),
      (${X.soldier}, '955500002', 'חייל', 'בדיקה', ${X.soldierEmail}, 'soldier'),
      (${X.hr}, '955500003', 'משאן', 'בדיקה', ${X.hrEmail}, 'admin')`;
    await sql`insert into groups (id, name, code, parent_id, commander_id)
      values (${X.group}, 'צוות בדיקה', 'A5-SANDBOX', null, ${X.cmd})`;
    await sql`update users set group_id = ${X.group} where id in (${X.cmd}, ${X.soldier})`;
    await sql`insert into hr_assignments (hr_user_id, group_id) values (${X.hr}, ${X.group})`;
    await sql`insert into user_settings (user_id) values (${X.cmd}), (${X.soldier}), (${X.hr})`;
    [{ today, plus2 }] = await sql`select app_today()::text as today, (app_today() + 2)::text as plus2`;
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  describe('seeded reads match the mock', () => {
    test('/me', async () => {
      const r = await call(SEED.team1Cmd, 'GET', '/me');
      expect(meResponseSchema.parse(r.json)).toMatchObject({
        user: { firstName: 'עידו', role: 'soldier' },
        isCommander: true,
        group: { id: SEED.team1 },
      });
    });

    test('/statuses: 5 categories; soldiers never get commander-only reasons', async () => {
      const soldier = statusesResponseSchema.parse((await call(SEED.soldier11, 'GET', '/statuses')).json);
      expect(soldier.categories.map((c) => c.code)).toEqual([
        'on_base',
        'outside_unit',
        'annual_leave',
        'abroad',
        'sick_leave',
      ]);
      expect(soldier.categories.flatMap((c) => c.reasons).some((r) => r.commanderOnly)).toBe(false);
    });

    test('/reports/today', async () => {
      const r = todayReportResponseSchema.parse((await call(SEED.team1Cmd, 'GET', '/reports/today')).json);
      expect(r.date).toBe(today);
      expect(r.report?.reason.code).toBe('present');
    });

    test('/reports history: the two commander-edited days', async () => {
      const from = (await sql`select (app_today() - 10)::text as d`)[0].d;
      const r = reportsResponseSchema.parse(
        (await call(SEED.soldier11, 'GET', `/reports?from=${from}&to=${today}`)).json,
      );
      const edited = r.reports.filter((x) => x.source === 'commander');
      expect(edited.map((x) => x.reason.code)).toEqual(['course', 'course']);
    });

    test('/settings, /emergencies/active', async () => {
      settingsSchema.parse((await call(SEED.soldier11, 'GET', '/settings')).json);
      activeEmergenciesResponseSchema.parse((await call(SEED.soldier11, 'GET', '/emergencies/active')).json);
    });

    test('/commander/groups: commander vs HR roots', async () => {
      const cmd = commanderGroupsResponseSchema.parse((await call(SEED.team1Cmd, 'GET', '/commander/groups')).json);
      expect(cmd.groups.map((g) => g.id)).toEqual([SEED.team1]);
      const hr = commanderGroupsResponseSchema.parse((await call(SEED.hrTeam2, 'GET', '/commander/groups')).json);
      expect(hr.groups.map((g) => g.id)).toEqual([SEED.team2]);
    });

    test('/commander/groups/:id/reports: team-1 today has the same counts as the mock', async () => {
      const r = groupReportsResponseSchema.parse(
        (await call(SEED.team1Cmd, 'GET', `/commander/groups/${SEED.team1}/reports`)).json,
      );
      expect(r.counts).toEqual({ total: 8, present: 3, away: 2, notReported: 3, pendingApproval: 3 });
      const pinned = r.rows.slice(0, 2).map((x) => x.soldier.firstName).sort();
      expect(pinned).toEqual(['עומר', 'תמר'].sort()); // starred 13 + 16 pinned first
      const pending = groupReportsResponseSchema.parse(
        (await call(SEED.team1Cmd, 'GET', `/commander/groups/${SEED.team1}/reports?pending=true`)).json,
      );
      expect(pending.rows).toHaveLength(3);
    });

    test('/commander/emergencies/:id: seeded drill counts match the mock', async () => {
      const d = emergencyDetailResponseSchema.parse(
        (await call(SEED.companyCmd, 'GET', `/commander/emergencies/${SEED.drill}`)).json,
      );
      expect(d.counts).toEqual({ ok: 12, needHelp: 1, noResponse: 2 });
    });

    test('errors use the contract shape', async () => {
      const r = await call(SEED.team1Cmd, 'GET', `/commander/groups/${SEED.team2}/reports`);
      expect(r.status).toBe(403);
      expect(errorResponseSchema.parse(r.json).error.code).toBe('FORBIDDEN');
    });
  });

  describe('writes (sandbox unit) return contract shapes', () => {
    test('soldier: put / delete own report', async () => {
      const s = (await call(X.soldierEmail, 'GET', '/statuses')).json as StatusesResponse;
      const present = s.categories.flatMap((c) => c.reasons).find((r) => r.code === 'present')!.id;
      const put = await call(X.soldierEmail, 'PUT', `/reports/${plus2}`, { reasonId: present });
      expect(put.status).toBe(200);
      expect(putReportResponseSchema.parse(put.json).date).toBe(plus2);
      const today1 = await call(X.soldierEmail, 'PUT', `/reports/${today}`, { reasonId: present });
      expect(putReportResponseSchema.parse(today1.json).source).toBe('self');
      expect((await call(X.soldierEmail, 'DELETE', `/reports/${plus2}`)).status).toBe(204);
    });

    test('soldier: settings + push token', async () => {
      const r = await call(X.soldierEmail, 'PUT', '/settings', { nudgeEnabled: true });
      expect(settingsSchema.parse(r.json).nudgeEnabled).toBe(true);
      const t = await call(X.soldierEmail, 'POST', '/push-tokens', {
        token: 'ExponentPushToken[a5-contract]',
        platform: 'web',
      });
      expect(t.status).toBe(204);
    });

    test('commander: list, approve, edit, favorites', async () => {
      const list = groupReportsResponseSchema.parse(
        (await call(X.cmdEmail, 'GET', `/commander/groups/${X.group}/reports`)).json,
      );
      const row = list.rows.find((x) => x.soldier.id === X.soldier)!;
      expect(row.report).not.toBeNull();
      const approve = await call(X.cmdEmail, 'POST', '/commander/reports/approve', {
        reportIds: [row.report!.id],
      });
      expect(approveReportsResponseSchema.parse(approve.json).approvedCount).toBe(1);

      const s = (await call(X.cmdEmail, 'GET', '/statuses')).json as StatusesResponse;
      const course = s.categories.flatMap((c) => c.reasons).find((r) => r.code === 'course')!.id;
      const edit = await call(X.cmdEmail, 'PUT', `/commander/soldiers/${X.soldier}/reports/${today}`, {
        reasonId: course,
      });
      expect(putReportResponseSchema.parse(edit.json)).toMatchObject({
        source: 'commander',
        reason: { code: 'course' },
      });
      expect((await call(X.cmdEmail, 'PUT', `/commander/favorites/${X.soldier}`)).status).toBe(204);
      expect((await call(X.cmdEmail, 'DELETE', `/commander/favorites/${X.soldier}`)).status).toBe(204);
    });

    test('emergency: start → soldier responds → live view → end', async () => {
      const start = await call(X.cmdEmail, 'POST', '/commander/emergencies', {
        groupId: X.group,
        message: 'בדיקת חוזה',
      });
      const { id } = startEmergencyResponseSchema.parse(start.json);
      const active = activeEmergenciesResponseSchema.parse(
        (await call(X.soldierEmail, 'GET', '/emergencies/active')).json,
      );
      expect(active.events.map((e) => e.id)).toContain(id);
      expect(
        (await call(X.soldierEmail, 'POST', `/emergencies/${id}/respond`, { status: 'need_help' })).status,
      ).toBe(204);
      const detail = emergencyDetailResponseSchema.parse(
        (await call(X.cmdEmail, 'GET', `/commander/emergencies/${id}`)).json,
      );
      expect(detail.counts.needHelp).toBe(1);
      expect((await call(X.cmdEmail, 'POST', `/commander/emergencies/${id}/end`)).status).toBe(204);
    });

    test('HR: finalize → soldier locked → unfinalize', async () => {
      const today1 = todayReportResponseSchema.parse((await call(X.soldierEmail, 'GET', '/reports/today')).json);
      const reportId = today1.report!.id;
      const fin = await call(X.hrEmail, 'POST', '/hr/reports/finalize', { reportIds: [reportId] });
      expect(finalizeReportsResponseSchema.parse(fin.json).finalizedCount).toBe(1);
      const locked = await call(X.soldierEmail, 'PUT', `/reports/${today}`, { reasonId: 1 });
      expect(errorResponseSchema.parse(locked.json).error.code).toBe('DAY_FINALIZED');
      expect((await call(X.hrEmail, 'DELETE', `/hr/reports/${reportId}/finalize`)).status).toBe(204);
    });
  });
});
