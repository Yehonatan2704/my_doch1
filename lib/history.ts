// F5 day detail: the two approval stages and whether the soldier may still change the day. Pure —
// unit-tested. The server enforces the same rules (CLAUDE.md rule 4).
import type { Report } from '@doch1/shared';
import { history as t, report as tReport } from '../i18n/he';
import type { Ymd } from './calendar';
import { dateIL, dayTimeIL } from './time';

const name = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

/** Stage 1 (commander approval) and stage 2 (HR finalization) lines. */
export function stages(r: Report) {
  return {
    approval:
      r.approvedBy && r.approvedAt
        ? t.approvedBy(name(r.approvedBy), dayTimeIL(r.approvedAt))
        : t.pending,
    finalization: r.finalizedAt ? t.finalizedOn(dateIL(r.finalizedAt)) : t.notFinalized,
  };
}

/** null when the soldier can still change the day (today…+7), else why not. */
export function lockedReason(r: Report, today: Ymd): string | null {
  if (r.finalizedAt) return tReport.finalized;
  if (r.date < today) return t.pastLocked;
  return null;
}

export const personName = name;
