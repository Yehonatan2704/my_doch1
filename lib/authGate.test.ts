import { describe, expect, test } from 'vitest';
import { gateFor } from './authGate';
import { CHUNK_SIZE, chunkValue } from './chunks';

describe('gateFor (GET /me outcome)', () => {
  test.each([
    [null, 'ok'],
    [{ code: 'NOT_REGISTERED' }, 'not-registered'],
    [{ code: 'INACTIVE_USER' }, 'not-registered'],
    [{ code: 'UNAUTHORIZED' }, 'signed-out'],
    [{ code: 'INTERNAL' }, 'error'],
    [{ code: 'RATE_LIMITED' }, 'error'],
  ] as const)('%j → %s', (error, gate) => {
    expect(gateFor(error)).toBe(gate);
  });
});

describe('chunkValue (secure-store session chunks)', () => {
  test('a session larger than one chunk splits and joins back losslessly', () => {
    const session = JSON.stringify({ access_token: 'x'.repeat(4000), user: { name: 'בדיקה' } });
    const parts = chunkValue(session);
    expect(parts.length).toBe(Math.ceil(session.length / CHUNK_SIZE));
    expect(parts.every((p) => p.length <= CHUNK_SIZE)).toBe(true);
    expect(parts.join('')).toBe(session);
  });
  test('empty and small values are one chunk', () => {
    expect(chunkValue('')).toEqual(['']);
    expect(chunkValue('abc')).toEqual(['abc']);
  });
});
