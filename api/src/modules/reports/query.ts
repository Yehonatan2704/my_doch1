import { asc, eq, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { CategoryCode, Report, ReportSource } from '@doch1/shared';
import { db } from '../../db/client';
import { reports, statusCategories, statusReasons, users } from '../../db/schema';

const reportedBy = alias(users, 'reported_by_user');
const modifiedBy = alias(users, 'modified_by_user');
const approvedBy = alias(users, 'approved_by_user');
const finalizedBy = alias(users, 'finalized_by_user');

// Postgres hands back "2026-09-22 10:00:00+00"; the contract wants ISO 8601.
const iso = (v: string) => new Date(v).toISOString();
const isoOrNull = (v: string | null) => (v === null ? null : iso(v));

/** Reports in the contract's shape (`reportSchema`), both approval stages included, by date. */
export async function selectReports(where: SQL | undefined): Promise<Report[]> {
  const rows = await db
    .select({
      id: reports.id,
      userId: reports.userId,
      date: reports.reportDate,
      reason: {
        id: statusReasons.id,
        code: statusReasons.code,
        nameHe: statusReasons.nameHe,
        categoryCode: statusCategories.code,
      },
      note: reports.note,
      documentId: reports.documentId,
      source: reports.source,
      reportedBy: {
        id: reportedBy.id,
        firstName: reportedBy.firstName,
        lastName: reportedBy.lastName,
      },
      lastModifiedBy: {
        id: modifiedBy.id,
        firstName: modifiedBy.firstName,
        lastName: modifiedBy.lastName,
      },
      createdAt: reports.createdAt,
      updatedAt: reports.updatedAt,
      approvedBy: {
        id: approvedBy.id,
        firstName: approvedBy.firstName,
        lastName: approvedBy.lastName,
      },
      approvedAt: reports.approvedAt,
      finalizedBy: {
        id: finalizedBy.id,
        firstName: finalizedBy.firstName,
        lastName: finalizedBy.lastName,
      },
      finalizedAt: reports.finalizedAt,
    })
    .from(reports)
    .innerJoin(statusReasons, eq(statusReasons.id, reports.reasonId))
    .innerJoin(statusCategories, eq(statusCategories.id, statusReasons.categoryId))
    .innerJoin(reportedBy, eq(reportedBy.id, reports.reportedBy))
    .innerJoin(modifiedBy, eq(modifiedBy.id, reports.lastModifiedBy))
    .leftJoin(approvedBy, eq(approvedBy.id, reports.approvedBy))
    .leftJoin(finalizedBy, eq(finalizedBy.id, reports.finalizedBy))
    .where(where)
    .orderBy(asc(reports.reportDate));

  return rows.map((r) => ({
    ...r,
    // Both are DB check constraints (db/init.sql), so the columns only hold valid values.
    reason: { ...r.reason, categoryCode: r.reason.categoryCode as CategoryCode },
    source: r.source as ReportSource,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    approvedAt: isoOrNull(r.approvedAt),
    finalizedAt: isoOrNull(r.finalizedAt),
  }));
}
