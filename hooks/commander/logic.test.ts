import type { GroupNode, GroupReportRow } from '@doch1/shared';
import { describe, expect, test } from 'vitest';
import {
  allScope,
  canApprove,
  defaultScope,
  flattenGroups,
  pinStarred,
  reasonBlocked,
  viewWindow,
} from './logic';

const node = (id: string, children: GroupNode[] = []): GroupNode => ({
  id,
  name: `g${id}`,
  code: id,
  children,
});

const row = (
  id: string,
  isFavorite: boolean,
  report: Partial<NonNullable<GroupReportRow['report']>> | null = null,
) =>
  ({
    soldier: { id, firstName: id, lastName: id, groupId: 'g', groupName: 'g' },
    isFavorite,
    report: report && { approvedAt: null, finalizedAt: null, ...report },
  }) as GroupReportRow;

describe('groups', () => {
  const tree = [node('1', [node('2', [node('3')]), node('4')])];
  test('flattens parents before children with depth', () => {
    expect(flattenGroups(tree).map((g) => [g.id, g.depth])).toEqual([
      ['1', 0],
      ['2', 1],
      ['3', 2],
      ['4', 1],
    ]);
  });
  test('default = first group only; all = its subtree', () => {
    expect(defaultScope(tree)).toEqual({ groupId: '1', includeSub: false });
    expect(allScope(tree)).toEqual({ groupId: '1', includeSub: true });
    expect(defaultScope([])).toBeNull();
  });
});

test('view window is today … today+7', () => {
  const w = viewWindow('2026-09-28');
  expect(w).toHaveLength(8);
  expect(w[0]).toBe('2026-09-28');
  expect(w[7]).toBe('2026-10-05');
});

test('starred soldiers pinned on top, server order kept otherwise', () => {
  const rows = [row('a', false), row('b', true), row('c', false), row('d', true)];
  expect(pinStarred(rows).map((r) => r.soldier.id)).toEqual(['b', 'd', 'a', 'c']);
});

test('approvable = reported, not approved, not finalized', () => {
  expect(canApprove(row('a', false))).toBe(false);
  expect(canApprove(row('a', false, { id: 'r' }))).toBe(true);
  expect(canApprove(row('a', false, { id: 'r', approvedAt: 'x' }))).toBe(false);
  expect(canApprove(row('a', false, { id: 'r', finalizedAt: 'x' }))).toBe(false);
});

test('document reasons need an existing document in the commander editor', () => {
  const r = { requiresDocument: true } as Parameters<typeof reasonBlocked>[0];
  expect(reasonBlocked(r, false, 'no')).toBe('no');
  expect(reasonBlocked(r, true, 'no')).toBeNull();
});
