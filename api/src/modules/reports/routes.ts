import type { FastifyPluginAsync } from 'fastify';
import { putReportBodySchema, reportDateParamsSchema, reportsQuerySchema } from '@doch1/shared';
import { validate } from '../../plugins/errors';
import { deleteOwnReport, getToday, listReports, putOwnReport } from './service';

// Self routes: identity is request.user only, never an id from the request (SECURITY.md §4).
const routes: FastifyPluginAsync = async (api) => {
  // GET /reports/today — today's report or null, plus server-side deadline info (F2).
  api.get('/reports/today', async (request) => getToday(request.user!.id));

  // GET /reports?from=&to= — own history, range < 62 days (F5).
  api.get('/reports', async (request) => {
    const { from, to } = validate(reportsQuerySchema, request.query);
    return { reports: await listReports(request.user!.id, from, to) };
  });

  // PUT /reports/:date — create/update own report, today … today+7 (F2–F4).
  api.put('/reports/:date', async (request) => {
    const { date } = validate(reportDateParamsSchema, request.params);
    const body = validate(putReportBodySchema, request.body);
    return putOwnReport(request.user!.id, date, body);
  });

  // DELETE /reports/:date — own future report only (F4).
  api.delete('/reports/:date', async (request, reply) => {
    const { date } = validate(reportDateParamsSchema, request.params);
    await deleteOwnReport(request.user!.id, date);
    return reply.status(204).send();
  });
};

export default routes;
