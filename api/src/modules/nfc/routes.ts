import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import {
  createNfcReaderBodySchema,
  createNfcReaderResponseSchema,
  enrollNfcCardBodySchema,
  nfcCardEnrollmentResponseSchema,
  revokeNfcCardBodySchema,
  speedgateScanBodySchema,
  speedgateScanResponseSchema,
} from '@doch1/shared';
import { validate } from '../../plugins/errors';
import { currentUser } from '../commander/access';
import { requireReader } from './reader-auth';
import { createReader, enrollCard, revokeCard, scan } from './service';

const routes: FastifyPluginAsync = async (api) => {
  // ---- HR (logged-in admin, HR-scoped) ----

  // POST /nfc/readers — provision a gate reader for a base; the token is returned once.
  api.post('/nfc/readers', async (request, reply) => {
    const body = validate(createNfcReaderBodySchema, request.body);
    const res = await createReader(currentUser(request), body);
    request.log.info({ readerId: res.readerId, baseId: res.base.id }, 'nfc: reader provisioned');
    return reply.status(201).send(createNfcReaderResponseSchema.parse(res));
  });

  // PUT /nfc/cards — bind a card's Calypso serial to the soldier with this personal number.
  api.put('/nfc/cards', async (request) => {
    const body = validate(enrollNfcCardBodySchema, request.body);
    const res = await enrollCard(currentUser(request), body);
    request.log.info({ userId: res.userId }, 'nfc: card enrolled');
    return nfcCardEnrollmentResponseSchema.parse(res);
  });

  // DELETE /nfc/cards — revoke the soldier's active card.
  api.delete('/nfc/cards', async (request, reply) => {
    const { personalNumber } = validate(revokeNfcCardBodySchema, request.body);
    await revokeCard(currentUser(request), personalNumber);
    return reply.status(204).send();
  });

  // ---- gate reader (no Supabase user; `Authorization: Gate <readerId>.<secret>`) ----

  // POST /speedgate/scans — one physical scan. `requestId` makes network retries idempotent.
  api.post(
    '/speedgate/scans',
    {
      onRequest: requireReader,
      config: {
        public: true,
        rateLimit: {
          max: 120, // a busy gate: ~2 scans/second per reader
          timeWindow: '1 minute',
          keyGenerator: (req: FastifyRequest) => `reader:${req.reader?.id ?? req.ip}`,
        },
      },
    },
    async (request) => {
      const body = validate(speedgateScanBodySchema, request.body);
      return speedgateScanResponseSchema.parse(await scan(request.reader!, body));
    },
  );
};

export default routes;
