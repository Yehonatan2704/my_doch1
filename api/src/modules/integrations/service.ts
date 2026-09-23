import { and, asc, eq, inArray, notInArray, or, sql } from 'drizzle-orm';
import {
  INTEGRATION_WINDOW_DAYS,
  SYSTEM_USER_IDS,
  type AnnualLeaveBody,
  type CprSickLeaveBody,
  type IntegrationResult,
  type IntegrationSoldier,
  type IntegrationSystem,
  type ReasonCode,
} from '@doch1/shared';
import { db } from '../../db/client';
import { groups, reportAudit, reports, statusReasons, users } from '../../db/schema';
import { ApiError } from '../../plugins/errors';
import { bestEffort } from '../push/best-effort';
import { notifyReportChanged } from '../push/service';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const SYSTEM_IDS = Object.values(SYSTEM_USER_IDS);

/**
 * The picker the external systems search. Least data: personal number, name, group name. Active
 * soldiers only, never the system users.
 */
export async function listSoldiers(q: string | undefined, limit: number): Promise<IntegrationSoldier[]> {
  const where = [eq(users.isActive, true), notInArray(users.id, SYSTEM_IDS)];
  if (q) {
    // LIKE metacharacters are escaped, then the value is bound — never interpolated (SECURITY.md §1).
    const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push(
      or(
        sql`${users.personalNumber} like ${pattern}`,
        sql`(${users.firstName} || ' ' || ${users.lastName}) ilike ${pattern}`,
      )!,
    );
  }
  return db
    .select({
      personalNumber: users.personalNumber,
      firstName: users.firstName,
      lastName: users.lastName,
      groupName: groups.name,
    })
    .from(users)
    .leftJoin(groups, eq(groups.id, users.groupId))
    .where(and(...where))
    .orderBy(asc(users.lastName), asc(users.firstName))
    .limit(limit);
}

/**
 * CPR (F11): gimelim issued on `issueDate` cover the days after it. `issueDate` must be today in
 * Asia/Jerusalem — ASSUMPTION: SPEC §9 row 30. `days` ≤ CPR_MAX_DAYS keeps the end inside the window.
 */
export async function importCprSickLeave(body: CprSickLeaveBody): Promise<IntegrationResult> {
  const today = await appToday();
  if (body.issueDate !== today) throw new ApiError('INTEGRATION_OUT_OF_WINDOW');
  const dates = await dayRange(1, body.days);
  return applyExternalReports('cpr', body.personalNumber, dates, 'sick_gimelim');
}

/** אנשים בדיגיטל (F12): annual leave for every day from start to end, both inclusive. */
export async function importAnnualLeave(body: AnnualLeaveBody): Promise<IntegrationResult> {
  const [w] = await db.execute<{ from_offset: number; to_offset: number }>(
    sql`select (${body.startDate}::date - app_today())::int as from_offset,
               (${body.endDate}::date - app_today())::int as to_offset`,
  );
  const from = Number(w?.from_offset);
  const to = Number(w?.to_offset);
  if (from < 0 || to > INTEGRATION_WINDOW_DAYS) throw new ApiError('INTEGRATION_OUT_OF_WINDOW');
  const dates = await dayRange(from, to);
  return applyExternalReports('people_digital', body.personalNumber, dates, 'annual_leave');
}

// "Today" comes from the database in Asia/Jerusalem, never from the server clock (CLAUDE.md rule 7).
async function appToday(): Promise<string> {
  const [t] = await db.execute<{ d: string }>(sql`select app_today()::text as d`);
  return String(t?.d);
}

/** today+from … today+to as YYYY-MM-DD, inclusive. */
async function dayRange(from: number, to: number): Promise<string[]> {
  const rows = await db.execute<{ d: string }>(
    sql`select (app_today() + k)::text as d from generate_series(${from}::int, ${to}::int) as k order by k`,
  );
  return rows.map((r) => String(r.d));
}

/**
 * Writes `reasonCode` on every date for the soldier, in one transaction.
 * The external system wins: an existing report is overwritten, even an approved or finalized one,
 * and approval and finalization are cleared, so commanders and HR can still change it later
 * (ASSUMPTION: SPEC §9 row 28). No document is required — the source system is the proof (row 29).
 * Re-sending the same request changes nothing and writes no audit rows.
 */
async function applyExternalReports(
  system: IntegrationSystem,
  personalNumber: string,
  dates: string[],
  reasonCode: ReasonCode,
): Promise<IntegrationResult> {
  const actorId = SYSTEM_USER_IDS[system];
  const outcome = await db.transaction(async (tx) => {
    const [soldier] = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.personalNumber, personalNumber),
          eq(users.isActive, true),
          notInArray(users.id, SYSTEM_IDS),
        ),
      );
    if (!soldier) throw new ApiError('SOLDIER_NOT_FOUND');

    // Two imports for the same soldier at once would race on the (user_id, report_date) unique key.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${soldier.id}))`);

    const [reason] = await tx
      .select({ id: statusReasons.id })
      .from(statusReasons)
      .where(eq(statusReasons.code, reasonCode));
    if (!reason) throw new Error(`status reason ${reasonCode} is not seeded`);

    const existing = await tx
      .select({
        id: reports.id,
        reportDate: reports.reportDate,
        reasonId: reports.reasonId,
        source: reports.source,
        note: reports.note,
        documentId: reports.documentId,
        approvedAt: reports.approvedAt,
        finalizedAt: reports.finalizedAt,
      })
      .from(reports)
      .where(and(eq(reports.userId, soldier.id), inArray(reports.reportDate, dates)));
    const byDate = new Map(existing.map((r) => [r.reportDate, r]));

    const counts = { created: 0, updated: 0, unchanged: 0 };
    for (const date of dates) {
      const row = byDate.get(date);
      if (
        row &&
        row.reasonId === reason.id &&
        row.source === system &&
        row.note === null &&
        row.documentId === null &&
        row.approvedAt === null &&
        row.finalizedAt === null
      ) {
        counts.unchanged++;
        continue;
      }
      const audit = { userId: soldier.id, reportDate: date, actorId, newReasonId: reason.id };
      if (row) {
        await overwrite(tx, row.id, reason.id, system, actorId);
        if (row.finalizedAt !== null) {
          await tx.insert(reportAudit).values({
            ...audit,
            reportId: row.id,
            action: 'unfinalize',
            oldReasonId: row.reasonId,
            newReasonId: row.reasonId,
          });
        }
        await tx
          .insert(reportAudit)
          .values({ ...audit, reportId: row.id, action: 'update', oldReasonId: row.reasonId });
        counts.updated++;
      } else {
        const [created] = await tx
          .insert(reports)
          .values({
            userId: soldier.id,
            reportDate: date,
            reasonId: reason.id,
            source: system,
            reportedBy: actorId,
            lastModifiedBy: actorId,
          })
          .returning({ id: reports.id });
        await tx.insert(reportAudit).values({ ...audit, reportId: created!.id, action: 'create' });
        counts.created++;
      }
    }
    return { soldierId: soldier.id, counts };
  });

  // Outside the transaction: a slow push must not hold it open. ASSUMPTION: SPEC §9 row 31 — the
  // soldier's "changed by משא״ן" toggle covers changes from HR systems.
  if (outcome.counts.created + outcome.counts.updated > 0) {
    await bestEffort(() => notifyReportChanged(outcome.soldierId, 'hr'));
  }
  return { personalNumber, reasonCode, dates, ...outcome.counts };
}

async function overwrite(
  tx: Tx,
  id: string,
  reasonId: number,
  system: IntegrationSystem,
  actorId: string,
): Promise<void> {
  // Fields are picked explicitly (SECURITY.md §2). A note or document belonged to the old reason.
  await tx
    .update(reports)
    .set({
      reasonId,
      note: null,
      documentId: null,
      source: system,
      lastModifiedBy: actorId,
      approvedBy: null,
      approvedAt: null,
      finalizedBy: null,
      finalizedAt: null,
    })
    .where(eq(reports.id, id));
}
