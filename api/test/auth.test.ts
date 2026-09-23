import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createHmac, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { meResponseSchema } from '@doch1/shared';
import { buildServer } from '../src/server';
import authRoutes from '../src/modules/auth/routes';
import { resetJwksCache } from '../src/modules/auth/jwt';

const SUPABASE_URL = 'https://test-project.supabase.co';
const SECRET = 'test-secret-at-least-32-characters-long!!';
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_JWT_SECRET = SECRET;

const now = () => Math.floor(Date.now() / 1000);
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

function claims(over: Record<string, unknown> = {}) {
  return {
    sub: '11111111-2222-3333-4444-555555555555',
    email: 'soldier01@example.com',
    aud: 'authenticated',
    iss: `${SUPABASE_URL}/auth/v1`,
    role: 'authenticated',
    iat: now(),
    exp: now() + 3600,
    app_metadata: { provider: 'google', providers: ['google'] },
    ...over,
  };
}

function hs256(payload: object, secret = SECRET, header: object = { alg: 'HS256', typ: 'JWT' }) {
  const input = `${b64(header)}.${b64(payload)}`;
  return `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
}

function asym(payload: object, alg: 'ES256' | 'RS256', key: KeyObject, kid: string) {
  const input = `${b64({ alg, typ: 'JWT', kid })}.${b64(payload)}`;
  const sig = sign(
    'sha256',
    Buffer.from(input),
    alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key,
  );
  return `${input}.${sig.toString('base64url')}`;
}

const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWKS = {
  keys: [
    { ...ec.publicKey.export({ format: 'jwk' }), kid: 'ec-1', alg: 'ES256', use: 'sig' },
    { ...rsa.publicKey.export({ format: 'jwk' }), kid: 'rsa-1', alg: 'RS256', use: 'sig' },
  ],
};
const fetchMock = vi.fn(async () => new Response(JSON.stringify(JWKS), { status: 200 }));
vi.stubGlobal('fetch', fetchMock);

// Echoes the identity the auth hook set — lets the rejection tests run without a DB.
const whoami: FastifyPluginAsync = async (api) => {
  api.get('/whoami', async (req) => ({ user: req.user }));
};

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildServer({ modules: [whoami, authRoutes] });
});
afterAll(() => app.close());
beforeEach(() => {
  resetJwksCache();
  fetchMock.mockClear();
});

const call = (url: string, token?: string, raw?: string) =>
  app.inject({
    url: `/api/v1${url}`,
    headers: raw ? { authorization: raw } : token ? { authorization: `Bearer ${token}` } : {},
  });

async function expect401(res: Awaited<ReturnType<typeof call>>) {
  expect(res.statusCode).toBe(401);
  expect(res.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: expect.any(String) } });
}

describe('B1 auth — token rejection (401)', () => {
  test('no Authorization header', async () => expect401(await call('/me')));
  test('non-Bearer scheme', async () =>
    expect401(await call('/me', undefined, `Basic ${hs256(claims())}`)));
  test('garbage token', async () => expect401(await call('/me', 'not.a.jwt!')));
  test('two-part token', async () => expect401(await call('/me', 'abc.def')));
  test('oversized token', async () => expect401(await call('/me', `${'a'.repeat(9000)}.b.c`)));

  test('alg=none', async () => {
    const t = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims())}.`;
    await expect401(await call('/me', t));
    await expect401(await call('/me', `${t}x`));
  });
  test('alg=HS512 (not on the allowlist)', async () =>
    expect401(await call('/me', hs256(claims(), SECRET, { alg: 'HS512', typ: 'JWT' }))));
  test('wrong HS256 secret', async () =>
    expect401(await call('/me', hs256(claims(), 'another-secret-another-secret-123'))));
  test('tampered payload', async () => {
    const [h, , s] = hs256(claims()).split('.');
    await expect401(
      await call('/me', `${h}.${b64(claims({ email: 'cmd.battalion@example.com' }))}.${s}`),
    );
  });
  test('expired', async () => expect401(await call('/me', hs256(claims({ exp: now() - 60 })))));
  test('missing exp', async () => expect401(await call('/me', hs256(claims({ exp: undefined })))));
  test('not yet valid (nbf)', async () =>
    expect401(await call('/me', hs256(claims({ nbf: now() + 600 })))));
  test('wrong audience', async () => expect401(await call('/me', hs256(claims({ aud: 'anon' })))));
  test('wrong issuer', async () =>
    expect401(await call('/me', hs256(claims({ iss: 'https://evil.supabase.co/auth/v1' })))));
  test('no email claim', async () =>
    expect401(await call('/me', hs256(claims({ email: undefined })))));
  test('non-Google provider (e.g. email/password sign-up)', async () =>
    expect401(
      await call(
        '/me',
        hs256(claims({ app_metadata: { provider: 'email', providers: ['email'] } })),
      ),
    ));

  test('HS256 is refused when no JWT secret is configured', async () => {
    delete process.env.SUPABASE_JWT_SECRET;
    try {
      await expect401(await call('/me', hs256(claims())));
    } finally {
      process.env.SUPABASE_JWT_SECRET = SECRET;
    }
  });

  test('no SUPABASE_URL → everything is denied', async () => {
    delete process.env.SUPABASE_URL;
    try {
      await expect401(await call('/me', hs256(claims())));
    } finally {
      process.env.SUPABASE_URL = SUPABASE_URL;
    }
  });

  test('ES256 with unknown kid', async () =>
    expect401(await call('/me', asym(claims(), 'ES256', ec.privateKey, 'nope'))));
  test('ES256 signed by a key that is not in the JWKS', async () => {
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    await expect401(await call('/me', asym(claims(), 'ES256', other.privateKey, 'ec-1')));
  });
  test('alg/key mismatch: RS256 header pointing at the EC key', async () =>
    expect401(await call('/me', asym(claims(), 'RS256', rsa.privateKey, 'ec-1'))));
  test('HS256 signed with the public key (alg confusion)', async () => {
    const pem = rsa.publicKey.export({ format: 'pem', type: 'spki' }).toString();
    await expect401(
      await call('/me', hs256(claims(), pem, { alg: 'HS256', typ: 'JWT', kid: 'rsa-1' })),
    );
  });
  test('JWKS is fetched from the configured project only', async () => {
    await call('/me', asym(claims(), 'ES256', ec.privateKey, 'nope'));
    expect(fetchMock).toHaveBeenCalledWith(
      `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
      expect.anything(),
    );
  });
});

// Needs the seeded DB (db/init.sql) — runs in CI and locally with DATABASE_URL set.
describe.skipIf(!process.env.DATABASE_URL)('B1 auth — user mapping and /me', () => {
  const INACTIVE_EMAIL = 'b1.inactive@example.com';
  beforeAll(async () => {
    const { sqlClient } = await import('../src/db/client');
    await sqlClient`delete from users where email = ${INACTIVE_EMAIL}`;
    await sqlClient`insert into users (personal_number, first_name, last_name, email, is_active)
      values ('9999901', 'בדיקה', 'לא-פעיל', ${INACTIVE_EMAIL}, false)`;
  });
  afterAll(async () => {
    const { sqlClient } = await import('../src/db/client');
    await sqlClient`delete from users where email = ${INACTIVE_EMAIL}`;
  });

  const me = async (token: string) => {
    const res = await call('/me', token);
    expect(res.statusCode).toBe(200);
    return meResponseSchema.parse(res.json());
  };

  test('HS256 token → request.user from the users table (id + role only)', async () => {
    const res = await call('/whoami', hs256(claims()));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      user: { id: '00000000-0000-0000-0000-000000000011', role: 'soldier' },
    });
  });

  test('identity comes from the email, never from sub', async () => {
    const res = await call(
      '/whoami',
      hs256(claims({ sub: '00000000-0000-0000-0000-000000000001' })),
    );
    expect(res.json().user.id).toBe('00000000-0000-0000-0000-000000000011');
  });

  test('ES256 and RS256 tokens from the JWKS are accepted', async () => {
    for (const [alg, key, kid] of [
      ['ES256', ec.privateKey, 'ec-1'],
      ['RS256', rsa.privateKey, 'rsa-1'],
    ] as const) {
      const res = await call('/whoami', asym(claims(), alg, key, kid));
      expect(res.statusCode).toBe(200);
      expect(res.json().user.id).toBe('00000000-0000-0000-0000-000000000011');
    }
    expect(fetchMock).toHaveBeenCalledTimes(1); // cached
  });

  test('email is normalized (trim + lowercase)', async () => {
    const res = await call('/whoami', hs256(claims({ email: '  Soldier01@Example.COM ' })));
    expect(res.json().user.id).toBe('00000000-0000-0000-0000-000000000011');
  });

  test('unknown email → 403 NOT_REGISTERED', async () => {
    const res = await call('/me', hs256(claims({ email: 'stranger@example.com' })));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_REGISTERED');
  });

  test('inactive user → 403 INACTIVE_USER', async () => {
    const res = await call('/me', hs256(claims({ email: INACTIVE_EMAIL })));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('INACTIVE_USER');
  });

  test('/me — plain soldier', async () => {
    expect(await me(hs256(claims()))).toEqual({
      user: {
        id: '00000000-0000-0000-0000-000000000011',
        firstName: 'אורי',
        lastName: 'הדר',
        role: 'soldier',
      },
      isCommander: false,
      group: { id: '00000000-0000-0000-0000-00000000a003', name: 'צוות 258750' },
    });
  });

  test('/me — team commander', async () => {
    const body = await me(hs256(claims({ email: 'cmd.team1@example.com' })));
    expect(body.user.id).toBe('00000000-0000-0000-0000-000000000003');
    expect(body.isCommander).toBe(true);
    expect(body.group?.id).toBe('00000000-0000-0000-0000-00000000a003');
  });

  test('/me — HR has role admin, no group, not a commander', async () => {
    const body = await me(hs256(claims({ email: 'hr.battalion@example.com' })));
    expect(body.user.role).toBe('admin');
    expect(body.isCommander).toBe(false);
    expect(body.group).toBeNull();
  });

  test('/me ignores identity hints in the query string', async () => {
    const res = await call('/me?userId=00000000-0000-0000-0000-000000000001', hs256(claims()));
    expect(res.json().user.id).toBe('00000000-0000-0000-0000-000000000011');
  });
});
