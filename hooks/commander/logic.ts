// Commander screens (F8–F10): pure helpers, unit-tested. UX only — the server enforces every rule.
import {
  FUTURE_WINDOW_DAYS,
  TZ,
  type CategoryCode,
  type GroupNode,
  type GroupReportRow,
  type StatusesResponse,
} from '@doch1/shared';
import { he } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';
import { addDays } from '../../lib/calendar';

export type GroupOption = { id: string; name: string; depth: number };

/** The group tree as an indented list, parents before children (F8 group selector). */
export function flattenGroups(nodes: GroupNode[], depth = 0): GroupOption[] {
  return nodes.flatMap((g) => [
    { id: g.id, name: g.name, depth },
    ...flattenGroups(g.children, depth + 1),
  ]);
}

/** What the list is scoped to: one group, or a root group plus everything below it. */
export type Scope = { groupId: string; includeSub: boolean };

/**
 * F8 default = the first group. "כל הקבוצות" = the first root + its whole subtree.
 * ASSUMPTION: the API scopes by one groupId, so a commander of several separate trees sees
 * "כל הקבוצות" for the first one (commanders have one root in practice).
 */
export const defaultScope = (groups: GroupNode[]): Scope | null =>
  groups[0] ? { groupId: groups[0].id, includeSub: false } : null;
export const allScope = (groups: GroupNode[]): Scope | null =>
  groups[0] ? { groupId: groups[0].id, includeSub: true } : null;

/** Days a commander can view: today … today+7 (F8). */
export const viewWindow = (today: string) =>
  Array.from({ length: FUTURE_WINDOW_DAYS + 1 }, (_, i) => addDays(today, i));

/** Filter chips: every category, plus "לא דיווחו". */
export type Filter = CategoryCode | 'not_reported' | undefined;

export const isNotReported = (row: GroupReportRow) => !row.report;
export const isFinalized = (row: GroupReportRow) => !!row.report?.finalizedAt;
/** Waiting for stage-1 approval and still actionable (a finalized day can't be approved). */
export const canApprove = (row: GroupReportRow) =>
  !!row.report && !row.report.approvedAt && !row.report.finalizedAt;

/** Stars first, then the server's order (F8: star = pin). Stable, so ties keep server order. */
export const pinStarred = (rows: GroupReportRow[]) =>
  rows
    .map((r, i) => [r, i] as const)
    .sort(([a, i], [b, j]) => Number(b.isFavorite) - Number(a.isFavorite) || i - j)
    .map(([r]) => r);

type Category = StatusesResponse['categories'][number];
export type EditorReason = Category['reasons'][number];

export const categoryName = (statuses: StatusesResponse | undefined, code: CategoryCode) =>
  statuses?.categories.find((c) => c.code === code)?.nameHe ?? '';

/**
 * Why a reason can't be picked in the commander editor, or null. The editor has no upload, so a
 * reason that needs a document works only if the soldier already attached one (SPEC §9 row 20).
 */
export const reasonBlocked = (r: EditorReason, hasDocument: boolean, msg: string) =>
  r.requiresDocument && !hasDocument ? msg : null;

/** "ג׳ 24/9" — compact day label for the date chips (Israel time). */
export const shortDayIL = (date: string) =>
  formatInTimeZone(new Date(`${date}T12:00:00Z`), TZ, 'EEEEEE d/M', { locale: he });
