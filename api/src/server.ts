import './plugins/env';
import './plugins/types';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyPluginAsync } from 'fastify';
import { sqlClient } from './db/client';
import { authenticate } from './modules/auth/authenticate';
import { registerErrorHandling } from './plugins/errors';
import { registerSecurity } from './plugins/security';

const isProd = process.env.NODE_ENV === 'production';

// SECURITY.md §9: never log tokens, emails, notes, personal numbers.
const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-integration-key"]', // I1: external-system secrets
  '*.authorization',
  '*.token',
  '*.accessToken',
  '*.email',
  '*.note',
  '*.personalNumber',
  '*.personal_number',
  '*.calypsoSerial', // NFC: raw card serials are never logged or stored
  '*.readerToken',
];

// Every src/modules/<feature>/routes.ts default-exports a Fastify plugin. Lanes add a folder;
// nobody edits this file to register a module.
async function discoverModules(): Promise<FastifyPluginAsync[]> {
  const dir = new URL('./modules/', import.meta.url);
  const files = (await readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => new URL(`${e.name}/routes.ts`, dir))
    .filter((f) => existsSync(f));
  return Promise.all(files.map(async (f) => (await import(f.href)).default));
}

export async function buildServer(opts: { modules?: FastifyPluginAsync[] } = {}) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? (process.env.VITEST ? 'silent' : isProd ? 'info' : 'debug'),
      redact: { paths: REDACT, censor: '[redacted]' },
    },
    bodyLimit: 100 * 1024,
    trustProxy: isProd, // behind Render's proxy: real client IP for rate limiting
  });

  registerErrorHandling(app);
  await registerSecurity(
    app,
    (process.env.CORS_ORIGINS ?? 'http://localhost:8081')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const modules = opts.modules ?? (await discoverModules());
  await app.register(
    async (api) => {
      // Deny by default: a route is public only if it says `config: { public: true }`.
      api.addHook('onRequest', async (request) => {
        if (!request.routeOptions.config.public) await authenticate(request);
      });
      api.get('/health', { config: { public: true } }, async () => ({ ok: true }));
      for (const m of modules) await api.register(m);
    },
    { prefix: '/api/v1' },
  );

  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (isProd) {
    for (const k of ['DATABASE_URL', 'CORS_ORIGINS', 'SUPABASE_URL'])
      if (!process.env[k]) throw new Error(`Missing required env var ${k}`);
    // NFC card fingerprints are HMACs keyed by this secret (modules/nfc/crypto.ts).
    if (Buffer.byteLength(process.env.NFC_CARD_HMAC_SECRET ?? '') < 32)
      throw new Error('NFC_CARD_HMAC_SECRET must be at least 32 bytes');
  }
  const app = await buildServer();
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
  // The DB pool is process-wide, so it closes on process shutdown, not on app.close().
  for (const signal of ['SIGTERM', 'SIGINT'] as const)
    process.once(signal, async () => {
      await app.close();
      await sqlClient.end();
      process.exit(0);
    });
}
