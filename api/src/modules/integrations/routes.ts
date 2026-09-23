import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import {
  annualLeaveBodySchema,
  cprSickLeaveBodySchema,
  integrationSoldiersQuerySchema,
} from '@doch1/shared';
import { validate } from '../../plugins/errors';
import { requireIntegration } from './authenticate';
import { importAnnualLeave, importCprSickLeave, listSoldiers } from './service';

// Machine-to-machine: no Supabase user, so the routes are `public` and authenticated by the
// integration key in onRequest instead (SECURITY.md §15). Limited per system, not per IP.
const config = {
  public: true,
  rateLimit: {
    max: 30,
    timeWindow: '1 minute',
    keyGenerator: (req: FastifyRequest) => `integration:${req.integration ?? req.ip}`,
  },
};

const routes: FastifyPluginAsync = async (api) => {
  // GET /integrations/soldiers?q=&limit= — the soldier picker of the external systems.
  api.get(
    '/integrations/soldiers',
    { config, onRequest: requireIntegration('cpr', 'people_digital') },
    async (request) => {
      const { q, limit } = validate(integrationSoldiersQuerySchema, request.query);
      return { soldiers: await listSoldiers(q, limit) };
    },
  );

  // POST /integrations/cpr/sick-leave — N gimelim issued today → reports today+1 … today+N (F11).
  api.post(
    '/integrations/cpr/sick-leave',
    { config, onRequest: requireIntegration('cpr') },
    async (request) => importCprSickLeave(validate(cprSickLeaveBodySchema, request.body)),
  );

  // POST /integrations/people-digital/annual-leave — leave start … end, inclusive (F12).
  api.post(
    '/integrations/people-digital/annual-leave',
    { config, onRequest: requireIntegration('people_digital') },
    async (request) => importAnnualLeave(validate(annualLeaveBodySchema, request.body)),
  );
};

export default routes;
