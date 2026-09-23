import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { setupServer } from 'msw/node';
import {
  activeEmergenciesResponseSchema,
  commanderGroupsResponseSchema,
  emergencyDetailResponseSchema,
  groupReportsResponseSchema,
  meResponseSchema,
  reportsResponseSchema,
  settingsSchema,
  statusesResponseSchema,
  todayReportResponseSchema,
  type GroupReportsResponse,
  type StatusesResponse,
} from '@doch1/shared';
import { createDb, U } from './fixtures';
import { createHandlers } from './handlers';

const NOW = new Date('2026-09-22T07:00:00Z'); // 10:00 in Israel, before the deadline
const TODAY = '2026-09-22';
const TEAM1 = '00000000-0000-0000-0000-00000000a003';
const TEAM2 = '00000000-0000-0000-0000-00000000a004';
const COMPANY = '00000000-0000-0000-0000-00000000a002';
const soldier = (n: string) => `00000000-0000-0000-0000-${n.padStart(12, '0')}`;

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

function as(userId: string) {
  const db = createDb(NOW);
  server.resetHandlers(...createHandlers(db, userId, () => NOW));
  return db;
}

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`http://localhost/api/v1${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = res.status === 204 ? null : await res.json();
  return { status: res.status, json };
}

const reasonId = (s: StatusesResponse, code: string) =>
  s.categories.flatMap((c) => c.reasons).find((r) => r.code === code)?.id;

describe('mock API — gate routes return contract-valid data', () => {
  test('/me, /statuses, /reports/today, /commander/groups, /commander/groups/:id/reports', async () => {
    as(U.team1Cmd);
    const me = await call('GET', '/me');
    expect(meResponseSchema.parse(me.json)).toMatchObject({ isCommander: true, group: { id: TEAM1 } });
    expect(statusesResponseSchema.parse((await call('GET', '/statuses')).json).categories).toHaveLength(5);
    const today = todayReportResponseSchema.parse((await call('GET', '/reports/today')).json);
    expect(today).toMatchObject({ date: TODAY, isLate: false, report: { reason: { code: 'present' } } });
    const groups = commanderGroupsResponseSchema.parse((await call('GET', '/commander/groups')).json);
    expect(groups.groups.map((g) => g.id)).toEqual([TEAM1]);
  });

  test('team-1 list matches db/init.sql seed for today', async () => {
    as(U.team1Cmd);
    const res = await call('GET', `/commander/groups/${TEAM1}/reports`);
    const list: GroupReportsResponse = groupReportsResponseSchema.parse(res.json);
    expect(list.counts).toEqual({ total: 8, present: 3, away: 2, notReported: 3, pendingApproval: 3 });
    // starred soldiers (13, 16) pinned on top
    expect(list.rows.slice(0, 2).map((r) => r.soldier.id).sort()).toEqual([soldier('13'), soldier('16')]);
    const pending = groupReportsResponseSchema.parse(
      (await call('GET', `/commander/groups/${TEAM1}/reports?pending=true`)).json,
    );
    expect(pending.rows).toHaveLength(3);
  });

  test('soldiers never see commander-only reasons', async () => {
    as(soldier('11'));
    const s = statusesResponseSchema.parse((await call('GET', '/statuses')).json);
    expect(s.categories.flatMap((c) => c.reasons).some((r) => r.commanderOnly)).toBe(false);
  });
});

describe('mock API — soldier report rules', () => {
  test('one-tap, window, lock, note, document rules', async () => {
    as(soldier('16')); // not reported today
    const s = (await call('GET', '/statuses')).json as StatusesResponse;
    const present = reasonId(s, 'present')!;
    expect((await call('GET', '/reports/today')).json.report).toBeNull();
    expect((await call('PUT', `/reports/${TODAY}`, { reasonId: present })).status).toBe(200);
    expect((await call('GET', '/reports/today')).json.report.reason.code).toBe('present');

    expect((await call('PUT', '/reports/2026-09-30', { reasonId: present })).json.error.code).toBe('OUT_OF_WINDOW');
    expect((await call('PUT', '/reports/2026-09-21', { reasonId: present })).json.error.code).toBe('DAY_LOCKED');
    expect((await call('PUT', '/reports/2026-09-23', { reasonId: present, note: 'x' })).json.error.code).toBe(
      'NOTE_NOT_ALLOWED',
    );
    const sick = reasonId(s, 'sick_gimelim')!;
    expect((await call('PUT', '/reports/2026-09-23', { reasonId: sick })).json.error.code).toBe('DOCUMENT_REQUIRED');
    expect((await call('PUT', '/reports/2026-09-23', { reasonId: 11 })).json.error.code).toBe('REASON_NOT_ALLOWED');
    expect((await call('PUT', `/reports/${TODAY}`, { reasonId: present, userId: U.team1Cmd })).status).toBe(400);

    expect((await call('PUT', '/reports/2026-09-24', { reasonId: present })).status).toBe(200);
    expect((await call('DELETE', '/reports/2026-09-24')).status).toBe(204);
    expect((await call('DELETE', `/reports/${TODAY}`)).json.error.code).toBe('DAY_LOCKED');
  });

  test('document upload feeds a sick report', async () => {
    as(soldier('16'));
    const upload = async (bytes: number, type: string) => {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(bytes)], { type }), 'note.pdf');
      const res = await fetch('http://localhost/api/v1/documents', { method: 'POST', body: form });
      return { status: res.status, json: await res.json() };
    };
    expect((await upload(6_000_000, 'application/pdf')).status).toBe(413);
    expect((await upload(10, 'text/html')).status).toBe(415);
    const ok = await upload(10, 'application/pdf');
    expect(ok.status).toBe(200);
    const s = (await call('GET', '/statuses')).json as StatusesResponse;
    const res = await call('PUT', '/reports/2026-09-23', {
      reasonId: reasonId(s, 'sick_gimelim'),
      documentId: ok.json.documentId,
    });
    expect(res.status).toBe(200);
  });

  test('history, settings, push token', async () => {
    as(soldier('11'));
    const hist = reportsResponseSchema.parse((await call('GET', '/reports?from=2026-09-01&to=2026-09-22')).json);
    expect(hist.reports.filter((r) => r.source === 'commander').map((r) => r.date).sort()).toEqual([
      '2026-09-16',
      '2026-09-20',
    ]);
    expect((await call('GET', '/reports?from=2026-06-01&to=2026-09-22')).status).toBe(400);
    settingsSchema.parse((await call('GET', '/settings')).json);
    expect((await call('PUT', '/settings', { nudgeEnabled: true })).json.nudgeEnabled).toBe(true);
    expect((await call('POST', '/push-tokens', { token: 'ExponentPushToken[x]', platform: 'ios' })).status).toBe(204);
  });
});

describe('mock API — commander / HR scope', () => {
  test('other branch → 403; bulk is all-or-nothing', async () => {
    const db = as(U.team2Cmd);
    expect((await call('GET', `/commander/groups/${TEAM1}/reports`)).status).toBe(403);
    const mine = db.reports.find((r) => r.userId === soldier('22') && r.date === TODAY)!;
    const theirs = db.reports.find((r) => r.userId === soldier('13') && r.date === TODAY)!;
    expect((await call('POST', '/commander/reports/approve', { reportIds: [mine.id, theirs.id] })).status).toBe(403);
    expect(mine.approvedAt).toBeNull();
    expect((await call('POST', '/commander/reports/approve', { reportIds: [mine.id] })).json.approvedCount).toBe(1);
  });

  test('edit, report-for, favorites, document url', async () => {
    as(U.team1Cmd);
    const edited = await call('PUT', `/commander/soldiers/${soldier('16')}/reports/${TODAY}`, { reasonId: 11 });
    expect(edited.json).toMatchObject({ source: 'commander', reason: { code: 'course' } });
    expect((await call('PUT', `/commander/soldiers/${soldier('16')}/reports/2026-09-21`, { reasonId: 1 })).json.error.code).toBe(
      'DAY_LOCKED',
    );
    expect((await call('PUT', `/commander/soldiers/${soldier('22')}/reports/${TODAY}`, { reasonId: 1 })).status).toBe(403);
    expect((await call('PUT', `/commander/favorites/${soldier('17')}`)).status).toBe(204);
    expect((await call('DELETE', `/commander/favorites/${soldier('17')}`)).status).toBe(204);
    const url = await call('GET', '/commander/documents/00000000-0000-0000-0000-0000000d0001/url');
    expect(url.json.url).toMatch(/^https:/);
  });

  test('HR: finalize in scope only; commanders cannot finalize; finalized day is locked', async () => {
    const db = as(U.hrTeam2);
    const team1Report = db.reports.find((r) => r.userId === soldier('13') && r.date === TODAY)!;
    const team2Report = db.reports.find((r) => r.userId === soldier('22') && r.date === TODAY)!;
    expect((await call('POST', '/hr/reports/finalize', { reportIds: [team1Report.id] })).status).toBe(403);
    expect((await call('POST', '/hr/reports/finalize', { reportIds: [team2Report.id] })).json.finalizedCount).toBe(1);
    expect((await call('GET', '/commander/groups')).json.groups[0].id).toBe(TEAM2);

    server.resetHandlers(...createHandlers(db, soldier('22'), () => NOW));
    expect((await call('PUT', `/reports/${TODAY}`, { reasonId: 1 })).json.error.code).toBe('DAY_FINALIZED');

    server.resetHandlers(...createHandlers(db, U.hrTeam2, () => NOW));
    expect((await call('DELETE', `/hr/reports/${team2Report.id}/finalize`)).status).toBe(204);

    server.resetHandlers(...createHandlers(db, U.team2Cmd, () => NOW));
    expect((await call('POST', '/hr/reports/finalize', { reportIds: [team2Report.id] })).status).toBe(403);
  });
});

describe('mock API — emergency', () => {
  test('start → active → respond → live view → end', async () => {
    const db = as(U.companyCmd);
    const start = await call('POST', '/commander/emergencies', { groupId: COMPANY, message: 'בדיקה' });
    expect(start.status).toBe(200);
    expect((await call('POST', '/commander/emergencies', { groupId: COMPANY })).json.error.code).toBe(
      'EMERGENCY_ALREADY_OPEN',
    );
    const list = groupReportsResponseSchema.parse((await call('GET', `/commander/groups/${COMPANY}/reports`)).json);
    expect(list.openEmergencyId).toBe(start.json.id);

    server.resetHandlers(...createHandlers(db, soldier('22'), () => NOW));
    const active = activeEmergenciesResponseSchema.parse((await call('GET', '/emergencies/active')).json);
    expect(active.events.map((e) => e.id)).toEqual([start.json.id]);
    expect((await call('POST', `/emergencies/${start.json.id}/respond`, { status: 'need_help' })).status).toBe(204);

    server.resetHandlers(...createHandlers(db, U.companyCmd, () => NOW));
    const detail = emergencyDetailResponseSchema.parse((await call('GET', `/commander/emergencies/${start.json.id}`)).json);
    expect(detail.counts).toMatchObject({ needHelp: 1, ok: 0 });
    expect(detail.responses[0]!.status).toBe('need_help');
    expect((await call('POST', `/commander/emergencies/${start.json.id}/end`)).status).toBe(204);
    expect((await call('POST', `/commander/emergencies/${start.json.id}/end`)).json.error.code).toBe('EMERGENCY_ENDED');
  });

  test('seeded past drill: two never answered, one needed help', async () => {
    as(U.companyCmd);
    const d = emergencyDetailResponseSchema.parse(
      (await call('GET', '/commander/emergencies/00000000-0000-0000-0000-0000000e0001')).json,
    );
    expect(d.counts).toEqual({ ok: 12, needHelp: 1, noResponse: 2 });
  });
});
