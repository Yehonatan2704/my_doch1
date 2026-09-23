import type { FastifyPluginAsync } from 'fastify';
import { getStatuses } from './service';

const routes: FastifyPluginAsync = async (api) => {
  // GET /statuses — categories + reasons; commander-only reasons hidden from plain soldiers.
  api.get('/statuses', async (request) => getStatuses(request.user!));
};

export default routes;
