import { createHmac, createPublicKey, timingSafeEqual, verify, type KeyObject } from 'node:crypto';

// Supabase access-token verification (SECURITY.md §3): signature, exp, aud, iss.
// Built on node:crypto so no JWT dependency is added (SECURITY.md §11).
// - HS256 is accepted only with SUPABASE_JWT_SECRET (legacy Supabase projects).
// - ES256 / RS256 are accepted only with a key from the project's JWKS, matched by `kid`.
// The token's `alg` never chooses a key on its own, so alg=none and alg-confusion tokens fail.

export type SupabaseClaims = {
  sub: string;
  email: string;
  exp: number;
  app_metadata?: { provider?: string; providers?: string[] };
};

export class InvalidTokenError extends Error {}

const TOKEN_MAX_LENGTH = 8192;
const CLOCK_SKEW_SEC = 10;
const AUDIENCE = 'authenticated';
const JWKS_TTL_MS = 10 * 60_000;
const JWKS_REFETCH_MIN_MS = 30_000;

type Jwk = { kid?: string; kty?: string; alg?: string; crv?: string; [k: string]: unknown };
type Header = { alg?: unknown; kid?: unknown; typ?: unknown };

const ASYMMETRIC = {
  ES256: { kty: 'EC', crv: 'P-256', dsaEncoding: 'ieee-p1363' },
  RS256: { kty: 'RSA', crv: undefined, dsaEncoding: undefined },
} as const;

function decodeJson<T>(part: string): T {
  try {
    const v: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error();
    return v as T;
  } catch {
    throw new InvalidTokenError('malformed token');
  }
}

// ---- JWKS cache (the URL comes from server config, never from the request) ----
let jwks: { keys: Jwk[]; fetchedAt: number; url: string } | null = null;

export function resetJwksCache() {
  jwks = null;
}

async function loadJwks(url: string, force: boolean): Promise<Jwk[]> {
  const age = jwks && jwks.url === url ? Date.now() - jwks.fetchedAt : Infinity;
  if (age < JWKS_TTL_MS && !(force && age >= JWKS_REFETCH_MIN_MS)) return jwks!.keys;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys?: unknown };
  const keys = Array.isArray(body.keys) ? (body.keys as Jwk[]) : [];
  jwks = { keys, fetchedAt: Date.now(), url };
  return keys;
}

async function publicKeyFor(
  supabaseUrl: string,
  kid: string,
  alg: keyof typeof ASYMMETRIC,
): Promise<KeyObject> {
  const url = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
  const want = ASYMMETRIC[alg];
  const match = (keys: Jwk[]) =>
    keys.find(
      (k) =>
        k.kid === kid &&
        k.kty === want.kty &&
        (k.alg === undefined || k.alg === alg) &&
        (want.crv === undefined || k.crv === want.crv),
    );
  const jwk = match(await loadJwks(url, false)) ?? match(await loadJwks(url, true));
  if (!jwk) throw new InvalidTokenError('unknown signing key');
  try {
    // Only public members are passed on; a JWKS never carries private parts.
    const { kty, crv, x, y, n, e } = jwk;
    return createPublicKey({ key: { kty, crv, x, y, n, e } as never, format: 'jwk' });
  } catch {
    throw new InvalidTokenError('bad signing key');
  }
}

export async function verifySupabaseJwt(token: string): Promise<SupabaseClaims> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  const secret = process.env.SUPABASE_JWT_SECRET?.trim();
  // Without SUPABASE_URL there is no issuer to check against — deny everything.
  if (!supabaseUrl) throw new InvalidTokenError('auth not configured');

  if (token.length > TOKEN_MAX_LENGTH || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token))
    throw new InvalidTokenError('malformed token');
  const [h, p, s] = token.split('.') as [string, string, string];
  const header = decodeJson<Header>(h);
  const signingInput = Buffer.from(`${h}.${p}`);
  const signature = Buffer.from(s, 'base64url');

  let valid: boolean;
  if (header.alg === 'HS256') {
    if (!secret) throw new InvalidTokenError('HS256 not enabled');
    const expected = createHmac('sha256', secret).update(signingInput).digest();
    valid = expected.length === signature.length && timingSafeEqual(expected, signature);
  } else if (header.alg === 'ES256' || header.alg === 'RS256') {
    if (typeof header.kid !== 'string' || !header.kid) throw new InvalidTokenError('missing kid');
    const key = await publicKeyFor(supabaseUrl, header.kid, header.alg);
    const { dsaEncoding } = ASYMMETRIC[header.alg];
    valid = verify('sha256', signingInput, dsaEncoding ? { key, dsaEncoding } : key, signature);
  } else {
    throw new InvalidTokenError('alg not allowed');
  }
  if (!valid) throw new InvalidTokenError('bad signature');

  const c = decodeJson<Record<string, unknown>>(p);
  const now = Math.floor(Date.now() / 1000);
  if (typeof c.exp !== 'number' || c.exp + CLOCK_SKEW_SEC <= now)
    throw new InvalidTokenError('expired');
  if (typeof c.nbf === 'number' && c.nbf - CLOCK_SKEW_SEC > now)
    throw new InvalidTokenError('not yet valid');
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(AUDIENCE)) throw new InvalidTokenError('bad audience');
  if (c.iss !== `${supabaseUrl}/auth/v1`) throw new InvalidTokenError('bad issuer');
  if (typeof c.sub !== 'string' || typeof c.email !== 'string' || !c.email)
    throw new InvalidTokenError('missing identity');
  return c as SupabaseClaims;
}
