// File type by magic bytes, never by extension or Content-Type (SECURITY.md §6).

export type DocType = { mime: 'image/jpeg' | 'image/png' | 'application/pdf'; ext: string };

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function sniff(buf: Buffer): DocType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG))
    return { mime: 'image/png', ext: 'png' };
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-')
    return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

/**
 * Drop location/camera metadata from images (SECURITY.md §6): JPEG APP1 segments (Exif, XMP)
 * and PNG eXIf / text chunks. Anything that doesn't parse cleanly is returned unchanged —
 * stripping is best-effort, it never rejects or corrupts an upload.
 */
export function stripMetadata(buf: Buffer, type: DocType): Buffer {
  try {
    if (type.mime === 'image/jpeg') return stripJpeg(buf) ?? buf;
    if (type.mime === 'image/png') return stripPng(buf) ?? buf;
  } catch {
    // fall through
  }
  return buf;
}

function stripJpeg(buf: Buffer): Buffer | null {
  const keep: Buffer[] = [buf.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1]!;
    if (marker === 0xda) {
      // Start of scan: compressed image data follows to the end — keep the rest as is.
      keep.push(buf.subarray(i));
      return Buffer.concat(keep);
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return null;
    if (marker !== 0xe1) keep.push(buf.subarray(i, i + 2 + len)); // 0xE1 = APP1 (Exif/XMP)
    i += 2 + len;
  }
  return null;
}

const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt']);

function stripPng(buf: Buffer): Buffer | null {
  const keep: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString('latin1');
    const end = i + 12 + len; // length + type + data + crc
    if (end > buf.length) return null;
    if (!PNG_DROP.has(type)) keep.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') return Buffer.concat(keep);
  }
  return null;
}
