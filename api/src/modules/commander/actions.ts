import { and, eq, inArray, sql } from 'drizzle-orm';
import { FUTURE_WINDOW_DAYS } from '@doch1/shared';
import { db } from '../../db/client';
import { documents, favorites, reportAudit, reports, statusReasons } from '../../db/schema';
import { ApiError } from '../../plugins/errors';
import type { AuthUser } from '../../plugins/types';
import { assertCanActOn, assertHr, inHrScope, type Executor } from './access';
import { bestEffort } from '../push/best-effort';
import { notifyReportChanged } from '../push/service';

// HR writes are marked so the soldier's history shows the red circle and the משא״ן
// notification fires instead of the commander one (SPEC F9b).
const sourceFor = (actor: AuthUser): 'hr' | 'commander' => (actor.role === 'admin' ? 'hr' : 'commander');

const SMALLINT_MAX = 32767;

/**
 * Stage-1 approval, in bulk. All-or-nothing: one id that doesn't exist, sits outside the
 * actor's scope, or belongs to a finalized day rejects the whole call (SECURITY.md §4).
 */
export function approveReports(actor: AuthUser, reportIds: string[]): Promise<number> {
  const ids = [...new Set(reportIds)];
  return db.transaction(async (tx) => {
    const rows = await loadForBulk(tx, actor, ids);
    // F9: a finalized day is read-only for the commander too.
    if (actor.role !== 'admin' && rows.some((r) => r.finalizedAt !== null)) {
      throw new ApiError('DAY_FINALIZED');
    }
    await tx
      .update(reports)
      .set({ approvedBy: actor.id, approvedAt: sql`now()` })
      .where(inArray(reports.id, ids));
    await tx.insert(reportAudit).values(rows.map((r) => auditRow(r, 'approve', actor.id)));
    return ids.length;
  });
}

/**
 * Edit a soldier's report, or create one for a soldier who didn't report (F9).
 * Commander-only reasons are allowed here — that is the point of the route.
 */
export function putSoldierReport(
  actor: AuthUser,
  soldierId: string,
  date: string,
  body: { reasonId: number; note?: string },
): Promise<string> {
  return db.transaction(async (tx) => {
    await assertCanActOn(actor.id, { soldierId }, tx as unknown as Executor);

    // reason ids are smallint in the DB: anything larger makes Postgres raise instead of
    // returning no rows, which would surface as a 500 for what is really a bad request.
    if (body.reasonId > SMALLINT_MAX) throw new ApiError('VALIDATION_ERROR');

    const [reason] = await tx
      .select({
        id: statusReasons.id,
        requiresDocument: statusReasons.requiresDocument,
        allowsNote: statusReasons.allowsNote,
      })
      .from(statusReasons)
      .where(eq(statusReasons.id, body.reasonId));
    if (!reason) throw new ApiError('VALIDATION_ERROR');
    if (body.note !== undefined && !reason.allowsNote) throw new ApiError('NOTE_NOT_ALLOWED');

    const [existing] = await tx
      .select({
        id: reports.id,
        reasonId: reports.reasonId,
        documentId: reports.documentId,
        reportedBy: reports.reportedBy,
        finalizedAt: reports.finalizedAt,
      })
      .from(reports)
      .where(and(eq(reports.userId, soldierId), eq(reports.reportDate, date)));

    const hrPowers =
      actor.role === 'admin' && (await inHrScope(actor.id, [soldierId], tx as unknown as Executor));
    await assertDateWritable(tx, hrPowers, date, existing?.finalizedAt ?? null);

    // The commander editor has no upload field, so a document can only be one the soldier
    // already attached. ASSUMPTION: SPEC §9 row 20.
    if (reason.requiresDocument && !existing?.documentId) throw new ApiError('DOCUMENT_REQUIRED');

    const source = sourceFor(actor);
    const reportId =
      existing ?
        await update(tx, existing.id, body, source, actor)
      : await create(tx, soldierId, date, body, source, actor);

    await tx.insert(reportAudit).values({
      reportId,
      userId: soldierId,
      reportDate: date,
      action: existing ? 'update' : 'create',
      actorId: actor.id,
      oldReasonId: existing?.reasonId ?? null,
      newReasonId: body.reasonId,
    });
    return reportId;
  });
}

/**
 * Edit a soldier's report, then tell them about it. The notification is deliberately outside
 * the transaction: it is best-effort, and a slow push must not hold a DB transaction open.
 */
export async function putSoldierReportAndNotify(
  actor: AuthUser,
  soldierId: string,
  date: string,
  body: { reasonId: number; note?: string },
): Promise<string> {
  const reportId = await putSoldierReport(actor, soldierId, date, body);
  // "Changed by other" (SPEC §4): the soldier is told, if their toggle for this source is on.
  await bestEffort(() => notifyReportChanged(soldierId, sourceFor(actor)));
  return reportId;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function update(
  tx: Tx,
  id: string,
  body: { reasonId: number; note?: string },
  source: 'hr' | 'commander',
  actor: AuthUser,
): Promise<string> {
  // Fields are picked explicitly — the request body is never spread (SECURITY.md §2).
  // A report written by a commander/HR is approved by them at the same time (SPEC §9 row 37).
  await tx
    .update(reports)
    .set({
      reasonId: body.reasonId,
      note: body.note ?? null,
      source,
      lastModifiedBy: actor.id,
      approvedBy: actor.id,
      approvedAt: sql`now()`,
    })
    .where(eq(reports.id, id));
  return id;
}

async function create(
  tx: Tx,
  soldierId: string,
  date: string,
  body: { reasonId: number; note?: string },
  source: 'hr' | 'commander',
  actor: AuthUser,
): Promise<string> {
  const [row] = await tx
    .insert(reports)
    .values({
      userId: soldierId,
      reportDate: date,
      reasonId: body.reasonId,
      note: body.note ?? null,
      source,
      reportedBy: actor.id,
      lastModifiedBy: actor.id,
      approvedBy: actor.id,
      approvedAt: sql`now()`,
    })
    .returning({ id: reports.id });
  return String(row?.id);
}

/**
 * The window rules, all in Asia/Jerusalem and all decided by the database — never by the
 * server's local clock (CLAUDE.md rule 7).
 * A commander may write today … today+7, and only until 23:59 on the day itself.
 * HR may write any day, including past ones, and may change a finalized day (SPEC §4, F9b).
 */
async function assertDateWritable(
  tx: Tx,
  isHr: boolean, // admin AND HR scope for this soldier — never admin role alone
  date: string,
  finalizedAt: string | null,
) {
  if (finalizedAt !== null && !isHr) throw new ApiError('DAY_FINALIZED');

  const [t] = await tx.execute<{ offset: number; past_lock: boolean }>(
    sql`select (${date}::date - app_today())::int as offset,
               (now() at time zone 'Asia/Jerusalem')::time >= time '23:59' as past_lock`,
  );
  const offset = Number(t?.offset);
  if (offset > FUTURE_WINDOW_DAYS) throw new ApiError('OUT_OF_WINDOW');
  if (isHr) return;
  if (offset < 0) throw new ApiError('DAY_LOCKED');
  if (offset === 0 && t?.past_lock) throw new ApiError('DAY_LOCKED');
}

// ---------- stage 2: HR finalization (F9b) ----------

/**
 * Closes the day. HR only — `assertHr` for the role, `assertCanActOn` for the assigned-unit
 * scope (SECURITY.md §4). All-or-nothing, like approve.
 */
export function finalizeReports(actor: AuthUser, reportIds: string[]): Promise<number> {
  assertHr(actor);
  const ids = [...new Set(reportIds)];
  return db.transaction(async (tx) => {
    const rows = await loadForBulk(tx, actor, ids);
    await assertHrScope(tx, actor, rows);
    await tx
      .update(reports)
      .set({ finalizedBy: actor.id, finalizedAt: sql`now()` })
      .where(inArray(reports.id, ids));
    await tx.insert(reportAudit).values(rows.map((r) => auditRow(r, 'finalize', actor.id)));
    return ids.length;
  });
}

/** Re-opens a day. HR only, and audited like every other HR write (SPEC §9 row 7). */
export function unfinalizeReport(actor: AuthUser, reportId: string): Promise<void> {
  assertHr(actor);
  return db.transaction(async (tx) => {
    const [row] = await loadForBulk(tx, actor, [reportId]);
    if (!row) throw new ApiError('FORBIDDEN');
    await assertHrScope(tx, actor, [row]);
    await tx
      .update(reports)
      .set({ finalizedBy: null, finalizedAt: null })
      .where(eq(reports.id, reportId));
    await tx.insert(reportAudit).values(auditRow(row, 'unfinalize', actor.id));
  });
}

// Finalizing is HR's power over its assigned units, not over soldiers the actor commands.
async function assertHrScope(tx: Tx, actor: AuthUser, rows: { userId: string }[]) {
  const ok = await inHrScope(actor.id, rows.map((r) => r.userId), tx as unknown as Executor);
  if (!ok) throw new ApiError('FORBIDDEN');
}

type BulkRow = {
  id: string;
  userId: string;
  reportDate: string;
  reasonId: number;
  finalizedAt: string | null;
};

/** Loads the reports for a bulk action, refusing the whole call if any is unreachable. */
async function loadForBulk(tx: Tx, actor: AuthUser, ids: string[]): Promise<BulkRow[]> {
  const rows = await tx
    .select({
      id: reports.id,
      userId: reports.userId,
      reportDate: reports.reportDate,
      reasonId: reports.reasonId,
      finalizedAt: reports.finalizedAt,
    })
    .from(reports)
    .where(inArray(reports.id, ids));
  // A missing id is refused as out of scope, so the response can't be used to probe which
  // report ids exist.
  if (rows.length !== ids.length) throw new ApiError('FORBIDDEN');
  await assertCanActOn(actor.id, { soldierIds: rows.map((r) => r.userId) }, tx as unknown as Executor);
  return rows;
}

const auditRow = (r: BulkRow, action: string, actorId: string) => ({
  reportId: r.id,
  userId: r.userId,
  reportDate: r.reportDate,
  action,
  actorId,
  oldReasonId: r.reasonId,
  newReasonId: r.reasonId,
});

// ---------- favorites (star = pin to top, SPEC §9 row 3) ----------

export async function setFavorite(actor: AuthUser, soldierId: string, on: boolean): Promise<void> {
  await assertCanActOn(actor.id, { soldierId });
  if (on) {
    await db
      .insert(favorites)
      .values({ commanderId: actor.id, soldierId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(favorites)
      .where(and(eq(favorites.commanderId, actor.id), eq(favorites.soldierId, soldierId)));
  }
}

// ---------- document access ----------

/** The owner decides who may see it; the path is only used to sign a URL, never returned. */
export async function loadDocument(documentId: string): Promise<{
  ownerId: string;
  storagePath: string;
}> {
  const [doc] = await db
    .select({ ownerId: documents.ownerId, storagePath: documents.storagePath })
    .from(documents)
    .where(eq(documents.id, documentId));
  if (!doc) throw new ApiError('NOT_FOUND');
  return doc;
}
