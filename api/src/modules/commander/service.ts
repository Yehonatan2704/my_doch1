import { and, asc, eq, inArray, isNull, isNotNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  NOT_REPORTED_FILTER,
  type CategoryCode,
  type GroupNode,
  type GroupReportRow,
  type GroupReportsResponse,
  type Report,
  type ReportSource,
} from '@doch1/shared';
import { db } from '../../db/client';
import {
  emergencyEvents,
  favorites,
  groups,
  reports,
  statusCategories,
  statusReasons,
  users,
} from '../../db/schema';
import { ApiError } from '../../plugins/errors';
import { scopeGroupIds } from './access';

type GroupRow = { id: string; name: string; code: string; parentId: string | null };

/**
 * The actor's groups as a tree: for a commander the groups they command plus everything
 * below them, for an HR user the assigned units plus everything below those.
 * ASSUMPTION: a user who is neither gets an empty list rather than a 403 — the route leaks
 * nothing, and it lets the client render the "not a commander" state (F8/E6). SPEC §9 row 17.
 */
export async function listMyGroups(actorId: string): Promise<GroupNode[]> {
  const rows: GroupRow[] = await db
    .select({ id: groups.id, name: groups.name, code: groups.code, parentId: groups.parentId })
    .from(groups)
    .where(inArray(groups.id, sql`(${scopeGroupIds(actorId)})`))
    .orderBy(asc(groups.name));

  return buildTree(rows);
}

// ---------- F8: group reports ----------

export type GroupReportsOptions = {
  date?: string;
  includeSub: boolean;
  pending: boolean;
  q?: string;
  category?: string;
  sort: 'name' | 'category';
};

const reportedBy = alias(users, 'reported_by_user');
const modifiedBy = alias(users, 'modified_by_user');
const approvedBy = alias(users, 'approved_by_user');
const finalizedBy = alias(users, 'finalized_by_user');

// Asia/Jerusalem "today", from the DB (db/init.sql app_today()) — never the server's local clock.
const appToday = sql<string>`app_today()`;

/** Only a commander/HR sees this list, and only for a group they already passed assertCanActOn on. */
export async function getGroupReports(
  actorId: string,
  groupId: string,
  opts: GroupReportsOptions,
): Promise<GroupReportsResponse> {
  // The actor's scope is subtree-closed, so everything below an allowed group is allowed too.
  const groupIds =
    opts.includeSub ? sql`(select id from group_subtree(${groupId}) as id)` : sql`(${groupId}::uuid)`;
  const date = opts.date ?? (await currentDate());
  // Never the actor themselves — same rule as can_act_on(), so "select all → approve" can't include
  // a row the approve call would reject.
  const inScope = and(inArray(users.groupId, groupIds), eq(users.isActive, true), ne(users.id, actorId));
  const onDate = and(eq(reports.userId, users.id), eq(reports.reportDate, date));

  const [rows, counts, openEmergencyId] = await Promise.all([
    selectRows(actorId, inScope, onDate, opts),
    selectCounts(inScope, onDate),
    findOpenEmergency(groupId),
  ]);
  return { date, counts, openEmergencyId, rows };
}

async function currentDate(): Promise<string> {
  const [row] = await db.execute<{ today: string }>(sql`select ${appToday} as today`);
  return String(row?.today);
}

const selectRows = (
  actorId: string,
  inScope: ReturnType<typeof and>,
  onDate: ReturnType<typeof and>,
  opts: GroupReportsOptions,
) => rowQuery(actorId, inScope, onDate, opts).then((raw) => raw.map(toRow));

function rowQuery(
  actorId: string,
  inScope: ReturnType<typeof and>,
  onDate: ReturnType<typeof and>,
  opts: GroupReportsOptions,
) {
  const isFavorite = sql<boolean>`${favorites.commanderId} is not null`;
  return db
    .select({
      soldier: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        groupId: users.groupId,
        groupName: groups.name,
      },
      isFavorite,
      report: {
        id: reports.id,
        date: reports.reportDate,
        note: reports.note,
        documentId: reports.documentId,
        source: reports.source,
        createdAt: reports.createdAt,
        updatedAt: reports.updatedAt,
        approvedAt: reports.approvedAt,
        finalizedAt: reports.finalizedAt,
      },
      reason: {
        id: statusReasons.id,
        code: statusReasons.code,
        nameHe: statusReasons.nameHe,
        categoryCode: statusCategories.code,
      },
      reportedBy: { id: reportedBy.id, firstName: reportedBy.firstName, lastName: reportedBy.lastName },
      modifiedBy: { id: modifiedBy.id, firstName: modifiedBy.firstName, lastName: modifiedBy.lastName },
      approvedBy: { id: approvedBy.id, firstName: approvedBy.firstName, lastName: approvedBy.lastName },
      finalizedBy: {
        id: finalizedBy.id,
        firstName: finalizedBy.firstName,
        lastName: finalizedBy.lastName,
      },
    })
    .from(users)
    .innerJoin(groups, eq(groups.id, users.groupId))
    .leftJoin(reports, onDate)
    .leftJoin(statusReasons, eq(statusReasons.id, reports.reasonId))
    .leftJoin(statusCategories, eq(statusCategories.id, statusReasons.categoryId))
    .leftJoin(reportedBy, eq(reportedBy.id, reports.reportedBy))
    .leftJoin(modifiedBy, eq(modifiedBy.id, reports.lastModifiedBy))
    .leftJoin(approvedBy, eq(approvedBy.id, reports.approvedBy))
    .leftJoin(finalizedBy, eq(finalizedBy.id, reports.finalizedBy))
    .leftJoin(favorites, and(eq(favorites.commanderId, actorId), eq(favorites.soldierId, users.id)))
    .where(and(inScope, ...filters(opts)))
    // Starred soldiers pin to the top (SPEC §9 row 3), then the requested sort.
    .orderBy(sql`${isFavorite} desc`, ...sortColumns(opts.sort));
}

type RawRow = Awaited<ReturnType<typeof rowQuery>>[number];

function filters(opts: GroupReportsOptions) {
  const where = [];
  if (opts.pending) where.push(and(isNotNull(reports.id), isNull(reports.approvedAt)));
  if (opts.category === NOT_REPORTED_FILTER) where.push(isNull(reports.id));
  else if (opts.category) where.push(eq(statusCategories.code, opts.category));
  if (opts.q) {
    // LIKE metacharacters are escaped, then the value is bound — never interpolated (SECURITY.md §1).
    const pattern = `%${opts.q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push(
      or(
        sql`${users.firstName} ilike ${pattern}`,
        sql`${users.lastName} ilike ${pattern}`,
        sql`(${users.firstName} || ' ' || ${users.lastName}) ilike ${pattern}`,
      ),
    );
  }
  return where;
}

// Server-side allowlist: a client string never reaches the ORDER BY (SECURITY.md §1).
const SORTS = {
  name: [asc(users.lastName), asc(users.firstName)],
  category: [sql`${statusCategories.sortOrder} asc nulls last`, asc(users.lastName)],
} as const;
const sortColumns = (sort: 'name' | 'category') => SORTS[sort];

function selectCounts(inScope: ReturnType<typeof and>, onDate: ReturnType<typeof and>) {
  const count = (when: ReturnType<typeof and> | ReturnType<typeof sql>) =>
    sql<number>`count(*) filter (where ${when})::int`;
  return db
    .select({
      total: sql<number>`count(*)::int`,
      present: count(eq(statusCategories.code, 'on_base')),
      away: count(and(isNotNull(reports.id), ne(statusCategories.code, 'on_base'))),
      notReported: count(isNull(reports.id)),
      pendingApproval: count(and(isNotNull(reports.id), isNull(reports.approvedAt))),
    })
    .from(users)
    .leftJoin(reports, onDate)
    .leftJoin(statusReasons, eq(statusReasons.id, reports.reasonId))
    .leftJoin(statusCategories, eq(statusCategories.id, statusReasons.categoryId))
    .where(inScope)
    .then(([c]) => c ?? { total: 0, present: 0, away: 0, notReported: 0, pendingApproval: 0 });
}

/**
 * The emergency toggle on F8. An event covers the viewed group when it was started on that group,
 * or on an ancestor that included its subgroups.
 * ASSUMPTION: the most specific open event wins for display. SPEC §9 row 18.
 */
function findOpenEmergency(groupId: string): Promise<string | null> {
  return db
    .select({ id: emergencyEvents.id })
    .from(emergencyEvents)
    .where(
      and(
        isNull(emergencyEvents.endedAt),
        or(
          eq(emergencyEvents.groupId, groupId),
          and(
            eq(emergencyEvents.includeSubgroups, true),
            sql`${groupId}::uuid in (select id from group_subtree(${emergencyEvents.groupId}) as id)`,
          ),
        ),
      ),
    )
    .orderBy(sql`${emergencyEvents.groupId} = ${groupId}::uuid desc`)
    .limit(1)
    .then(([e]) => e?.id ?? null);
}

// Postgres hands back "2026-09-22 10:00:00+00"; the contract wants ISO 8601 with an offset.
const iso = (v: string | null) => (v === null ? null : new Date(v).toISOString());

function toRow(r: RawRow): GroupReportRow {
  const soldier = {
    id: r.soldier.id,
    firstName: r.soldier.firstName,
    lastName: r.soldier.lastName,
    groupId: String(r.soldier.groupId),
    groupName: r.soldier.groupName,
  };
  return { soldier, isFavorite: r.isFavorite, report: toReport(r, r.soldier.id) };
}

/** A soldier with no report for the day maps to null — F8 shows them as "לא דיווח/ה". */
function toReport(r: Omit<RawRow, 'soldier' | 'isFavorite'>, userId: string): Report | null {
  if (!r.report || !r.reason || !r.reportedBy || !r.modifiedBy) return null;
  return {
    id: r.report.id,
    userId,
    date: String(r.report.date),
    reason: {
      id: Number(r.reason.id),
      code: String(r.reason.code),
      nameHe: String(r.reason.nameHe),
      // Both enums are DB check constraints (db/init.sql), so the column can only hold a valid value.
      categoryCode: r.reason.categoryCode as CategoryCode,
    },
    note: r.report.note,
    documentId: r.report.documentId,
    source: r.report.source as ReportSource,
    reportedBy: r.reportedBy,
    lastModifiedBy: r.modifiedBy,
    createdAt: String(iso(r.report.createdAt)),
    updatedAt: String(iso(r.report.updatedAt)),
    approvedBy: r.approvedBy,
    approvedAt: iso(r.report.approvedAt),
    finalizedBy: r.finalizedBy,
    finalizedAt: iso(r.report.finalizedAt),
  };
}

/** The report a write just produced, in the shape the contract describes. */
export async function getReportById(reportId: string): Promise<Report> {
  const [row] = await db
    .select({
      userId: reports.userId,
      report: {
        id: reports.id,
        date: reports.reportDate,
        note: reports.note,
        documentId: reports.documentId,
        source: reports.source,
        createdAt: reports.createdAt,
        updatedAt: reports.updatedAt,
        approvedAt: reports.approvedAt,
        finalizedAt: reports.finalizedAt,
      },
      reason: {
        id: statusReasons.id,
        code: statusReasons.code,
        nameHe: statusReasons.nameHe,
        categoryCode: statusCategories.code,
      },
      reportedBy: { id: reportedBy.id, firstName: reportedBy.firstName, lastName: reportedBy.lastName },
      modifiedBy: { id: modifiedBy.id, firstName: modifiedBy.firstName, lastName: modifiedBy.lastName },
      approvedBy: { id: approvedBy.id, firstName: approvedBy.firstName, lastName: approvedBy.lastName },
      finalizedBy: {
        id: finalizedBy.id,
        firstName: finalizedBy.firstName,
        lastName: finalizedBy.lastName,
      },
    })
    .from(reports)
    .innerJoin(statusReasons, eq(statusReasons.id, reports.reasonId))
    .innerJoin(statusCategories, eq(statusCategories.id, statusReasons.categoryId))
    .innerJoin(reportedBy, eq(reportedBy.id, reports.reportedBy))
    .innerJoin(modifiedBy, eq(modifiedBy.id, reports.lastModifiedBy))
    .leftJoin(approvedBy, eq(approvedBy.id, reports.approvedBy))
    .leftJoin(finalizedBy, eq(finalizedBy.id, reports.finalizedBy))
    .where(eq(reports.id, reportId));

  const report = row && toReport(row, row.userId);
  if (!report) throw new ApiError('NOT_FOUND');
  return report;
}

function buildTree(rows: GroupRow[]): GroupNode[] {
  const nodes = new Map<string, GroupNode>(
    rows.map((r) => [r.id, { id: r.id, name: r.name, code: r.code, children: [] }]),
  );
  const roots: GroupNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id);
    if (!node) continue;
    // A group whose parent is outside the actor's scope is a root of *their* tree.
    const parent = row.parentId ? nodes.get(row.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
