import type { Report } from '@doch1/shared';
import { describe, expect, test } from 'vitest';
import { history as t, report as tReport } from '../i18n/he';
import { lockedReason, stages } from './history';

const cmd = { id: 'c', firstName: 'עידו', lastName: 'גפן' };
const r = (over: Partial<Report> = {}) =>
  ({
    date: '2026-09-20',
    approvedBy: null,
    approvedAt: null,
    finalizedBy: null,
    finalizedAt: null,
    ...over,
  }) as Report;

describe('approval stages', () => {
  test('nothing yet', () => {
    expect(stages(r())).toEqual({ approval: t.pending, finalization: t.notFinalized });
  });
  test('approved and finalized, in Israel time', () => {
    const s = stages(
      r({
        approvedBy: cmd,
        approvedAt: '2026-09-20T06:30:00Z', // 09:30 IDT
        finalizedBy: cmd,
        finalizedAt: '2026-09-20T20:00:00Z', // 23:00 IDT
      }),
    );
    expect(s.approval).toBe('אושר ע״י עידו גפן · 20/9 בשעה 09:30');
    expect(s.finalization).toBe('נסגר ע״י משא״ן · 20/9/2026');
  });
});

describe('can the soldier change the day?', () => {
  test.each([
    ['finalized', r({ finalizedAt: '2026-09-20T20:00:00Z' }), tReport.finalized],
    ['past', r(), t.pastLocked],
    ['today', r({ date: '2026-09-23' }), null],
    ['future', r({ date: '2026-09-25' }), null],
    ['finalized wins over future', r({ date: '2026-09-25', finalizedAt: 'x' }), tReport.finalized],
  ])('%s', (_, report, reason) => {
    expect(lockedReason(report, '2026-09-23')).toBe(reason);
  });
});
