import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { FILE_MAX_BYTES, uploadDocumentResponseSchema } from '@doch1/shared';
import { buildServer } from '../src/server';
import documentsRoutes from '../src/modules/documents/routes';
import { sniff, stripMetadata } from '../src/modules/documents/filetype';
import { registerErrorHandling } from '../src/plugins/errors';

// ---------- fixtures ----------
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const seg = (marker: number, payload: Buffer) => {
  const h = Buffer.alloc(4);
  h.writeUInt16BE(0xff00 | marker, 0);
  h.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([h, payload]);
};
const JPEG_EXIF = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
  seg(0xe1, Buffer.from('Exif\0\0GPS-LAT-31.77-LON-35.21', 'latin1')),
  seg(0xdb, Buffer.alloc(65, 1)),
  Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 5, 6, 0xab, 0xcd, 0xff, 0xd9]),
]);
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
};
const PNG_EXIF = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', Buffer.alloc(13, 1)),
  chunk('eXIf', Buffer.from('GPS-LAT-31.77', 'latin1')),
  chunk('tEXt', Buffer.from('Location\0base', 'latin1')),
  chunk('IDAT', Buffer.alloc(20, 7)),
  chunk('IEND', Buffer.alloc(0)),
]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]);

type Part = { name: string; filename?: string; type?: string; data: Buffer | string };
function multipart(parts: Part[]) {
  const boundary = '----b4test';
  const chunks: Buffer[] = [];
  for (const p of parts) {
    const disp = `form-data; name="${p.name}"${p.filename ? `; filename="${p.filename}"` : ''}`;
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: ${disp}\r\n` +
          (p.type ? `Content-Type: ${p.type}\r\n` : '') +
          '\r\n',
      ),
      Buffer.isBuffer(p.data) ? p.data : Buffer.from(p.data),
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
const file = (data: Buffer, filename = 'note.pdf', type = 'application/pdf'): Part => ({
  name: 'file',
  filename,
  type,
  data,
});

// ---------- unit ----------
describe('B4 file type by magic bytes', () => {
  test('sniff', () => {
    expect(sniff(PDF)?.mime).toBe('application/pdf');
    expect(sniff(JPEG_EXIF)?.mime).toBe('image/jpeg');
    expect(sniff(PNG_EXIF)?.mime).toBe('image/png');
    expect(sniff(EXE)).toBeNull();
    expect(sniff(Buffer.from('<html><script>'))).toBeNull();
    expect(sniff(Buffer.alloc(0))).toBeNull();
  });

  test('JPEG: APP1 (Exif) removed, everything else byte-identical', () => {
    const out = stripMetadata(JPEG_EXIF, sniff(JPEG_EXIF)!);
    expect(out.includes('Exif')).toBe(false);
    expect(out.includes('GPS')).toBe(false);
    expect(out.includes('JFIF')).toBe(true);
    expect(out.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(out.subarray(-14)).toEqual(JPEG_EXIF.subarray(-14)); // scan data untouched
  });

  test('PNG: eXIf and text chunks removed, image chunks kept', () => {
    const out = stripMetadata(PNG_EXIF, sniff(PNG_EXIF)!);
    for (const gone of ['eXIf', 'tEXt', 'GPS', 'Location']) expect(out.includes(gone)).toBe(false);
    for (const kept of ['IHDR', 'IDAT', 'IEND']) expect(out.includes(kept)).toBe(true);
  });

  test('malformed images are left unchanged, never corrupted', () => {
    const truncated = JPEG_EXIF.subarray(0, 30);
    expect(stripMetadata(truncated, sniff(truncated)!)).toBe(truncated);
    const badPng = PNG_EXIF.subarray(0, 40);
    expect(stripMetadata(badPng, sniff(badPng)!)).toBe(badPng);
  });
});

describe('B4 POST /documents — auth', () => {
  test('requires a logged-in user (401)', async () => {
    const app = await buildServer({ modules: [documentsRoutes] });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      ...multipart([file(PDF)]),
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

// ---------- route + DB ----------
describe.skipIf(!process.env.DATABASE_URL)('B4 POST /documents', () => {
  const ME = 'b4000000-0000-0000-0000-000000000001';
  const SUPABASE_URL = 'https://test-project.supabase.co';
  const uploads: { url: string; headers: Record<string, string>; body: Buffer }[] = [];
  let storageStatus = 200;
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    uploads.push({
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: Buffer.from(init?.body as Uint8Array),
    });
    return new Response('{}', { status: storageStatus });
  });

  let app: FastifyInstance;
  let sql: typeof import('../src/db/client').sqlClient;

  beforeAll(async () => {
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
    vi.stubGlobal('fetch', fetchMock);
    ({ sqlClient: sql } = await import('../src/db/client'));
    await sql`delete from users where id = ${ME}`;
    await sql`insert into users (id, personal_number, first_name, last_name, email)
      values (${ME}, '9999903', 'בדיקה', 'מסמכים', 'b4.soldier@example.com')`;

    app = Fastify();
    registerErrorHandling(app);
    app.addHook('onRequest', async (req) => {
      req.user = { id: ME, role: 'soldier' };
    });
    await app.register(documentsRoutes);
  });
  afterAll(async () => {
    await sql`delete from users where id = ${ME}`; // documents cascade
    vi.unstubAllGlobals();
    await app.close();
  });
  beforeEach(async () => {
    uploads.length = 0;
    storageStatus = 200;
    await sql`delete from documents where owner_id = ${ME}`;
  });

  const upload = (parts: Part[]) =>
    app.inject({ method: 'POST', url: '/documents', ...multipart(parts) });
  const rows = () =>
    sql<{ id: string; storage_path: string; mime_type: string; size_bytes: number }[]>`
      select id, storage_path, mime_type, size_bytes from documents where owner_id = ${ME}`;
  const expectError = async (
    res: Awaited<ReturnType<typeof upload>>,
    status: number,
    code: string,
  ) => {
    expect(res.statusCode).toBe(status);
    expect(res.json().error.code).toBe(code);
    expect(await rows()).toEqual([]);
    expect(uploads).toEqual([]);
  };

  test('PDF → documentId; private bucket, server-generated path, row owned by me', async () => {
    const res = await upload([file(PDF)]);
    expect(res.statusCode).toBe(200);
    const { documentId } = uploadDocumentResponseSchema.parse(res.json());
    expect(await rows()).toEqual([
      {
        id: documentId,
        storage_path: `${ME}/${documentId}.pdf`,
        mime_type: 'application/pdf',
        size_bytes: PDF.length,
      },
    ]);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.url).toBe(
      `${SUPABASE_URL}/storage/v1/object/sick-documents/${ME}/${documentId}.pdf`,
    );
    expect(uploads[0]!.headers).toMatchObject({
      authorization: 'Bearer service-role-test-key',
      'content-type': 'application/pdf',
      'x-upsert': 'false',
    });
    expect(uploads[0]!.body).toEqual(PDF);
  });

  test('the uploaded filename never reaches the path', async () => {
    const res = await upload([file(PDF, '../../../etc/passwd.pdf')]);
    const { documentId } = res.json();
    expect((await rows())[0]!.storage_path).toBe(`${ME}/${documentId}.pdf`);
  });

  test('type comes from magic bytes, not the declared Content-Type', async () => {
    const res = await upload([file(PNG_EXIF, 'x.pdf', 'application/pdf')]);
    expect(res.statusCode).toBe(200);
    const [row] = await rows();
    expect(row!.mime_type).toBe('image/png');
    expect(row!.storage_path.endsWith('.png')).toBe(true);
    expect(uploads[0]!.headers['content-type']).toBe('image/png');
  });

  test('EXIF is stripped before storage; stored size matches the stripped file', async () => {
    const res = await upload([file(JPEG_EXIF, 'photo.jpg', 'image/jpeg')]);
    expect(res.statusCode).toBe(200);
    expect(uploads[0]!.body.includes('GPS')).toBe(false);
    expect((await rows())[0]!.size_bytes).toBe(uploads[0]!.body.length);
  });

  test('disguised executable / HTML → 415', async () => {
    await expectError(
      await upload([file(EXE, 'a.jpg', 'image/jpeg')]),
      415,
      'FILE_TYPE_NOT_ALLOWED',
    );
    await expectError(
      await upload([file(Buffer.from('<html>'), 'a.pdf')]),
      415,
      'FILE_TYPE_NOT_ALLOWED',
    );
  });

  test('over 5 MB → 413; exactly 5 MB is accepted', async () => {
    const big = Buffer.concat([PDF, Buffer.alloc(FILE_MAX_BYTES - PDF.length + 1)]);
    await expectError(await upload([file(big)]), 413, 'FILE_TOO_LARGE');
    const max = Buffer.concat([PDF, Buffer.alloc(FILE_MAX_BYTES - PDF.length)]);
    expect((await upload([file(max)])).statusCode).toBe(200);
  });

  test('empty file → 400', async () => {
    await expectError(await upload([file(Buffer.alloc(0))]), 400, 'VALIDATION_ERROR');
  });

  test('wrong field name, extra field, second file, not multipart → 400', async () => {
    await expectError(await upload([{ ...file(PDF), name: 'doc' }]), 400, 'VALIDATION_ERROR');
    await expectError(
      await upload([{ name: 'ownerId', data: 'someone-else' }, file(PDF)]),
      400,
      'VALIDATION_ERROR',
    );
    await expectError(await upload([file(PDF), file(PDF)]), 400, 'VALIDATION_ERROR');
    await expectError(
      await app.inject({ method: 'POST', url: '/documents', payload: { file: 'x' } }),
      400,
      'VALIDATION_ERROR',
    );
  });

  test('storage failure → 500 with no details, and no orphan row', async () => {
    storageStatus = 500;
    const res = await upload([file(PDF)]);
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('INTERNAL');
    expect(res.body).not.toMatch(/storage|supabase|sick-documents/i);
    expect(await rows()).toEqual([]);
  });
});
