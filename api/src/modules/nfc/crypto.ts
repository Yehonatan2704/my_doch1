import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const NFC_SECRET_ENV = 'NFC_CARD_HMAC_SECRET';
export const NFC_SECRET_MIN_BYTES = 32;

// Read per call (like the integration keys) so tests and a restart pick up changes. Rotating it
// orphans every enrolled card — all cards must be re-enrolled — so rotate only after a leak.
function cardSecret(): string {
  const secret = process.env[NFC_SECRET_ENV];
  if (!secret || Buffer.byteLength(secret) < NFC_SECRET_MIN_BYTES)
    throw new Error(`${NFC_SECRET_ENV} is missing or shorter than ${NFC_SECRET_MIN_BYTES} bytes`);
  return secret;
}

/** Decimal, no leading zeros — so "0042" and "42" can never become two different cards. */
export const canonicalSerial = (serial: string) => BigInt(serial).toString(10);

/** The only form a Calypso serial is ever stored in: a keyed one-way hash (SECURITY.md §5). */
export const cardFingerprint = (serial: string) =>
  createHmac('sha256', cardSecret()).update(`calypso:v1:${canonicalSerial(serial)}`).digest('hex');

/** Shown to HR to confirm which card was enrolled; not enough to identify a card. */
export const serialLast4 = (serial: string) => canonicalSerial(serial).slice(-4);

export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

/** 32 random bytes → 43 base64url chars. Returned to HR once; only its SHA-256 is stored. */
export const newReaderSecret = () => randomBytes(32).toString('base64url');

export function hexEquals(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, 'hex');
  const b = Buffer.from(bHex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
