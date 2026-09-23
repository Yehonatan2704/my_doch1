import type { FastifyPluginAsync } from 'fastify';
import { getMe } from './service';

const routes: FastifyPluginAsync = async (api) => {
  // GET /me — who am I, am I a commander, which group am I in (F1).
  api.get('/me', async (request) => getMe(request.user!.id));
};

export default routes;
