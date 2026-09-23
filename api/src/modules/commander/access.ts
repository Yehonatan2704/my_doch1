import { and, inArray, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { db } from '../../db/client';
import { users } from '../../db/schema';
import { ApiError } from '../../plugins/errors';
import type { AuthUser } from '../../plugins/types';

// The recursive CTEs live in db/init.sql as `commander_group_ids` / `hr_group_ids` /
// `can_act_on` (SECURITY.md §4). Calling them keeps one definition of scope for the API
// and the DB instead of two that can drift apart.

/** The logged-in user. The auth hook sets it on every non-public route. */
export function currentUser(request: FastifyRequest): AuthUser {
  if (!request.user) throw new ApiError('UNAUTHORIZED');
  return request.user;
}

/** Groups the actor reaches: commanded groups + HR-assigned units, each with its whole subtree. */
const scopeGroupIds = (actorId: string) => sql`
  select id from commander_group_ids(${actorId}) as id
  union
  select id from hr_group_ids(${actorId}) as id`;

/** A write runs its scope check inside its own transaction, so pass the `tx` when you have one. */
export type Executor = Pick<typeof db, 'select' | 'execute'>;

export async function canActOnSoldier(
  actorId: string,
  soldierId: string,
  ex: Executor = db,
): Promise<boolean> {
  const rows = await ex.execute<{ ok: boolean }>(
    sql`select can_act_on(${actorId}, ${soldierId}) as ok`,
  );
  return rows[0]?.ok === true;
}

export async function canActOnGroup(
  actorId: string,
  groupId: string,
  ex: Executor = db,
): Promise<boolean> {
  const rows = await ex.execute<{ ok: boolean }>(
    sql`select exists (select 1 from (${scopeGroupIds(actorId)}) s where s.id = ${groupId}) as ok`,
  );
  return rows[0]?.ok === true;
}

export type ActTarget = { soldierId: string } | { groupId: string } | { soldierIds: string[] };

/**
 * The single check before touching someone else's data. Bulk targets are all-or-nothing:
 * one id out of scope rejects the whole call (SECURITY.md §4).
 */
export async function assertCanActOn(
  actorId: string,
  target: ActTarget,
  ex: Executor = db,
): Promise<void> {
  const ok =
    'soldierId' in target ? await canActOnSoldier(actorId, target.soldierId, ex)
    : 'groupId' in target ? await canActOnGroup(actorId, target.groupId, ex)
    : await canActOnAllSoldiers(actorId, target.soldierIds, ex);
  if (!ok) throw new ApiError('FORBIDDEN');
}

async function canActOnAllSoldiers(
  actorId: string,
  soldierIds: string[],
  ex: Executor,
): Promise<boolean> {
  const unique = [...new Set(soldierIds)];
  if (unique.length === 0) return false;
  const rows = await ex
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, unique), sql`can_act_on(${actorId}, ${users.id})`));
  return rows.length === unique.length;
}

/** HR-only powers (past days, finalize/un-finalize) need the admin role on top of HR scope. */
export function assertHr(actor: AuthUser): void {
  if (actor.role !== 'admin') throw new ApiError('FORBIDDEN');
}

/**
 * HR scope only (`is_in_hr_scope`), never the command chain: an admin who also commands a group
 * must not get HR powers over soldiers they merely command (SECURITY.md §4).
 */
export async function inHrScope(actorId: string, soldierIds: string[], ex: Executor = db) {
  const unique = [...new Set(soldierIds)];
  if (unique.length === 0) return false;
  const rows = await ex
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, unique), sql`is_in_hr_scope(${actorId}, ${users.id})`));
  return rows.length === unique.length;
}

export { scopeGroupIds };
