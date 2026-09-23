// Set only by the auth hook (modules/auth/authenticate.ts). Never read identity from body/params.
export type AuthUser = { id: string; role: 'soldier' | 'admin' };

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
  interface FastifyContextConfig {
    /** Skip authentication for this route (default: every route requires a user). */
    public?: boolean;
  }
}
