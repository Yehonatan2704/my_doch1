import type { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { FILE_MAX_BYTES, type UploadDocumentResponse } from '@doch1/shared';
import { ApiError } from '../../plugins/errors';
import { saveDocument } from './service';

// Multipart parser errors → contract codes. Anything else stays a 500.
const MULTIPART_ERRORS: Record<string, ApiError['code']> = {
  FST_REQ_FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FST_FILES_LIMIT: 'VALIDATION_ERROR',
  FST_FIELDS_LIMIT: 'VALIDATION_ERROR',
  FST_PARTS_LIMIT: 'VALIDATION_ERROR',
  FST_INVALID_MULTIPART_CONTENT_TYPE: 'VALIDATION_ERROR',
  FST_PROTO_VIOLATION: 'VALIDATION_ERROR',
};

const routes: FastifyPluginAsync = async (api) => {
  // Registered here, so multipart parsing exists only on this module's routes.
  // SECURITY.md §6: one file, 5 MB, no other fields.
  await api.register(multipart, {
    limits: { fileSize: FILE_MAX_BYTES, files: 1, fields: 0, parts: 1, headerPairs: 50 },
  });

  // POST /documents — multipart field `file` (SPEC §9 row 15) → { documentId }.
  api.post(
    '/documents',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request): Promise<UploadDocumentResponse> => {
      let buf: Buffer | undefined;
      try {
        // Read every part, so a second file or a stray field is rejected instead of ignored.
        for await (const part of request.parts()) {
          if (part.type !== 'file' || part.fieldname !== 'file' || buf) {
            throw new ApiError('VALIDATION_ERROR');
          }
          buf = await part.toBuffer();
        }
        if (!buf) throw new ApiError('VALIDATION_ERROR');
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (err instanceof ApiError) throw err;
        if (code && MULTIPART_ERRORS[code]) throw new ApiError(MULTIPART_ERRORS[code]);
        throw err;
      }
      return { documentId: await saveDocument(request.user!.id, buf) };
    },
  );
};

export default routes;
