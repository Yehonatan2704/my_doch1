import { describe, expect, it } from 'vitest';
import { applyPlan, weekdayOf } from './template';

describe('template', () => {
  it('weekdayOf', () => {
    expect(weekdayOf('2026-09-22')).toBe(2); // Tuesday
  });
  it('applyPlan: 8 rolling days, fill-empty-only', () => {
    const days = [1, 1, 1, 1, 2, 1, null].map((r) => (r ? { reasonId: r } : null));
    const rows = applyPlan('2026-09-22', { days }, new Set(['2026-09-23']));
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual({ date: '2026-09-22', reasonId: 1, tag: 'add' });
    expect(rows[1]!.tag).toBe('kept');
    expect(rows[2]).toEqual({ date: '2026-09-24', reasonId: 2, tag: 'add' });
    expect(rows[4]).toEqual({ date: '2026-09-26', reasonId: null, tag: 'none' });
    expect(rows[7]!.date).toBe('2026-09-29');
  });
});
