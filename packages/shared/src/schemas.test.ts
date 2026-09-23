import { describe, expect, test } from 'vitest';
import {
  groupNodeSchema,
  groupReportsQuerySchema,
  putReportBodySchema,
  putSettingsBodySchema,
  reportIdsBodySchema,
  reportsQuerySchema,
} from './schemas';
import { BULK_MAX, NOTE_MAX } from './constants';

const SEED_ID = '00000000-0000-0000-0000-000000000001';

describe('contract', () => {
  test('seeded ids are accepted', () => {
    expect(reportIdsBodySchema.safeParse({ reportIds: [SEED_ID] }).success).toBe(true);
  });

  test('strict bodies reject extra fields (no mass assignment)', () => {
    expect(putReportBodySchema.safeParse({ reasonId: 1, userId: SEED_ID }).success).toBe(false);
    expect(putReportBodySchema.safeParse({ reasonId: 1, source: 'hr' }).success).toBe(false);
  });

  test('note is trimmed and capped', () => {
    expect(putReportBodySchema.parse({ reasonId: 1, note: '  hi  ' }).note).toBe('hi');
    expect(putReportBodySchema.safeParse({ reasonId: 1, note: 'x'.repeat(NOTE_MAX + 1) }).success).toBe(false);
    expect(putReportBodySchema.safeParse({ reasonId: 1, note: '   ' }).success).toBe(false);
  });

  test('history range: ordered and under 62 days', () => {
    expect(reportsQuerySchema.safeParse({ from: '2026-09-01', to: '2026-09-30' }).success).toBe(true);
    expect(reportsQuerySchema.safeParse({ from: '2026-09-30', to: '2026-09-01' }).success).toBe(false);
    expect(reportsQuerySchema.safeParse({ from: '2026-07-01', to: '2026-09-01' }).success).toBe(false);
    expect(reportsQuerySchema.safeParse({ from: '2026-02-30', to: '2026-03-01' }).success).toBe(false);
  });

  test('bulk capped at 200', () => {
    const ids = (n: number) => Array.from({ length: n }, () => SEED_ID);
    expect(reportIdsBodySchema.safeParse({ reportIds: ids(BULK_MAX) }).success).toBe(true);
    expect(reportIdsBodySchema.safeParse({ reportIds: ids(BULK_MAX + 1) }).success).toBe(false);
    expect(reportIdsBodySchema.safeParse({ reportIds: [] }).success).toBe(false);
  });

  test('settings PUT: partial, non-empty, valid nudge interval', () => {
    expect(putSettingsBodySchema.safeParse({ nudgeIntervalMin: 30 }).success).toBe(true);
    expect(putSettingsBodySchema.safeParse({ nudgeIntervalMin: 20 }).success).toBe(false);
    expect(putSettingsBodySchema.safeParse({}).success).toBe(false);
    expect(putSettingsBodySchema.safeParse({ reminderTime: '24:00' }).success).toBe(false);
  });

  test('group reports query parses string booleans with defaults', () => {
    expect(groupReportsQuerySchema.parse({ includeSub: 'true' })).toEqual({
      includeSub: true,
      pending: false,
      sort: 'name',
    });
    expect(groupReportsQuerySchema.safeParse({ sort: 'personal_number' }).success).toBe(false);
  });

  test('group tree is recursive', () => {
    const leaf = { id: SEED_ID, name: 'צוות', code: '1', children: [] };
    expect(groupNodeSchema.safeParse({ ...leaf, children: [leaf] }).success).toBe(true);
    expect(groupNodeSchema.safeParse({ ...leaf, children: [{ id: SEED_ID }] }).success).toBe(false);
  });
});

describe('integrations contract (I1)', () => {
  test('CPR body: personal number format, 1..CPR_MAX_DAYS days, strict', async () => {
    const { cprSickLeaveBodySchema } = await import('./schemas');
    const { CPR_MAX_DAYS } = await import('./constants');
    const ok = { personalNumber: '9000013', issueDate: '2026-09-23', days: 3 };
    expect(cprSickLeaveBodySchema.safeParse(ok).success).toBe(true);
    expect(cprSickLeaveBodySchema.safeParse({ ...ok, days: 0 }).success).toBe(false);
    expect(cprSickLeaveBodySchema.safeParse({ ...ok, days: CPR_MAX_DAYS + 1 }).success).toBe(false);
    expect(cprSickLeaveBodySchema.safeParse({ ...ok, days: 1.5 }).success).toBe(false);
    expect(cprSickLeaveBodySchema.safeParse({ ...ok, personalNumber: '12ab567' }).success).toBe(false);
    expect(cprSickLeaveBodySchema.safeParse({ ...ok, issueDate: '23/09/2026' }).success).toBe(false);
    expect(cprSickLeaveBodySchema.safeParse({ ...ok, userId: 'x' }).success).toBe(false);
  });

  test('leave body: end on/after start, strict', async () => {
    const { annualLeaveBodySchema } = await import('./schemas');
    const ok = { personalNumber: '9000013', startDate: '2026-09-24', endDate: '2026-09-27' };
    expect(annualLeaveBodySchema.safeParse(ok).success).toBe(true);
    expect(annualLeaveBodySchema.safeParse({ ...ok, endDate: ok.startDate }).success).toBe(true);
    expect(annualLeaveBodySchema.safeParse({ ...ok, endDate: '2026-09-23' }).success).toBe(false);
    expect(annualLeaveBodySchema.safeParse({ ...ok, reasonId: 1 }).success).toBe(false);
  });

  test('soldiers query: limit is coerced and capped, q length capped', async () => {
    const { integrationSoldiersQuerySchema } = await import('./schemas');
    expect(integrationSoldiersQuerySchema.parse({}).limit).toBe(50);
    expect(integrationSoldiersQuerySchema.parse({ limit: '5' }).limit).toBe(5);
    expect(integrationSoldiersQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
    expect(integrationSoldiersQuerySchema.safeParse({ q: 'x'.repeat(51) }).success).toBe(false);
    expect(integrationSoldiersQuerySchema.safeParse({ other: '1' }).success).toBe(false);
  });
});
