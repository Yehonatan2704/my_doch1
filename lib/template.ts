// Weekly template helpers (DESIGN §7.8). Pure — dates are Israeli "YYYY-MM-DD" strings.
import {
  FUTURE_WINDOW_DAYS,
  type StatusCategory,
  type StatusReason,
  type StatusesResponse,
  type WeekTemplate,
} from '@doch1/shared';
import { addDays, type Ymd } from './calendar';

/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (d: Ymd) => new Date(`${d}T00:00:00Z`).getUTCDay();

export function findReason(
  statuses: StatusesResponse | undefined,
  reasonId: number | undefined,
): { reason: StatusReason; category: StatusCategory } | undefined {
  if (reasonId === undefined) return undefined;
  for (const category of statuses?.categories ?? []) {
    const reason = category.reasons.find((r) => r.id === reasonId);
    if (reason) return { reason, category };
  }
  return undefined;
}

/**
 * Reasons that can live in a template: self-reportable and not needing a document (applying the
 * template sends plain PUTs, with no file).
 */
export const templateReasons = (category: StatusCategory) =>
  category.reasons.filter((r) => !r.commanderOnly && !r.requiresDocument);

export type ApplyTag = 'add' | 'kept' | 'none';
export type ApplyRow = { date: Ymd; reasonId: number | null; tag: ApplyTag };

/** Today + the next 7 days, each with its weekday's template value; fill-empty-only. */
export function applyPlan(today: Ymd, template: WeekTemplate, reported: Set<Ymd>): ApplyRow[] {
  const rows: ApplyRow[] = [];
  for (let i = 0; i <= FUTURE_WINDOW_DAYS; i++) {
    const date = addDays(today, i);
    const reasonId = template.days[weekdayOf(date)]?.reasonId ?? null;
    const tag: ApplyTag = reported.has(date) ? 'kept' : reasonId === null ? 'none' : 'add';
    rows.push({ date, reasonId, tag });
  }
  return rows;
}
