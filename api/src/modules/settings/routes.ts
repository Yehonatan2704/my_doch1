import type { FastifyPluginAsync } from 'fastify';
import { putSettingsBodySchema, putWeekTemplateBodySchema } from '@doch1/shared';
import { validate } from '../../plugins/errors';
import { getSettings, getTemplate, putSettings, putTemplate } from './service';

const routes: FastifyPluginAsync = async (api) => {
  // GET /settings — reminder, nudge and notification toggles (F6).
  api.get('/settings', async (request) => getSettings(request.user!.id));

  // PUT /settings — partial update; send only the changed fields (SPEC §9 row 12).
  api.put('/settings', async (request) =>
    putSettings(request.user!.id, validate(putSettingsBodySchema, request.body)),
  );

  // GET /settings/template — my weekly default template (DESIGN §7.8); default week if never saved.
  api.get('/settings/template', async (request) => getTemplate(request.user!.id));

  // PUT /settings/template — full replace of all 7 days.
  api.put('/settings/template', async (request) =>
    putTemplate(request.user!.id, validate(putWeekTemplateBodySchema, request.body)),
  );
};

export default routes;
