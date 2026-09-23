import type { FastifyPluginAsync } from 'fastify';
import {
  commanderPutReportBodySchema,
  documentIdParamsSchema,
  groupIdParamsSchema,
  groupReportsQuerySchema,
  reportIdParamsSchema,
  reportIdsBodySchema,
  soldierIdParamsSchema,
  soldierReportParamsSchema,
  type ApproveReportsResponse,
  type CommanderGroupsResponse,
  type DocumentUrlResponse,
  type FinalizeReportsResponse,
  type GroupReportsResponse,
  type Report,
} from '@doch1/shared';
import { validate } from '../../plugins/errors';
import { assertCanActOn, currentUser } from './access';
import {
  approveReports,
  finalizeReports,
  loadDocument,
  putSoldierReportAndNotify,
  setFavorite,
  unfinalizeReport,
} from './actions';
import { getGroupReports, getReportById, listMyGroups } from './service';
import { signDocumentUrl } from './storage';

const routes: FastifyPluginAsync = async (api) => {
  // GET /commander/groups — my command subtree, or (HR) my assigned units and everything below.
  api.get('/commander/groups', async (request): Promise<CommanderGroupsResponse> => {
    const actor = currentUser(request);
    return { groups: await listMyGroups(actor.id) };
  });

  // GET /commander/groups/:groupId/reports — the F8 screen.
  api.get(
    '/commander/groups/:groupId/reports',
    async (request): Promise<GroupReportsResponse> => {
      const actor = currentUser(request);
      const { groupId } = validate(groupIdParamsSchema, request.params);
      const query = validate(groupReportsQuerySchema, request.query);
      await assertCanActOn(actor.id, { groupId });
      return getGroupReports(actor.id, groupId, query);
    },
  );

  // POST /commander/reports/approve — stage-1 approval, single or bulk (F9).
  api.post('/commander/reports/approve', async (request): Promise<ApproveReportsResponse> => {
    const actor = currentUser(request);
    const { reportIds } = validate(reportIdsBodySchema, request.body);
    return { approvedCount: await approveReports(actor, reportIds) };
  });

  // PUT /commander/soldiers/:userId/reports/:date — edit a report, or report for someone
  // who didn't (F9). Commander-only reasons are allowed here.
  api.put('/commander/soldiers/:userId/reports/:date', async (request): Promise<Report> => {
    const actor = currentUser(request);
    const { userId, date } = validate(soldierReportParamsSchema, request.params);
    const body = validate(commanderPutReportBodySchema, request.body);
    return getReportById(await putSoldierReportAndNotify(actor, userId, date, body));
  });

  // GET /commander/documents/:documentId/url — short-lived signed URL for a sick note.
  api.get(
    '/commander/documents/:documentId/url',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request): Promise<DocumentUrlResponse> => {
      const actor = currentUser(request);
      const { documentId } = validate(documentIdParamsSchema, request.params);
      const doc = await loadDocument(documentId);
      await assertCanActOn(actor.id, { soldierId: doc.ownerId });
      return signDocumentUrl(doc.storagePath);
    },
  );

  // ---- HR only (F9b). No UI in the MVP; verified by tests. ----

  // POST /hr/reports/finalize — stage 2, the last word on a day.
  api.post('/hr/reports/finalize', async (request): Promise<FinalizeReportsResponse> => {
    const actor = currentUser(request);
    const { reportIds } = validate(reportIdsBodySchema, request.body);
    return { finalizedCount: await finalizeReports(actor, reportIds) };
  });

  // DELETE /hr/reports/:reportId/finalize — re-open a day.
  api.delete('/hr/reports/:reportId/finalize', async (request, reply) => {
    const actor = currentUser(request);
    const { reportId } = validate(reportIdParamsSchema, request.params);
    await unfinalizeReport(actor, reportId);
    return reply.status(204).send();
  });

  // PUT · DELETE /commander/favorites/:soldierId — the star that pins a soldier to the top.
  for (const method of ['PUT', 'DELETE'] as const) {
    api.route({
      method,
      url: '/commander/favorites/:soldierId',
      handler: async (request, reply) => {
        const actor = currentUser(request);
        const { soldierId } = validate(soldierIdParamsSchema, request.params);
        await setFavorite(actor, soldierId, method === 'PUT');
        return reply.status(204).send();
      },
    });
  }
};

export default routes;
