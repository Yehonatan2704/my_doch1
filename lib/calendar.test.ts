import type { Report } from '@doch1/shared';
import { describe, expect, test } from 'vitest';
import {
  addDays,
  futureWindow,
  inFutureWindow,
  markFor,
  monthOf,
  monthRange,
  monthWeeks,
  shiftMonth,
} from './calendar';

describe('dates', () => {
  test('addDays crosses months, years and leap days', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  test('months', () => {
    expect(monthOf('2026-09-23')).toEqual({ year: 2026, month: 9 });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(monthRange({ year: 2026, month: 2 })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});

describe('month grid', () => {
  test('Sunday first; September 2026 starts on Tuesday', () => {
    const weeks = monthWeeks({ year: 2026, month: 9 });
    expect(weeks[0]).toEqual([
      null,
      null,
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
    ]);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks.at(-1)).toEqual([
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      null,
      null,
      null,
    ]);
  });
  test('a month starting on Sunday has no leading blanks', () => {
    expect(monthWeeks({ year: 2026, month: 11 })[0][0]).toBe('2026-11-01');
  });
});

describe('F4 window: only today+1 … today+7', () => {
  test.each([
    ['2026-09-23', false], // today
    ['2026-09-22', false],
    ['2026-09-24', true],
    ['2026-09-30', true], // +7
    ['2026-10-01', false], // +8
  ])('%s → %s', (d, ok) => {
    expect(inFutureWindow('2026-09-23', d)).toBe(ok);
  });
  test('range for GET /reports', () => {
    expect(futureWindow('2026-09-28')).toEqual({ from: '2026-09-29', to: '2026-10-05' });
  });
});

describe('day marks', () => {
  const r = (over: Partial<Report>) =>
    ({
      date: '2026-09-25',
      reason: { id: 1, code: 'present', nameHe: 'נוכח/ת', categoryCode: 'on_base' },
      source: 'self',
      documentId: null,
      ...over,
    }) as Report;

  test('on base → ✓, no label; a future day is scheduled', () => {
    expect(markFor(r({}), '2026-09-23')).toEqual({
      present: true,
      label: undefined,
      scheduled: true,
      changed: false,
      attachment: false,
      category: 'on_base',
      pending: true,
    });
  });
  test('a speedgate (nfc) report is the soldier\'s own — no "changed" ring', () => {
    expect(markFor(r({ source: 'nfc' }), '2026-09-23').changed).toBe(false);
  });
  test('elsewhere → label; changed by commander → ring; document → 📎', () => {
    const m = markFor(
      r({
        date: '2026-09-20',
        reason: { id: 9, code: 'sick', nameHe: 'גימלים', categoryCode: 'sick_leave' },
        source: 'commander',
        documentId: 'd1',
      }),
      '2026-09-23',
    );
    expect(m).toEqual({
      present: false,
      label: 'גימלים',
      scheduled: false,
      changed: true,
      attachment: true,
      category: 'sick_leave',
      pending: true,
    });
  });
});

describe('editable window (§7.3)', () => {
  test('today … today+7, range clamped and ordered', async () => {
    const { isEditable, editableRange, shortDM } = await import('./calendar');
    expect(isEditable('2026-09-23', '2026-09-23')).toBe(true);
    expect(isEditable('2026-09-23', '2026-09-30')).toBe(true);
    expect(isEditable('2026-09-23', '2026-10-01')).toBe(false);
    expect(isEditable('2026-09-23', '2026-09-22')).toBe(false);
    expect(editableRange('2026-09-23', '2026-10-03', '2026-09-28')).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30',
    ]);
    expect(shortDM('2026-09-04')).toBe('4.9');
  });
});
