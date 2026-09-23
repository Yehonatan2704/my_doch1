import { eq } from 'drizzle-orm';
import { USER_ROLES, type MeResponse } from '@doch1/shared';
import { db } from '../../db/client';
import { groups, users } from '../../db/schema';
import { ApiError } from '../../plugins/errors';
import type { AuthUser } from '../../plugins/types';

const isRole = (r: string): r is AuthUser['role'] => (USER_ROLES as readonly string[]).includes(r);

// Google email → users row. Unknown → NOT_REGISTERED, inactive → INACTIVE_USER (both 403).
export async function findUserByEmail(rawEmail: string): Promise<AuthUser> {
  const email = rawEmail.trim().toLowerCase();
  const [u] = await db
    .select({ id: users.id, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!u || !isRole(u.role)) throw new ApiError('NOT_REGISTERED');
  if (!u.isActive) throw new ApiError('INACTIVE_USER');
  return { id: u.id, role: u.role };
}

// "Commander" is not a role: a user is a commander if they command >= 1 group (db/init.sql).
export async function getMe(userId: string): Promise<MeResponse> {
  const [[u], [commanded]] = await Promise.all([
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        groupId: groups.id,
        groupName: groups.name,
      })
      .from(users)
      .leftJoin(groups, eq(groups.id, users.groupId))
      .where(eq(users.id, userId))
      .limit(1),
    db.select({ id: groups.id }).from(groups).where(eq(groups.commanderId, userId)).limit(1),
  ]);
  if (!u || !isRole(u.role)) throw new ApiError('NOT_REGISTERED');
  return {
    user: { id: u.id, firstName: u.firstName, lastName: u.lastName, role: u.role },
    isCommander: commanded !== undefined,
    group: u.groupId && u.groupName ? { id: u.groupId, name: u.groupName } : null,
  };
}
