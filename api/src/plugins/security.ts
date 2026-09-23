import type { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ApiError } from './errors';

// SECURITY.md §8. Per-route overrides (e.g. /documents 10/min, emergency start 5/min) go in the
// route's `config: { rateLimit: { max, timeWindow } }`.
export async function registerSecurity(app: FastifyInstance, corsOrigins: string[]) {
  await app.register(helmet);
  await app.register(cors, {
    origin: corsOrigins,
    methods: ['GET', 'PUT', 'POST', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
  });
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    hook: 'preHandler', // after auth, so the key can be the user id
    keyGenerator: (req) => req.user?.id ?? req.ip,
    errorResponseBuilder: () => new ApiError('RATE_LIMITED'),
  });
}
