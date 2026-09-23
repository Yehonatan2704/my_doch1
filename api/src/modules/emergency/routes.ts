import type { FastifyPluginAsync } from 'fastify';
import {
  idParamsSchema,
  respondEmergencyBodySchema,
  startEmergencyBodySchema,
  type ActiveEmergenciesResponse,
  type EmergencyDetailResponse,
  type StartEmergencyResponse,
} from '@doch1/shared';
import { validate } from '../../plugins/errors';
import { currentUser } from '../commander/access';
import {
  activeEmergencies,
  emergencyDetail,
  endEmergency,
  respondToEmergency,
  startEmergency,
} from './service';

const routes: FastifyPluginAsync = async (api) => {
  // POST /commander/emergencies — start a roll-call ("ירוק בעיניים").
  api.post(
    '/commander/emergencies',
    // SECURITY.md §8: emergency start is rate-limited harder than the rest.
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    // 200, not 201: the A0.4 mock answers 200 and Lane E builds against it.
    async (request): Promise<StartEmergencyResponse> => {
      const actor = currentUser(request);
      const body = validate(startEmergencyBodySchema, request.body);
      return { id: await startEmergency(actor, body) };
    },
  );

  // GET /commander/emergencies/:id — the live view, polled every 5s by the client.
  api.get('/commander/emergencies/:id', async (request): Promise<EmergencyDetailResponse> => {
    const actor = currentUser(request);
    const { id } = validate(idParamsSchema, request.params);
    return emergencyDetail(actor, id);
  });

  // POST /commander/emergencies/:id/end — the toggle off; soldiers' banners disappear.
  api.post('/commander/emergencies/:id/end', async (request, reply) => {
    const actor = currentUser(request);
    const { id } = validate(idParamsSchema, request.params);
    await endEmergency(actor, id);
    return reply.status(204).send();
  });

  // GET /emergencies/active — what the soldier's banner is driven by.
  api.get('/emergencies/active', async (request): Promise<ActiveEmergenciesResponse> => {
    const actor = currentUser(request);
    return activeEmergencies(actor.id);
  });

  // POST /emergencies/:id/respond — "אני בסדר" / "צריך/ה עזרה", changeable while open.
  api.post('/emergencies/:id/respond', async (request, reply) => {
    const actor = currentUser(request);
    const { id } = validate(idParamsSchema, request.params);
    const { status } = validate(respondEmergencyBodySchema, request.body);
    await respondToEmergency(actor.id, id, status);
    return reply.status(204).send();
  });
};

export default routes;
