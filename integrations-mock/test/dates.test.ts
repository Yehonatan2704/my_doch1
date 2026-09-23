import { describe, expect, test } from 'vitest';
import { addDays, daysInclusive, formatDmy, todayInTz } from '../src/dates';

describe('dates (Asia/Jerusalem)', () => {
  test('today is the Jerusalem date, not the UTC date', () => {
    // 22:30 UTC on 22/09 is already 01:30 on 23/09 in Israel (summer, UTC+3).
    expect(todayInTz(new Date('2026-09-22T22:30:00Z'))).toBe('2026-09-23');
    expect(todayInTz(new Date('2026-09-22T20:59:59Z'))).toBe('2026-09-22');
    expect(todayInTz(new Date('2026-09-22T21:00:00Z'))).toBe('2026-09-23');
  });

  test('today across month and year boundaries (winter, UTC+2)', () => {
    expect(todayInTz(new Date('2026-12-31T21:59:59Z'))).toBe('2026-12-31');
    expect(todayInTz(new Date('2026-12-31T22:00:00Z'))).toBe('2027-01-01');
    expect(todayInTz(new Date('2027-01-31T22:30:00Z'))).toBe('2027-02-01');
  });

  test('addDays crosses months, years, leap days and DST changes', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-03-26', 2)).toBe('2026-03-28'); // Israel moves to summer time on 27/03/2026
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26'); // …and back on 25/10/2026
    expect(addDays('2026-09-23', 30)).toBe('2026-10-23');
  });

  test('daysInclusive counts both ends', () => {
    expect(daysInclusive('2026-09-23', '2026-09-23')).toBe(1);
    expect(daysInclusive('2026-09-23', '2026-09-26')).toBe(4);
    expect(daysInclusive('2026-12-30', '2027-01-02')).toBe(4);
    expect(daysInclusive('2028-02-27', '2028-03-01')).toBe(4);
    expect(daysInclusive('2026-10-24', '2026-10-26')).toBe(3);
  });

  test('formatDmy', () => {
    expect(formatDmy('2027-01-02')).toBe('02/01/2027');
    expect(formatDmy('2026-12-31')).toBe('31/12/2026');
  });
});
