import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  putReportResponseSchema,
  reportsResponseSchema,
  todayReportResponseSchema,
} from '@doch1/shared';
import { buildServer } from '../src/server';
import reportsRoutes from '../src/modules/reports/routes';
import { registerErrorHandling } from '../src/plugins/errors';
import {
  atJerusalem,
  clock,
  dayDiff,
  jerusalemDate,
  jerusalemHHMM,
} from '../src/modules/reports/time';

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('B3 time helpers (Asia/Jerusalem)', () => {
  test('winter is UTC+2, summer is UTC+3', () => {
    expect(atJerusalem('2026-01-15', '11:00')).toBe('2026-01-15T09:00:00.000Z');
    expect(atJerusalem('2026-07-15', '11:00')).toBe('2026-07-15T08:00:00.000Z');
    expect(atJerusalem('2026-07-15', '23:59')).toBe('2026-07-15T20:59:00.000Z');
  });
  test('the Israeli date rolls over before UTC does', () => {
    const d = new Date('2026-07-15T21:30:00Z'); // 00:30 on the 16th in Israel
    expect(jerusalemDate(d)).toBe('2026-07-16');
    expect(jerusalemHHMM(d)).toBe('00:30');
  });
  test('dayDiff', () => {
    expect(dayDiff('2026-09-22', '2026-09-29')).toBe(7);
    expect(dayDiff('2026-09-22', '2026-09-21')).toBe(-1);
    expect(dayDiff('2026-03-26', '2026-03-28')).toBe(2); // across the DST change
  });
});

describe('B3 routes require a logged-in user (401)', () => {
  test.each([
    ['GET', '/reports/today'],
    ['GET', '/reports?from=2026-09-01&to=2026-09-10'],
    ['PUT', '/reports/2026-09-22'],
    ['DELETE', '/reports/2026-09-23'],
  ] as const)('%s %s', async (method, url) => {
    const app = await buildServer({ modules: [reportsRoutes] });
    const res = await app.inject({
      method,
      url: `/api/v1${url}`,
      payload: method === 'PUT' ? { reasonId: 1 } : undefined,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
    await app.close();
  });
});

// Needs the seeded DB (db/init.sql). Runs as a dedicated test user so seeded data stays intact;
// the route is mounted with the identity the auth hook would set.
describe.skipIf(!process.env.DATABASE_URL)('B3 soldier reports', () => {
  const ME = 'b3000000-0000-0000-0000-000000000001';
  const MY_DOC = 'b3000000-0000-0000-0000-0000000d0001';
  const OTHERS_DOC = '00000000-0000-0000-0000-0000000d0001'; // seeded, owned by soldier 13
  const HR = '00000000-0000-0000-0000-000000000098';
  const CMD = '00000000-0000-0000-0000-000000000003';
  // Israel's date at the real "now" — seeded rows are relative to it, so the fake clock keeps it.
  const TODAY = jerusalemDate(new Date());
  const at = (hhmm: string, date = TODAY) => {
    vi.spyOn(clock, 'now').mockReturnValue(new Date(atJerusalem(date, hhmm)));
  };

  let app: FastifyInstance;
  let sql: typeof import('../src/db/client').sqlClient;
  const reason: Record<string, number> = {};

  beforeAll(async () => {
    ({ sqlClient: sql } = await import('../src/db/client'));
    await cleanup();
    await sql`insert into users (id, personal_number, first_name, last_name, email)
      values (${ME}, '9999902', 'בדיקה', 'דיווחים', 'b3.soldier@example.com')`;
    await sql`insert into documents (id, owner_id, storage_path, mime_type, size_bytes)
      values (${MY_DOC}, ${ME}, ${`${ME}/b3-note.pdf`}, 'application/pdf', 1000)`;
    for (const r of await sql<{ id: number; code: string }[]>`select id, code from status_reasons`)
      reason[r.code] = r.id;

    app = Fastify();
    registerErrorHandling(app);
    app.addHook('onRequest', async (req) => {
      req.user = { id: ME, role: 'soldier' };
    });
    await app.register(reportsRoutes);
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
  });
  beforeEach(async () => {
    at('10:00');
    await sql`delete from reports where user_id = ${ME}`;
    await sql`delete from report_audit where user_id = ${ME}`;
  });
  afterEach(() => vi.restoreAllMocks());

  async function cleanup() {
    await sql`delete from report_audit where user_id = ${ME} or actor_id = ${ME}`;
    await sql`delete from users where id = ${ME}`; // reports + documents cascade
  }

  const put = (date: string, payload: object) =>
    app.inject({ method: 'PUT', url: `/reports/${date}`, payload });
  const del = (date: string) => app.inject({ method: 'DELETE', url: `/reports/${date}` });
  const get = (url: string) => app.inject({ url });
  const present = () => ({ reasonId: reason.present! });
  const errorCode = (res: { json(): { error: { code: string } } }) => res.json().error.code;
  const audit = () =>
    sql<
      {
        action: string;
        old_reason_id: number | null;
        new_reason_id: number | null;
        actor_id: string;
      }[]
    >`
      select action, old_reason_id, new_reason_id, actor_id from report_audit
      where user_id = ${ME} order by id`;

  describe('time-rule table (SPEC §4)', () => {
    test.each([
      ['10:59', 0, 200, null],
      ['11:01', 0, 200, null], // late, but still allowed
      ['23:58', 0, 200, null],
      ['23:59', 0, 422, 'DAY_LOCKED'],
      ['10:00', -1, 422, 'DAY_LOCKED'],
      ['10:00', 1, 200, null],
      ['10:00', 7, 200, null],
      ['10:00', 8, 422, 'OUT_OF_WINDOW'],
      ['23:59', 7, 200, null], // the 23:59 lock is about today only
    ] as const)('at %s, today%+d → %i %s', async (hhmm, offset, status, code) => {
      at(hhmm);
      const res = await put(addDays(TODAY, offset), present());
      expect(res.statusCode).toBe(status);
      if (code) expect(errorCode(res)).toBe(code);
    });

    test('just after midnight in Israel, "today" is the Israeli date, not UTC', async () => {
      at('00:05');
      const utcDate = new Date(atJerusalem(TODAY, '00:05')).toISOString().slice(0, 10);
      expect(utcDate).toBe(addDays(TODAY, -1));
      expect((await put(TODAY, present())).statusCode).toBe(200);
      expect(errorCode(await put(utcDate, present()))).toBe('DAY_LOCKED');
    });

    test('GET /reports/today: deadline 11:00, isLate flips after it', async () => {
      at('10:59');
      const before = todayReportResponseSchema.parse((await get('/reports/today')).json());
      expect(before).toMatchObject({
        date: TODAY,
        deadline: atJerusalem(TODAY, '11:00'),
        editLockAt: atJerusalem(TODAY, '23:59'),
        isLate: false,
        report: null,
      });
      expect(before.serverTime).toBe(atJerusalem(TODAY, '10:59'));

      at('11:01');
      await put(TODAY, present());
      const after = todayReportResponseSchema.parse((await get('/reports/today')).json());
      expect(after.isLate).toBe(true);
      expect(after.report?.reason.code).toBe('present');
    });
  });

  describe('PUT /reports/:date', () => {
    test('one-tap on_base: contract shape, self source, audit row', async () => {
      const res = await put(TODAY, present());
      expect(res.statusCode).toBe(200);
      const r = putReportResponseSchema.parse(res.json());
      expect(r).toMatchObject({
        userId: ME,
        date: TODAY,
        reason: { code: 'present', categoryCode: 'on_base' },
        note: null,
        documentId: null,
        source: 'self',
        reportedBy: { id: ME },
        lastModifiedBy: { id: ME },
        approvedBy: null,
        approvedAt: null,
        finalizedBy: null,
        finalizedAt: null,
      });
      expect(await audit()).toEqual([
        { action: 'create', old_reason_id: null, new_reason_id: reason.present, actor_id: ME },
      ]);
    });

    test('גימלים requires a document', async () => {
      const res = await put(TODAY, { reasonId: reason.sick_gimelim });
      expect(res.statusCode).toBe(422);
      expect(errorCode(res)).toBe('DOCUMENT_REQUIRED');
      const ok = await put(TODAY, { reasonId: reason.sick_gimelim, documentId: MY_DOC });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().documentId).toBe(MY_DOC);
    });

    test("יום ד' needs no document", async () => {
      expect((await put(TODAY, { reasonId: reason.sick_day_d })).statusCode).toBe(200);
    });

    test("someone else's document, or an unknown one → 403", async () => {
      for (const documentId of [OTHERS_DOC, 'b3000000-0000-0000-0000-00000000ffff']) {
        const res = await put(TODAY, { reasonId: reason.sick_gimelim, documentId });
        expect(res.statusCode).toBe(403);
        expect(errorCode(res)).toBe('FORBIDDEN');
      }
    });

    test('note only on reasons that allow it', async () => {
      const bad = await put(TODAY, { ...present(), note: 'hi' });
      expect(bad.statusCode).toBe(422);
      expect(errorCode(bad)).toBe('NOTE_NOT_ALLOWED');
      const ok = await put(TODAY, { reasonId: reason.after_duty, note: '  משמרת לילה  ' });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().note).toBe('משמרת לילה');
    });

    test('note over 200 chars → 400', async () => {
      const res = await put(TODAY, { reasonId: reason.after_duty, note: 'א'.repeat(201) });
      expect(res.statusCode).toBe(400);
    });

    test('commander-only and unknown reasons → REASON_NOT_ALLOWED', async () => {
      for (const reasonId of [reason.course!, reason.attached_other_unit!, 999, 40000]) {
        const res = await put(TODAY, { reasonId });
        expect(res.statusCode).toBe(422);
        expect(errorCode(res)).toBe('REASON_NOT_ALLOWED');
      }
    });

    test('mass assignment: unknown body fields are rejected (400), nothing written', async () => {
      for (const extra of [{ source: 'hr' }, { userId: CMD }, { approvedBy: CMD }]) {
        const res = await put(TODAY, { ...present(), ...extra });
        expect(res.statusCode).toBe(400);
        expect(errorCode(res)).toBe('VALIDATION_ERROR');
      }
      expect(await audit()).toEqual([]);
    });

    test('bad date param → 400', async () => {
      expect((await put('2026-02-30', present())).statusCode).toBe(400);
      expect((await put('tomorrow', present())).statusCode).toBe(400);
    });

    test('edit resets stage-1 approval, keeps reportedBy, audits old → new reason', async () => {
      await put(TODAY, present());
      await sql`update reports set approved_by = ${CMD}, approved_at = now(),
        reported_by = ${CMD}, source = 'commander' where user_id = ${ME}`;
      const res = await put(TODAY, { reasonId: reason.errands_day });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        reason: { code: 'errands_day' },
        source: 'self',
        reportedBy: { id: CMD },
        lastModifiedBy: { id: ME },
        approvedBy: null,
        approvedAt: null,
      });
      expect((await audit()).at(-1)).toEqual({
        action: 'update',
        old_reason_id: reason.present,
        new_reason_id: reason.errands_day,
        actor_id: ME,
      });
    });

    test('a finalized day is read-only for the soldier', async () => {
      await put(TODAY, present());
      await sql`update reports set finalized_by = ${HR}, finalized_at = now() where user_id = ${ME}`;
      const res = await put(TODAY, { reasonId: reason.errands_day });
      expect(res.statusCode).toBe(422);
      expect(errorCode(res)).toBe('DAY_FINALIZED');
    });

    test('two parallel PUTs for a new day → one row, create + update audited', async () => {
      const date = addDays(TODAY, 3);
      const [a, b] = await Promise.all([
        put(date, present()),
        put(date, { reasonId: reason.errands_day }),
      ]);
      expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
      const rows = await sql`select 1 from reports where user_id = ${ME} and report_date = ${date}`;
      expect(rows).toHaveLength(1);
      expect((await audit()).map((r) => r.action).sort()).toEqual(['create', 'update']);
    });
  });

  describe('DELETE /reports/:date', () => {
    test('future report → 204, gone, audited', async () => {
      const date = addDays(TODAY, 2);
      await put(date, present());
      const res = await del(date);
      expect(res.statusCode).toBe(204);
      expect(await sql`select 1 from reports where user_id = ${ME}`).toHaveLength(0);
      expect((await audit()).at(-1)).toEqual({
        action: 'delete',
        old_reason_id: reason.present,
        new_reason_id: null,
        actor_id: ME,
      });
    });

    test('today and past days can not be deleted', async () => {
      await put(TODAY, present());
      for (const date of [TODAY, addDays(TODAY, -1)]) {
        const res = await del(date);
        expect(res.statusCode).toBe(422);
        expect(errorCode(res)).toBe('DAY_LOCKED');
      }
    });

    test('nothing to delete → 404', async () => {
      const res = await del(addDays(TODAY, 4));
      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe('NOT_FOUND');
    });

    test('finalized future day → DAY_FINALIZED', async () => {
      const date = addDays(TODAY, 1);
      await put(date, present());
      await sql`update reports set finalized_by = ${HR}, finalized_at = now() where user_id = ${ME}`;
      expect(errorCode(await del(date))).toBe('DAY_FINALIZED');
    });

    test("cannot delete another soldier's report (self-scoped by request.user)", async () => {
      // Soldier 11 has a seeded report on today+1; as ME the same date is simply not found.
      const res = await del(addDays(TODAY, 1));
      expect(res.statusCode).toBe(404);
      const [row] = await sql`select 1 from reports
        where user_id = '00000000-0000-0000-0000-000000000011' and report_date = ${addDays(TODAY, 1)}`;
      expect(row).toBeDefined();
    });
  });

  describe('GET /reports?from=&to=', () => {
    test('own reports only, sorted, both stages exposed', async () => {
      await put(addDays(TODAY, 2), present());
      await put(TODAY, present());
      await sql`update reports set approved_by = ${CMD}, approved_at = now(),
        finalized_by = ${HR}, finalized_at = now() where user_id = ${ME} and report_date = ${TODAY}`;
      const res = await get(`/reports?from=${addDays(TODAY, -30)}&to=${addDays(TODAY, 7)}`);
      expect(res.statusCode).toBe(200);
      const { reports } = reportsResponseSchema.parse(res.json());
      expect(reports.map((r) => r.date)).toEqual([TODAY, addDays(TODAY, 2)]);
      expect(reports.every((r) => r.userId === ME)).toBe(true);
      expect(reports[0]).toMatchObject({ approvedBy: { id: CMD }, finalizedBy: { id: HR } });
    });

    test('invalid ranges and unknown params → 400', async () => {
      for (const q of [
        `from=${TODAY}&to=${addDays(TODAY, -1)}`, // from > to
        `from=${addDays(TODAY, -62)}&to=${TODAY}`, // 63 days
        `from=${TODAY}`,
        `from=${TODAY}&to=${TODAY}&userId=${CMD}`,
      ]) {
        const res = await get(`/reports?${q}`);
        expect(res.statusCode).toBe(400);
        expect(errorCode(res)).toBe('VALIDATION_ERROR');
      }
    });
  });
});
