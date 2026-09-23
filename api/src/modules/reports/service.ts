import { and, eq, gte, lte } from 'drizzle-orm';
import {
  DEADLINE_HOUR,
  EDIT_LOCK,
  FUTURE_WINDOW_DAYS,
  type PutReportBody,
  type Report,
  type TodayReportResponse,
} from '@doch1/shared';
import { db } from '../../db/client';
import { documents, reportAudit, reports, statusReasons } from '../../db/schema';
import { ApiError } from '../../plugins/errors';
import { selectReports } from './query';
import { atJerusalem, clock, dayDiff, jerusalemDate, jerusalemHHMM } from './time';

// Every function here acts on the caller's own reports: `userId` is always request.user.id.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const DEADLINE = `${String(DEADLINE_HOUR).padStart(2, '0')}:00`;
// reason ids are smallint: a larger id would make Postgres raise instead of finding nothing.
const SMALLINT_MAX = 32767;

export async function getToday(userId: string): Promise<TodayReportResponse> {
  const now = clock.now();
  const today = jerusalemDate(now);
  const deadline = atJerusalem(today, DEADLINE);
  const [report] = await selectReports(
    and(eq(reports.userId, userId), eq(reports.reportDate, today)),
  );
  return {
    date: today,
    serverTime: now.toISOString(),
    deadline,
    isLate: now.getTime() > Date.parse(deadline),
    editLockAt: atJerusalem(today, EDIT_LOCK),
    report: report ?? null,
  };
}

export function listReports(userId: string, from: string, to: string): Promise<Report[]> {
  return selectReports(
    and(eq(reports.userId, userId), gte(reports.reportDate, from), lte(reports.reportDate, to)),
  );
}

/**
 * SPEC §4 for the soldier: today until 23:59, and today+1 … today+7. Past days are locked.
 * Checked before the transaction so a locked day never touches the DB.
 */
function assertSelfWritable(date: string) {
  const now = clock.now();
  const offset = dayDiff(jerusalemDate(now), date);
  if (offset < 0 || (offset === 0 && jerusalemHHMM(now) >= EDIT_LOCK)) {
    throw new ApiError('DAY_LOCKED');
  }
  if (offset > FUTURE_WINDOW_DAYS) throw new ApiError('OUT_OF_WINDOW');
}

function lockOwn(tx: Tx, userId: string, date: string) {
  return tx
    .select({ id: reports.id, reasonId: reports.reasonId, finalizedAt: reports.finalizedAt })
    .from(reports)
    .where(and(eq(reports.userId, userId), eq(reports.reportDate, date)))
    .for('update')
    .then(([r]) => r);
}

/** Create or update the caller's report for `date` (F2 one-tap, F3, F4). */
export async function putOwnReport(
  userId: string,
  date: string,
  body: PutReportBody,
): Promise<Report> {
  assertSelfWritable(date);

  const id = await db.transaction(async (tx) => {
    let existing = await lockOwn(tx, userId, date);
    if (existing?.finalizedAt) throw new ApiError('DAY_FINALIZED');

    const [reason] =
      body.reasonId > SMALLINT_MAX
        ? []
        : await tx
            .select({
              requiresDocument: statusReasons.requiresDocument,
              allowsNote: statusReasons.allowsNote,
              commanderOnly: statusReasons.commanderOnly,
            })
            .from(statusReasons)
            .where(eq(statusReasons.id, body.reasonId));
    // Commander-only reasons are set by a commander through /commander routes, never on a
    // self-report — also when the reporter is a commander (SPEC §4, §9 row 23).
    if (!reason || reason.commanderOnly) throw new ApiError('REASON_NOT_ALLOWED');
    if (body.note !== undefined && !reason.allowsNote) throw new ApiError('NOTE_NOT_ALLOWED');
    if (reason.requiresDocument && !body.documentId) throw new ApiError('DOCUMENT_REQUIRED');
    if (body.documentId) {
      // Only the caller's own upload; a missing id answers the same, so ids can't be probed.
      const [doc] = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.id, body.documentId), eq(documents.ownerId, userId)));
      if (!doc) throw new ApiError('FORBIDDEN');
    }

    // Fields are picked explicitly — the request body is never spread (SECURITY.md §2).
    const fields = {
      reasonId: body.reasonId,
      note: body.note ?? null,
      documentId: body.documentId ?? null,
      source: 'self',
      lastModifiedBy: userId,
      // Stage-1 approval resets when the soldier edits (SPEC §4).
      approvedBy: null,
      approvedAt: null,
    };

    if (!existing) {
      const [created] = await tx
        .insert(reports)
        .values({ ...fields, userId, reportDate: date, reportedBy: userId })
        .onConflictDoNothing()
        .returning({ id: reports.id });
      if (created) {
        await audit(tx, userId, date, created.id, 'create', null, body.reasonId);
        return created.id;
      }
      // A parallel request created it first — fall through and update that row.
      existing = await lockOwn(tx, userId, date);
      if (!existing) throw new Error('report row vanished during upsert');
      if (existing.finalizedAt) throw new ApiError('DAY_FINALIZED');
    }

    await tx.update(reports).set(fields).where(eq(reports.id, existing.id));
    await audit(tx, userId, date, existing.id, 'update', existing.reasonId, body.reasonId);
    return existing.id;
  });

  const [report] = await selectReports(eq(reports.id, id));
  if (!report) throw new ApiError('NOT_FOUND');
  return report;
}

/** Delete one of the caller's future reports (F4). Today and past days stay. */
export async function deleteOwnReport(userId: string, date: string): Promise<void> {
  if (dayDiff(jerusalemDate(clock.now()), date) <= 0) throw new ApiError('DAY_LOCKED');

  await db.transaction(async (tx) => {
    const existing = await lockOwn(tx, userId, date);
    if (!existing) throw new ApiError('NOT_FOUND');
    if (existing.finalizedAt) throw new ApiError('DAY_FINALIZED');
    await tx.delete(reports).where(eq(reports.id, existing.id));
    await audit(tx, userId, date, existing.id, 'delete', existing.reasonId, null);
  });
}

// Same transaction as the change it records (CLAUDE.md, backend conventions).
function audit(
  tx: Tx,
  userId: string,
  date: string,
  reportId: string,
  action: 'create' | 'update' | 'delete',
  oldReasonId: number | null,
  newReasonId: number | null,
) {
  return tx.insert(reportAudit).values({
    reportId,
    userId,
    reportDate: date,
    action,
    actorId: userId,
    oldReasonId,
    newReasonId,
  });
}
