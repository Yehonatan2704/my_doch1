import type { FastifyError, FastifyInstance } from 'fastify';
import { ERROR_HTTP, type ErrorCode } from '@doch1/shared';

export class ApiError extends Error {
  readonly statusCode: number;
  constructor(readonly code: ErrorCode) {
    super(code);
    this.statusCode = ERROR_HTTP[code].status;
  }
}

// Validate params/query/body with a shared Zod schema; throws a 400 on failure.
export function validate<T>(
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
  input: unknown,
): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new ApiError('VALIDATION_ERROR');
  return r.data as T;
}

const codeForStatus = (status: number): ErrorCode =>
  status === 401 ? 'UNAUTHORIZED'
  : status === 403 ? 'FORBIDDEN'
  : status === 404 ? 'NOT_FOUND'
  : status === 429 ? 'RATE_LIMITED'
  : 'VALIDATION_ERROR';

// Client only ever sees { error: { code, message } } with a safe Hebrew message (SECURITY.md §9).
export function registerErrorHandling(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | ApiError, request, reply) => {
    const status = err.statusCode ?? 500;
    const code: ErrorCode =
      err instanceof ApiError ? err.code : status >= 500 ? 'INTERNAL' : codeForStatus(status);

    if (status >= 500) request.log.error({ err }, 'unhandled error');
    else if (status === 401 || status === 403 || status === 429)
      request.log.warn({ code, url: request.url, userId: request.user?.id }, 'security event');

    reply.status(status >= 500 ? 500 : status).send({
      error: { code, message: ERROR_HTTP[code].messageHe },
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: ERROR_HTTP.NOT_FOUND.messageHe } });
  });
}
