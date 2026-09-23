import type { FastifyPluginAsync } from 'fastify';
import { pushTokenBodySchema } from '@doch1/shared';
import { validate } from '../../plugins/errors';
import { currentUser } from '../commander/access';
import { registerPushToken } from './service';

const routes: FastifyPluginAsync = async (api) => {
  // POST /push-tokens — the device registers itself for the logged-in user.
  api.post('/push-tokens', async (request, reply) => {
    const actor = currentUser(request);
    const { token, platform } = validate(pushTokenBodySchema, request.body);
    await registerPushToken(actor.id, token, platform);
    return reply.status(204).send();
  });
};

export default routes;
