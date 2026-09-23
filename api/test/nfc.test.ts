// NFC speedgate — enrollment, reader auth, scan state machine, report reconciliation.
// Sandbox rows only (own HR admin, soldiers, group, second base); removed afterwards.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  createNfcReaderResponseSchema,
  errorResponseSchema,
  nfcCardEnrollmentResponseSchema,
  speedgateScanResponseSchema,
} from '@doch1/shared';

const SUPABASE_URL = 'https://nfc-test.supabase.co';
const SECRET = 'nfc-test-jwt-secret-at-least-32-chars!!';
const HMAC_SECRET = 'nfc-test-hmac-secret-at-least-32-bytes-long!!';
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_JWT_SECRET = SECRET;
process.env.NFC_CARD_HMAC_SECRET = HMAC_SECRET;

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

const id = (n: string) => `dc000000-0000-0000-0000-${n.padStart(12, '0')}`;
const X = {
  group: id('a0'),
  otherBase: id('b0'),
  hr: id('1'),
  a: id('2'),
  b: id('3'),
  c: id('4'),
};
const SANDBOX = [X.hr, X.a, X.b, X.c];
const PN = { hr: '957700001', a: '957700002', b: '957700003', c: '957700004' };
const EMAIL = { hr: 'nfc.hr@example.com', plainSoldier: 'soldier01@example.com', otherHr: 'hr.team2@example.com' };
const SERIAL = { a: '3141592653', b: '2718281828', c: '1618033988', unknown: '1414213562' };

describe.skipIf(!process.env.DATABASE_URL)('NFC speedgate', () => {
  let app: FastifyInstance;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sql: any;
  const readers: string[] = [];
  let gate1 = ''; // test-base reader token
  let gate2 = ''; // other base reader token

  const asUser = (email: string, method: string, url: string, body?: unknown) =>
    app
      .inject({
        method: method as 'GET',
        url: `/api/v1${url}`,
        headers: { authorization: `Bearer ${tokenFor(email)}` },
        ...(body === undefined ? {} : { payload: body as object }),
      })
      .then((r) => ({ status: r.statusCode, json: r.body ? r.json() : null }));

  const scanWith = (authorization: string | undefined, serial: string, requestId: string = randomUUID()) =>
    app
      .inject({
        method: 'POST',
        url: '/api/v1/speedgate/scans',
        headers: authorization ? { authorization } : {},
        payload: { calypsoSerial: serial, requestId },
      })
      .then((r) => ({ status: r.statusCode, json: r.json(), requestId }));
  const scan = (token: string, serial: string, requestId?: string) =>
    scanWith(`Gate ${token}`, serial, requestId);

  // Moves the card's last scan outside the 10 s duplicate window.
  const ageLastScan = (userId: string) =>
    sql`update nfc_scan_events set scanned_at = scanned_at - interval '11 seconds' where user_id = ${userId}`;

  async function cleanup() {
    await sql`delete from nfc_scan_events where user_id = any(${SANDBOX}) or reader_id = any(${readers}::uuid[])`;
    await sql`delete from base_visits where user_id = any(${SANDBOX})`;
    await sql`delete from report_audit where user_id = any(${SANDBOX}) or actor_id = any(${SANDBOX})`;
    await sql`delete from reports where user_id = any(${SANDBOX})`;
    await sql`delete from user_nfc_cards where user_id = any(${SANDBOX}) or enrolled_by = any(${SANDBOX})`;
    await sql`delete from nfc_readers where id = any(${readers}::uuid[]) or base_id = ${X.otherBase}`;
    await sql`delete from bases where id = ${X.otherBase}`;
    await sql`delete from groups where id = ${X.group}`;
    await sql`delete from users where id = any(${SANDBOX})`;
  }

  beforeAll(async () => {
    const { buildServer } = await import('../src/server');
    ({ sqlClient: sql } = await import('../src/db/client'));
    app = await buildServer();
    await cleanup();
    await sql`insert into users (id, personal_number, first_name, last_name, email, role) values
      (${X.hr}, ${PN.hr}, 'משאן', 'בדיקה', ${EMAIL.hr}, 'admin'),
      (${X.a}, ${PN.a}, 'אבי', 'שער', 'nfc.a@example.com', 'soldier'),
      (${X.b}, ${PN.b}, 'בני', 'שער', 'nfc.b@example.com', 'soldier'),
      (${X.c}, ${PN.c}, 'גלי', 'שער', 'nfc.c@example.com', 'soldier')`;
    await sql`insert into groups (id, name, code, parent_id, commander_id) values (${X.group}, 'צוות NFC', 'NFC-SANDBOX', null, null)`;
    await sql`update users set group_id = ${X.group} where id in (${X.a}, ${X.b}, ${X.c})`;
    await sql`insert into hr_assignments (hr_user_id, group_id) values (${X.hr}, ${X.group})`;
    await sql`insert into bases (id, code, name) values (${X.otherBase}, 'nfc-test-other', 'בסיס אחר')`;
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  describe('provisioning + enrollment (HR only)', () => {
    test('reader provisioning: 401 without login, 403 for a non-admin, 201 for HR', async () => {
      const anon = await app.inject({ method: 'POST', url: '/api/v1/nfc/readers', payload: { baseCode: 'test-base', name: 'x' } });
      expect(anon.statusCode).toBe(401);
      expect((await asUser(EMAIL.plainSoldier, 'POST', '/nfc/readers', { baseCode: 'test-base', name: 'x' })).status).toBe(403);

      const r1 = await asUser(EMAIL.hr, 'POST', '/nfc/readers', { baseCode: 'test-base', name: 'שער ראשי' });
      expect(r1.status).toBe(201);
      const one = createNfcReaderResponseSchema.parse(r1.json);
      const r2 = await asUser(EMAIL.hr, 'POST', '/nfc/readers', { baseCode: 'nfc-test-other', name: 'שער אחר' });
      const two = createNfcReaderResponseSchema.parse(r2.json);
      readers.push(one.readerId, two.readerId);
      gate1 = one.readerToken;
      gate2 = two.readerToken;
      const [row] = await sql`select key_hash from nfc_readers where id = ${one.readerId}`;
      expect(row.key_hash).not.toContain(one.readerToken.split('.')[1]); // only the hash is stored
    });

    test('enrollment: non-admin → 403; HR outside the unit → 403; unknown number → 403', async () => {
      expect((await asUser(EMAIL.plainSoldier, 'PUT', '/nfc/cards', { personalNumber: PN.a, calypsoSerial: SERIAL.a })).status).toBe(403);
      expect((await asUser(EMAIL.otherHr, 'PUT', '/nfc/cards', { personalNumber: PN.a, calypsoSerial: SERIAL.a })).status).toBe(403);
      expect((await asUser(EMAIL.hr, 'PUT', '/nfc/cards', { personalNumber: '959999999', calypsoSerial: SERIAL.a })).status).toBe(403);
    });

    test('enrollment: HR in scope → 200, repeat is idempotent, raw serial is not stored', async () => {
      for (const who of ['a', 'b', 'c'] as const) {
        const r = await asUser(EMAIL.hr, 'PUT', '/nfc/cards', { personalNumber: PN[who], calypsoSerial: SERIAL[who] });
        expect(r.status).toBe(200);
        expect(nfcCardEnrollmentResponseSchema.parse(r.json).serialLast4).toBe(SERIAL[who].slice(-4));
      }
      expect((await asUser(EMAIL.hr, 'PUT', '/nfc/cards', { personalNumber: PN.a, calypsoSerial: SERIAL.a })).status).toBe(200);
      const [card] = await sql`select serial_fingerprint from user_nfc_cards where user_id = ${X.a} and revoked_at is null`;
      const expected = createHmac('sha256', HMAC_SECRET).update(`calypso:v1:${SERIAL.a}`).digest('hex');
      expect(card.serial_fingerprint).toBe(expected);
    });

    test('a card already bound to another soldier → 409', async () => {
      const r = await asUser(EMAIL.hr, 'PUT', '/nfc/cards', { personalNumber: PN.b, calypsoSerial: SERIAL.a });
      expect(r.status).toBe(409);
      expect(errorResponseSchema.parse(r.json).error.code).toBe('NFC_CARD_ALREADY_ENROLLED');
    });
  });

  describe('reader authentication', () => {
    test('missing, malformed or wrong credential → 401', async () => {
      expect((await scanWith(undefined, SERIAL.a)).status).toBe(401);
      expect((await scanWith('Gate nonsense', SERIAL.a)).status).toBe(401);
      expect((await scanWith(`Bearer ${gate1}`, SERIAL.a)).status).toBe(401);
      const [readerId] = gate1.split('.');
      expect((await scanWith(`Gate ${readerId}.${'A'.repeat(43)}`, SERIAL.a)).status).toBe(401);
    });
  });

  describe('scan state machine', () => {
    test('unknown card → unknown_card, no identity', async () => {
      const r = await scan(gate1, SERIAL.unknown);
      expect(r.status).toBe(200);
      expect(speedgateScanResponseSchema.parse(r.json)).toMatchObject({ result: 'unknown_card', soldier: null, present: false });
    });

    test('first scan enters; creates today as present (source nfc, audited)', async () => {
      const r = speedgateScanResponseSchema.parse((await scan(gate1, SERIAL.a)).json);
      expect(r).toMatchObject({ result: 'entry', present: true, soldier: { id: X.a }, base: { code: 'test-base' } });
      expect(r.reportDays).toHaveLength(1);
      expect(r.reportDays[0]!.result).toBe('created');
      const [rep] = await sql`select r.source, s.code, (select count(*) from report_audit a where a.report_id = r.id)::int as audits
        from reports r join status_reasons s on s.id = r.reason_id where r.user_id = ${X.a} and r.report_date = app_today()`;
      expect(rep).toMatchObject({ source: 'nfc', code: 'present', audits: 1 });
    });

    test('a second tap within 10 s is a duplicate — it does not exit', async () => {
      const r = speedgateScanResponseSchema.parse((await scan(gate1, SERIAL.a)).json);
      expect(r).toMatchObject({ result: 'duplicate', present: true });
      const [open] = await sql`select count(*)::int as n from base_visits where user_id = ${X.a} and exited_at is null`;
      expect(open.n).toBe(1);
    });

    test('next scan exits; a retry with the same requestId replays it without re-applying', async () => {
      await ageLastScan(X.a);
      const first = await scan(gate1, SERIAL.a);
      const exit = speedgateScanResponseSchema.parse(first.json);
      expect(exit).toMatchObject({ result: 'exit', present: false });
      expect(exit.visit?.exitedAt).not.toBeNull();
      expect(exit.reportDays.map((d) => d.result)).toEqual(['created']); // entry day kept its first result

      const [{ n: before }] = await sql`select count(*)::int as n from nfc_scan_events where user_id = ${X.a}`;
      const retry = speedgateScanResponseSchema.parse((await scan(gate1, SERIAL.a, first.requestId)).json);
      expect(retry).toMatchObject({ result: 'exit', scannedAt: exit.scannedAt, visit: { id: exit.visit!.id } });
      const [{ n: after }] = await sql`select count(*)::int as n from nfc_scan_events where user_id = ${X.a}`;
      expect(after).toBe(before);
    });

    test('multi-day visit: every date reconciled; manual and finalized reports are preserved', async () => {
      const [{ id: annual }] = await sql`select id from status_reasons where code = 'annual_leave'`;
      const [{ id: sickD }] = await sql`select id from status_reasons where code = 'sick_day_d'`;
      await sql`insert into reports (user_id, report_date, reason_id, reported_by, last_modified_by) values
        (${X.b}, app_today() - 2, ${annual}, ${X.b}, ${X.b})`;
      await sql`insert into reports (user_id, report_date, reason_id, reported_by, last_modified_by, finalized_by, finalized_at) values
        (${X.b}, app_today() - 1, ${sickD}, ${X.b}, ${X.b}, ${X.hr}, now())`;

      expect(speedgateScanResponseSchema.parse((await scan(gate1, SERIAL.b)).json).result).toBe('entry');
      await sql`update base_visits set entered_at = entered_at - interval '2 days' where user_id = ${X.b} and exited_at is null`;
      await ageLastScan(X.b);

      const exit = speedgateScanResponseSchema.parse((await scan(gate1, SERIAL.b)).json);
      expect(exit.result).toBe('exit');
      expect(exit.reportDays.map((d) => d.result)).toEqual(['conflict', 'finalized_conflict', 'created']);

      const rows = await sql`select r.report_date::text as d, s.code, r.source, r.finalized_at is not null as fin
        from reports r join status_reasons s on s.id = r.reason_id where r.user_id = ${X.b} order by r.report_date`;
      expect(rows.map((r: { code: string; source: string; fin: boolean }) => [r.code, r.source, r.fin])).toEqual([
        ['annual_leave', 'self', false],
        ['sick_day_d', 'self', true],
        ['present', 'nfc', false],
      ]);
      const [{ n }] = await sql`select count(*)::int as n from nfc_presence_days p join base_visits v on v.id = p.visit_id where v.user_id = ${X.b}`;
      expect(n).toBe(3);
    });

    test('wrong base: open visit elsewhere → wrong_base, visit stays open', async () => {
      await ageLastScan(X.a);
      expect(speedgateScanResponseSchema.parse((await scan(gate1, SERIAL.a)).json).result).toBe('entry');
      await ageLastScan(X.a);
      const r = speedgateScanResponseSchema.parse((await scan(gate2, SERIAL.a)).json);
      expect(r).toMatchObject({ result: 'wrong_base', present: true, base: { code: 'nfc-test-other' } });
      const [open] = await sql`select b.code from base_visits v join bases b on b.id = v.base_id where v.user_id = ${X.a} and v.exited_at is null`;
      expect(open.code).toBe('test-base');
    });

    test('inactive soldier → inactive_user, identity withheld, nothing opened', async () => {
      await sql`update users set is_active = false where id = ${X.c}`;
      const r = speedgateScanResponseSchema.parse((await scan(gate1, SERIAL.c)).json);
      expect(r).toMatchObject({ result: 'inactive_user', soldier: null, present: false, visit: null });
      const [{ n }] = await sql`select count(*)::int as n from base_visits where user_id = ${X.c}`;
      expect(n).toBe(0);
    });

    test('revoked card scans as unknown', async () => {
      await sql`update users set is_active = true where id = ${X.c}`;
      expect((await asUser(EMAIL.hr, 'DELETE', '/nfc/cards', { personalNumber: PN.c })).status).toBe(204);
      expect(speedgateScanResponseSchema.parse((await scan(gate1, SERIAL.c)).json).result).toBe('unknown_card');
    });

    test('the raw Calypso serial is never stored anywhere', async () => {
      const dump = await sql`
        select row_to_json(t)::text as j from user_nfc_cards t where user_id = any(${SANDBOX})
        union all select row_to_json(t)::text from nfc_scan_events t where reader_id = any(${readers}::uuid[])
        union all select row_to_json(t)::text from nfc_readers t where id = any(${readers}::uuid[])`;
      const all = dump.map((r: { j: string }) => r.j).join('\n');
      expect(all.length).toBeGreaterThan(0);
      for (const serial of Object.values(SERIAL)) expect(all).not.toContain(serial);
    });
  });
});
