import { createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Fastify, { LogController, type FastifyReply } from 'fastify';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import type { z } from 'zod';
import {
  CPR_MAX_DAYS,
  ERROR_HTTP,
  INTEGRATION_KEY_HEADER,
  INTEGRATION_WINDOW_DAYS,
  SEARCH_MAX,
  annualLeaveBodySchema,
  cprSickLeaveBodySchema,
  errorResponseSchema,
  integrationResultSchema,
  integrationSoldiersQuerySchema,
  integrationSoldiersResponseSchema,
} from '@doch1/shared';
import { loadConfig, type Config } from './config';
import { addDays, todayInTz } from './dates';

// Fake CPR / אנשים בדיגיטל website (SPEC F11/F12). The browser only ever calls this server; the
// server adds the system's X-Integration-Key and relays to Doch1, so keys never reach the browser
// and Doch1's CORS stays closed to integrations (SECURITY.md §15).

const isProd = process.env.NODE_ENV === 'production';
export const UPSTREAM_TIMEOUT_MS = 15_000; // Doch1 on Render's free plan can take ~1 min to wake up
const UPSTREAM_UNAVAILABLE = {
  error: { code: 'UPSTREAM_UNAVAILABLE', message: 'מערכת דוח 1 לא זמינה, נסו שוב בעוד דקה' },
} as const;

// The browser never sends issueDate: this server stamps it with today in Asia/Jerusalem.
const cprBodySchema = cprSickLeaveBodySchema.omit({ issueDate: true });

// Defence in depth — the request log below never includes headers or bodies in the first place.
const REDACT = [
  'req.headers.authorization',
  `req.headers["${INTEGRATION_KEY_HEADER}"]`,
  '*.personalNumber',
  '*.body',
];

type LocalErrorCode = 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'INTERNAL';
const fail = (reply: FastifyReply, code: LocalErrorCode) =>
  reply
    .code(ERROR_HTTP[code].status)
    .send({ error: { code, message: ERROR_HTTP[code].messageHe } });

// Hashing first gives equal-length buffers, so timingSafeEqual never throws and the comparison
// time doesn't depend on how much of the value matched.
const digest = (v: string) => createHash('sha256').update(v).digest();

function basicAuthOk(header: string | undefined, user: Buffer, pass: Buffer): boolean {
  const match = /^Basic ([A-Za-z0-9+/=]+)$/i.exec(header ?? '');
  const decoded = match?.[1] ? Buffer.from(match[1], 'base64').toString('utf8') : '';
  const sep = decoded.indexOf(':');
  // Both halves are always compared, so timing doesn't tell which one was wrong.
  const userOk = timingSafeEqual(digest(sep >= 0 ? decoded.slice(0, sep) : ''), user);
  const passOk = timingSafeEqual(digest(sep >= 0 ? decoded.slice(sep + 1) : ''), pass);
  return sep >= 0 && userOk && passOk;
}

export type Deps = { fetch?: typeof fetch; timeoutMs?: number; now?: () => Date };

export async function buildServer(config: Config, deps: Deps = {}) {
  const timeoutMs = deps.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const now = deps.now ?? (() => new Date());
  const userDigest = digest(config.MOCK_USER);
  const passDigest = digest(config.MOCK_PASSWORD);

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? (process.env.VITEST ? 'silent' : 'info'),
      redact: { paths: REDACT, censor: '[redacted]' },
    },
    logController: new LogController({ disableRequestLogging: true }), // replaced by the one-line log below
    bodyLimit: 10 * 1024,
    trustProxy: isProd, // behind Render's proxy
  });

  // Log only method, path, status and duration — no headers, no query (search terms), no bodies.
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        path: request.url.split('?')[0],
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
      },
      'request',
    );
  });

  app.setErrorHandler((err: { statusCode?: number; name?: string }, request, reply) => {
    // Fastify's own 4xx: bad JSON, body over 10KB, wrong content type.
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500)
      return fail(reply, 'VALIDATION_ERROR');
    request.log.error({ err: err.name }, 'unhandled error');
    return fail(reply, 'INTERNAL');
  });
  app.setNotFoundHandler((_request, reply) => fail(reply, 'NOT_FOUND'));

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: isProd ? [] : null, // local dev runs on plain http://localhost
      },
    },
    strictTransportSecurity: isProd ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'no-referrer' },
  });

  // The only open route: Render's health check. Everything else, the UI included, is behind Basic Auth.
  app.get('/healthz', async () => ({ ok: true }));
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/healthz') return;
    if (basicAuthOk(request.headers.authorization, userDigest, passDigest)) return;
    request.log.warn({ path: request.url.split('?')[0] }, 'basic auth failed');
    reply.header('WWW-Authenticate', 'Basic realm="doch1-integrations", charset="UTF-8"');
    return fail(reply, 'UNAUTHORIZED');
  });
  app.addHook('onSend', async (request, reply) => {
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });

  await app.register(fastifyStatic, {
    root: fileURLToPath(new URL('../public/', import.meta.url)),
    prefix: '/',
  });

  // ---------- relay to Doch1 ----------

  type Upstream = { status: number; body: unknown } | null;

  async function callDoch1(path: string, key: string, body?: object): Promise<Upstream> {
    const doFetch = deps.fetch ?? globalThis.fetch;
    try {
      const res = await doFetch(`${config.DOCH1_API_URL}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          accept: 'application/json',
          [INTEGRATION_KEY_HEADER]: key,
          ...(body && { 'content-type': 'application/json' }),
        },
        body: body && JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { status: res.status, body: (await res.json()) as unknown };
    } catch (err) {
      // Timeout, network error, or a non-JSON page (e.g. Render's while the API wakes up).
      app.log.warn({ err: (err as Error).name }, 'doch1 unavailable');
      return null;
    }
  }

  // Pass Doch1's status and body through unchanged — but only if they match the contract.
  function relay(reply: FastifyReply, upstream: Upstream, okSchema: z.ZodType) {
    if (!upstream) return reply.code(502).send(UPSTREAM_UNAVAILABLE);
    const ok = upstream.status >= 200 && upstream.status < 300;
    if (!(ok ? okSchema : errorResponseSchema).safeParse(upstream.body).success) {
      app.log.warn({ status: upstream.status }, 'doch1 response off-contract');
      return reply.code(502).send(UPSTREAM_UNAVAILABLE);
    }
    return reply.code(upstream.status).send(upstream.body);
  }

  // What the UI needs to build its date pickers; "today" is the server's Jerusalem date.
  app.get('/api/config', async () => {
    const today = todayInTz(now());
    return {
      today,
      maxDate: addDays(today, INTEGRATION_WINDOW_DAYS),
      cprMaxDays: CPR_MAX_DAYS,
      windowDays: INTEGRATION_WINDOW_DAYS,
      searchMax: SEARCH_MAX,
    };
  });

  // The directory accepts either key; the picker uses CPR's.
  app.get('/api/soldiers', async (request, reply) => {
    const query = integrationSoldiersQuerySchema.safeParse(request.query);
    if (!query.success) return fail(reply, 'VALIDATION_ERROR');
    const params = new URLSearchParams({ limit: String(query.data.limit) });
    if (query.data.q) params.set('q', query.data.q);
    const upstream = await callDoch1(`/integrations/soldiers?${params}`, config.CPR_API_KEY);
    return relay(reply, upstream, integrationSoldiersResponseSchema);
  });

  app.post('/api/cpr', async (request, reply) => {
    const body = cprBodySchema.safeParse(request.body);
    if (!body.success) return fail(reply, 'VALIDATION_ERROR');
    const upstream = await callDoch1('/integrations/cpr/sick-leave', config.CPR_API_KEY, {
      ...body.data,
      issueDate: todayInTz(now()),
    });
    return relay(reply, upstream, integrationResultSchema);
  });

  app.post('/api/people-digital', async (request, reply) => {
    const body = annualLeaveBodySchema.safeParse(request.body);
    if (!body.success) return fail(reply, 'VALIDATION_ERROR');
    const upstream = await callDoch1(
      '/integrations/people-digital/annual-leave',
      config.PEOPLE_DIGITAL_API_KEY,
      body.data,
    );
    return relay(reply, upstream, integrationResultSchema);
  });

  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: the host (Render) provides the environment.
  }
  const config = loadConfig();
  const app = await buildServer(config);
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}
