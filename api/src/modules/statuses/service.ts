import { asc, sql } from 'drizzle-orm';
import { CATEGORY_CODES, type CategoryCode, type StatusesResponse } from '@doch1/shared';
import { db } from '../../db/client';
import { statusCategories, statusReasons } from '../../db/schema';
import type { AuthUser } from '../../plugins/types';
import { scopeGroupIds } from '../commander/access';

const isCategoryCode = (c: string): c is CategoryCode =>
  (CATEGORY_CODES as readonly string[]).includes(c);

// Commander-only reasons are for users who report for others: commanders and HR (role 'admin'
// plus an hr_assignments row). Same scope definition as assertCanActOn (C1, db/init.sql CTEs).
async function mayUseCommanderOnlyReasons(user: AuthUser): Promise<boolean> {
  const rows = await db.execute<{ ok: boolean }>(
    sql`select exists (${scopeGroupIds(user.id)}) as ok`,
  );
  return rows[0]?.ok === true;
}

export async function getStatuses(user: AuthUser): Promise<StatusesResponse> {
  const [categories, reasons, full] = await Promise.all([
    db.select().from(statusCategories).orderBy(asc(statusCategories.sortOrder)),
    db
      .select()
      .from(statusReasons)
      .orderBy(asc(statusReasons.categoryId), asc(statusReasons.sortOrder)),
    mayUseCommanderOnlyReasons(user),
  ]);

  return {
    categories: categories
      .filter((c) => isCategoryCode(c.code))
      .map((c) => ({
        id: c.id,
        code: c.code as CategoryCode,
        nameHe: c.nameHe,
        icon: c.icon,
        reasons: reasons
          .filter((r) => r.categoryId === c.id && (full || !r.commanderOnly))
          .map((r) => ({
            id: r.id,
            code: r.code,
            nameHe: r.nameHe,
            requiresDocument: r.requiresDocument,
            allowsNote: r.allowsNote,
            commanderOnly: r.commanderOnly,
          })),
      })),
  };
}
