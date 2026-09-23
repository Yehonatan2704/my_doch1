import { describe, expect, test } from 'vitest';
import { countdownState, serverOffset } from './countdownState';

const DEADLINE = '2026-09-23T08:00:00.000Z'; // 11:00 in Israel (summer)
const at = (iso: string) => Date.parse(iso);

describe('countdownState', () => {
  test('hours and minutes left, rounded up', () => {
    expect(countdownState(DEADLINE, at('2026-09-23T05:00:00Z'))).toEqual({
      kind: 'left',
      hhmm: '03:00',
      warning: false,
    });
    expect(countdownState(DEADLINE, at('2026-09-23T07:58:30Z'))).toMatchObject({ hhmm: '00:02' });
  });

  test('warning under 30 minutes, not at exactly 30', () => {
    expect(countdownState(DEADLINE, at('2026-09-23T07:30:00Z'))).toMatchObject({ warning: false });
    expect(countdownState(DEADLINE, at('2026-09-23T07:30:01Z'))).toMatchObject({ warning: true });
  });

  test('late at and after the deadline', () => {
    expect(countdownState(DEADLINE, at(DEADLINE))).toEqual({ kind: 'late' });
    expect(countdownState(DEADLINE, at('2026-09-23T12:00:00Z'))).toEqual({ kind: 'late' });
  });

  test('uses the server clock, not a phone that is 2 hours slow', () => {
    const phoneNow = at('2026-09-23T06:30:00Z'); // phone says 09:30 IL
    const offset = serverOffset('2026-09-23T08:30:00Z', phoneNow); // server says 11:30 IL
    expect(countdownState(DEADLINE, phoneNow, offset)).toEqual({ kind: 'late' });
  });

  test('bad server time → no correction', () => {
    expect(serverOffset('nope', 123)).toBe(0);
  });
});
