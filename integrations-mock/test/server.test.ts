import { randomBytes, randomInt } from 'node:crypto';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { ERROR_HTTP, INTEGRATION_KEY_HEADER } from '@doch1/shared';
import { loadConfig, type Config } from '../src/config';
import { buildServer, type Deps } from '../src/server';

// Generated per run: a literal key or password in the repo would trip gitleaks (and be a bad habit).
const config: Config = loadConfig({
  DOCH1_API_URL: 'http://doch1.test/api/v1/',
  CPR_API_KEY: randomBytes(32).toString('hex'),
  PEOPLE_DIGITAL_API_KEY: randomBytes(32).toString('hex'),
  MOCK_USER: 'demo',
  MOCK_PASSWORD: randomBytes(16).toString('hex'),
});
const SECRETS = [config.CPR_API_KEY, config.PEOPLE_DIGITAL_API_KEY, config.MOCK_PASSWORD];
const basic = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
const AUTH = { authorization: basic(config.MOCK_USER, config.MOCK_PASSWORD) };
const pn = () => String(randomInt(1_000_000, 10_000_000)); // fictional 7-digit personal number

// 22:30 UTC on 22/09 = 01:30 on 23/09 in Jerusalem: the UTC date would be the wrong issueDate.
const NOW = new Date('2026-09-22T22:30:00Z');

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const result = (personalNumber: string, dates: string[]) => ({
  personalNumber,
  reasonCode: 'sick_gimelim',
  dates,
  created: dates.length,
  updated: 0,
  unchanged: 0,
});

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(
  upstream: (url: string, init: RequestInit) => Promise<Response>,
  deps: Deps = {},
) {
  const fetchMock = vi.fn(upstream);
  app = await buildServer(config, {
    fetch: fetchMock as unknown as typeof fetch,
    now: () => NOW,
    ...deps,
  });
  return fetchMock;
}
const sentHeaders = (init: RequestInit) => new Headers(init.headers);
const expectNoSecrets = (res: LightMyRequestResponse) => {
  const everything = JSON.stringify(res.headers) + res.body;
  for (const s of SECRETS) expect(everything).not.toContain(s);
};

describe('Basic Auth', () => {
  test('/healthz stays open', async () => {
    await start(async () => json(200, {}));
    const res = await app!.inject({ url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  test.each([
    ['missing', {}],
    ['wrong password', { authorization: basic(config.MOCK_USER, `${config.MOCK_PASSWORD}x`) }],
    ['wrong user', { authorization: basic('someone', config.MOCK_PASSWORD) }],
    ['no colon', { authorization: `Basic ${Buffer.from('demo').toString('base64')}` }],
    ['not basic', { authorization: `Bearer ${config.MOCK_PASSWORD}` }],
  ])('%s → 401 with a Basic challenge, on the UI and the API', async (_name, headers) => {
    const fetchMock = await start(async () => json(200, { soldiers: [] }));
    for (const url of ['/', '/app.js', '/api/soldiers', '/api/config', '/nope']) {
      const res = await app!.inject({ url, headers });
      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toContain('Basic realm="doch1-integrations"');
      expect(res.json()).toEqual({
        error: { code: 'UNAUTHORIZED', message: ERROR_HTTP.UNAUTHORIZED.messageHe },
      });
    }
    const post = await app!.inject({
      method: 'POST',
      url: '/api/cpr',
      headers,
      payload: { personalNumber: pn(), days: 3 },
    });
    expect(post.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('correct login → the Hebrew RTL UI with a strict CSP', async () => {
    await start(async () => json(200, {}));
    const res = await app!.inject({ url: '/', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<html lang="he" dir="rtl">');
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self' https://fonts.googleapis.com");
    expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
  });
});

describe('relay to Doch1', () => {
  test('soldiers: CPR key, bounded query, response passed through', async () => {
    const soldiers = {
      soldiers: [{ personalNumber: pn(), firstName: 'פרטי', lastName: 'משפחה', groupName: null }],
    };
    const fetchMock = await start(async () => json(200, soldiers));
    const res = await app!.inject({ url: '/api/soldiers?q=%D7%A4%D7%A8', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(soldiers);
    expect(res.headers['cache-control']).toBe('no-store');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://doch1.test/api/v1/integrations/soldiers?limit=50&q=%D7%A4%D7%A8');
    expect(init.method).toBe('GET');
    expect(sentHeaders(init).get(INTEGRATION_KEY_HEADER)).toBe(config.CPR_API_KEY);
    expectNoSecrets(res);
  });

  test('CPR: CPR key, issueDate = today in Asia/Jerusalem', async () => {
    const who = pn();
    const fetchMock = await start(async () =>
      json(200, result(who, ['2026-09-24', '2026-09-25', '2026-09-26'])),
    );
    const res = await app!.inject({
      method: 'POST',
      url: '/api/cpr',
      headers: AUTH,
      payload: { personalNumber: who, days: 3 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().dates).toHaveLength(3);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://doch1.test/api/v1/integrations/cpr/sick-leave');
    expect(init.method).toBe('POST');
    expect(sentHeaders(init).get(INTEGRATION_KEY_HEADER)).toBe(config.CPR_API_KEY);
    expect(JSON.parse(String(init.body))).toEqual({
      personalNumber: who,
      days: 3,
      issueDate: '2026-09-23',
    });
    expectNoSecrets(res);
  });

  test('People: People key, body forwarded as-is', async () => {
    const who = pn();
    const body = { personalNumber: who, startDate: '2026-09-27', endDate: '2026-09-30' };
    const dates = ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30'];
    const fetchMock = await start(async () =>
      json(200, { ...result(who, dates), reasonCode: 'annual_leave' }),
    );
    const res = await app!.inject({
      method: 'POST',
      url: '/api/people-digital',
      headers: AUTH,
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://doch1.test/api/v1/integrations/people-digital/annual-leave');
    expect(sentHeaders(init).get(INTEGRATION_KEY_HEADER)).toBe(config.PEOPLE_DIGITAL_API_KEY);
    expect(JSON.parse(String(init.body))).toEqual(body);
    expectNoSecrets(res);
  });

  test.each([
    [401, 'INTEGRATION_UNAUTHORIZED'],
    [400, 'VALIDATION_ERROR'],
    [404, 'SOLDIER_NOT_FOUND'],
    [422, 'INTEGRATION_OUT_OF_WINDOW'],
    [429, 'RATE_LIMITED'],
  ] as const)('upstream %i %s passes through unchanged', async (status, code) => {
    const body = { error: { code, message: ERROR_HTTP[code].messageHe } };
    await start(async () => json(status, body));
    const res = await app!.inject({
      method: 'POST',
      url: '/api/cpr',
      headers: AUTH,
      payload: { personalNumber: pn(), days: 2 },
    });
    expect(res.statusCode).toBe(status);
    expect(res.body).toBe(JSON.stringify(body));
    expectNoSecrets(res);
  });

  test('upstream timeout → 502 UPSTREAM_UNAVAILABLE', async () => {
    await start(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener('abort', () => reject(init.signal!.reason)),
        ),
      { timeoutMs: 50 },
    );
    const res = await app!.inject({
      method: 'POST',
      url: '/api/cpr',
      headers: AUTH,
      payload: { personalNumber: pn(), days: 1 },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({
      error: { code: 'UPSTREAM_UNAVAILABLE', message: 'מערכת דוח 1 לא זמינה, נסו שוב בעוד דקה' },
    });
  });

  test.each([
    ['network error', async () => Promise.reject(new TypeError('fetch failed'))],
    ['non-JSON page', async () => new Response('<html>waking up</html>', { status: 503 })],
    ['off-contract body', async () => json(200, { hello: 'world' })],
  ])('%s → 502', async (_name, upstream) => {
    await start(upstream);
    const res = await app!.inject({ url: '/api/soldiers', headers: AUTH });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('UPSTREAM_UNAVAILABLE');
    expectNoSecrets(res);
  });
});

describe('strict validation (nothing reaches Doch1)', () => {
  const who = pn();
  test.each([
    ['/api/cpr', { personalNumber: who, days: 3, extra: 1 }],
    ['/api/cpr', { personalNumber: who, days: 3, issueDate: '2026-01-01' }], // the server picks the date
    ['/api/cpr', { personalNumber: who, days: 0 }],
    ['/api/cpr', { personalNumber: who, days: 31 }],
    ['/api/cpr', { personalNumber: who, days: 2.5 }],
    ['/api/cpr', { personalNumber: 'abc', days: 3 }],
    [
      '/api/people-digital',
      { personalNumber: who, startDate: '2026-09-27', endDate: '2026-09-30', extra: 1 },
    ],
    [
      '/api/people-digital',
      { personalNumber: who, startDate: '2026-09-30', endDate: '2026-09-27' },
    ],
    [
      '/api/people-digital',
      { personalNumber: who, startDate: '27/09/2026', endDate: '2026-09-30' },
    ],
  ])('%s %j → 400', async (url, payload) => {
    const fetchMock = await start(async () => json(200, {}));
    const res = await app!.inject({ method: 'POST', url, headers: AUTH, payload });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: ERROR_HTTP.VALIDATION_ERROR.messageHe },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('unknown query param, bad JSON and bodies over 10KB → 400', async () => {
    const fetchMock = await start(async () => json(200, {}));
    const extra = await app!.inject({ url: '/api/soldiers?q=a&admin=1', headers: AUTH });
    expect(extra.statusCode).toBe(400);
    const bad = await app!.inject({
      method: 'POST',
      url: '/api/cpr',
      headers: { ...AUTH, 'content-type': 'application/json' },
      payload: '{nope',
    });
    expect(bad.statusCode).toBe(400);
    const big = await app!.inject({
      method: 'POST',
      url: '/api/cpr',
      headers: AUTH,
      payload: { personalNumber: pn(), days: 1, pad: 'x'.repeat(11 * 1024) },
    });
    expect(big.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('config', () => {
  test('/api/config gives the Jerusalem today and the window', async () => {
    await start(async () => json(200, {}));
    const res = await app!.inject({ url: '/api/config', headers: AUTH });
    expect(res.json()).toEqual({
      today: '2026-09-23',
      maxDate: '2026-10-23',
      cprMaxDays: 30,
      windowDays: 30,
      searchMax: 50,
    });
  });

  test('fails fast, naming the missing variables but never printing values', () => {
    const short = randomBytes(8).toString('hex');
    expect(() => loadConfig({ CPR_API_KEY: short, MOCK_USER: 'demo' })).toThrow(
      /DOCH1_API_URL, CPR_API_KEY, PEOPLE_DIGITAL_API_KEY, MOCK_PASSWORD/,
    );
    try {
      loadConfig({ CPR_API_KEY: short });
    } catch (err) {
      expect((err as Error).message).not.toContain(short);
    }
  });
});
