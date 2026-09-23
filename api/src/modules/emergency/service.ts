import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type {
  ActiveEmergenciesResponse,
  EmergencyDetailResponse,
  EmergencyResponseStatus,
} from '@doch1/shared';
import { db } from '../../db/client';
import { emergencyEvents, emergencyResponses, groups, users } from '../../db/schema';
import { ApiError } from '../../plugins/errors';
import type { AuthUser } from '../../plugins/types';
import { assertCanActOn } from '../commander/access';
import { bestEffort } from '../push/best-effort';
import { notifyEmergencyStarted } from '../push/service';

/** Everyone active in the event's scope — the group, plus its subtree when it included one. */
const inScopeOf = (groupId: string, includeSub: boolean) =>
  includeSub ?
    sql`(select id from group_subtree(${groupId}) as id)`
  : sql`(${groupId}::uuid)`;

type Event = {
  id: string;
  groupId: string;
  includeSubgroups: boolean;
  endedAt: string | null;
};

async function loadEvent(id: string): Promise<Event> {
  const [event] = await db
    .select({
      id: emergencyEvents.id,
      groupId: emergencyEvents.groupId,
      includeSubgroups: emergencyEvents.includeSubgroups,
      endedAt: emergencyEvents.endedAt,
    })
    .from(emergencyEvents)
    .where(eq(emergencyEvents.id, id));
  if (!event) throw new ApiError('NOT_FOUND');
  return event;
}

/**
 * Starts a roll-call. Only a commander of the group or an ancestor may do it
 * (SECURITY.md §13), and a group can have one open event at a time.
 */
export async function startEmergency(
  actor: AuthUser,
  body: { groupId: string; includeSub: boolean; message?: string },
): Promise<string> {
  await assertCanActOn(actor.id, { groupId: body.groupId });
  let id: string;
  try {
    const [row] = await db
      .insert(emergencyEvents)
      .values({
        groupId: body.groupId,
        includeSubgroups: body.includeSub,
        startedBy: actor.id,
        message: body.message ?? null,
      })
      .returning({ id: emergencyEvents.id });
    id = String(row?.id);
  } catch (err) {
    // The "one open event per group" rule is a partial unique index in db/init.sql, so the
    // race between two commanders is settled by the database, not by a prior SELECT.
    if (isUniqueViolation(err)) throw new ApiError('EMERGENCY_ALREADY_OPEN');
    throw err;
  }

  // The event exists either way: a push that fails must not fail the roll-call (C5).
  await bestEffort(() => notifyEmergencyStarted(id, body.groupId, body.includeSub, actor.id));
  return id;
}

// Drizzle wraps driver errors in a DrizzleQueryError, so the Postgres SQLSTATE is on `cause`.
const isUniqueViolation = (err: unknown) => sqlState(err) === '23505';

function sqlState(err: unknown): string | undefined {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

export async function endEmergency(actor: AuthUser, id: string): Promise<void> {
  const event = await loadEvent(id);
  await assertCanActOn(actor.id, { groupId: event.groupId });
  if (event.endedAt !== null) throw new ApiError('EMERGENCY_ENDED');
  await db
    .update(emergencyEvents)
    .set({ endedAt: sql`now()`, endedBy: actor.id })
    .where(and(eq(emergencyEvents.id, id), isNull(emergencyEvents.endedAt)));
}

/** The commander's live view: counts plus a row per soldier, most urgent first. */
export async function emergencyDetail(
  actor: AuthUser,
  id: string,
): Promise<EmergencyDetailResponse> {
  const [head] = await db
    .select({
      id: emergencyEvents.id,
      groupId: emergencyEvents.groupId,
      groupName: groups.name,
      includeSub: emergencyEvents.includeSubgroups,
      message: emergencyEvents.message,
      startedAt: emergencyEvents.startedAt,
      endedAt: emergencyEvents.endedAt,
      startedBy: { id: users.id, firstName: users.firstName, lastName: users.lastName },
    })
    .from(emergencyEvents)
    .innerJoin(groups, eq(groups.id, emergencyEvents.groupId))
    .innerJoin(users, eq(users.id, emergencyEvents.startedBy))
    .where(eq(emergencyEvents.id, id));
  if (!head) throw new ApiError('NOT_FOUND');
  await assertCanActOn(actor.id, { groupId: head.groupId });

  const rows = await db
    .select({
      soldier: { id: users.id, firstName: users.firstName, lastName: users.lastName },
      status: emergencyResponses.status,
      respondedAt: emergencyResponses.respondedAt,
    })
    .from(users)
    .leftJoin(
      emergencyResponses,
      and(eq(emergencyResponses.userId, users.id), eq(emergencyResponses.eventId, id)),
    )
    .where(
      and(
        sql`${users.groupId} in ${inScopeOf(head.groupId, head.includeSub)}`,
        eq(users.isActive, true),
      ),
    )
    // Triage order: who needs help, then who hasn't answered, then who is fine.
    // ASSUMPTION: SPEC §9 row 22.
    .orderBy(
      sql`case
            when ${emergencyResponses.status} = 'need_help' then 0
            when ${emergencyResponses.status} is null then 1
            else 2
          end`,
      asc(users.lastName),
    );

  const responses = rows.map((r) => ({
    soldier: r.soldier,
    status: r.status as EmergencyResponseStatus | null,
    respondedAt: r.respondedAt === null ? null : new Date(r.respondedAt).toISOString(),
  }));

  return {
    id: head.id,
    group: { id: head.groupId, name: head.groupName },
    includeSub: head.includeSub,
    message: head.message,
    startedBy: head.startedBy,
    startedAt: new Date(head.startedAt).toISOString(),
    endedAt: head.endedAt === null ? null : new Date(head.endedAt).toISOString(),
    counts: {
      ok: responses.filter((r) => r.status === 'ok').length,
      needHelp: responses.filter((r) => r.status === 'need_help').length,
      noResponse: responses.filter((r) => r.status === null).length,
    },
    responses,
  };
}

/** Open events that cover me — drives the soldier's full-screen banner (F10). */
export async function activeEmergencies(userId: string): Promise<ActiveEmergenciesResponse> {
  const events = await db
    .select({
      id: emergencyEvents.id,
      groupName: groups.name,
      message: emergencyEvents.message,
      startedAt: emergencyEvents.startedAt,
      myResponse: emergencyResponses.status,
    })
    .from(emergencyEvents)
    .innerJoin(groups, eq(groups.id, emergencyEvents.groupId))
    .innerJoin(users, eq(users.id, userId))
    .leftJoin(
      emergencyResponses,
      and(
        eq(emergencyResponses.eventId, emergencyEvents.id),
        eq(emergencyResponses.userId, userId),
      ),
    )
    .where(and(isNull(emergencyEvents.endedAt), coversMe()))
    .orderBy(asc(emergencyEvents.startedAt));

  return {
    events: events.map((e) => ({
      id: e.id,
      groupName: e.groupName,
      message: e.message,
      startedAt: new Date(e.startedAt).toISOString(),
      myResponse: e.myResponse as EmergencyResponseStatus | null,
    })),
  };
}

// My group is the event's group, or sits below it when the event included subgroups.
// The outer parentheses are load-bearing: this is a raw fragment, so without them the `or`
// would escape the surrounding `and` and make ended events look active.
const coversMe = () => sql`(
  ${users.groupId} = ${emergencyEvents.groupId}
  or (${emergencyEvents.includeSubgroups}
      and ${users.groupId} in (select id from group_subtree(${emergencyEvents.groupId}) as id))
)`;

/** Answering, or changing an answer while the event is open. */
export async function respondToEmergency(
  userId: string,
  eventId: string,
  status: EmergencyResponseStatus,
): Promise<void> {
  const event = await loadEvent(eventId);

  // Scope is checked before the event's state, so someone outside it learns nothing about
  // whether it is still open.
  // Being in the event's scope is what grants the right to answer — never a client-sent id.
  const [me] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.isActive, true),
        sql`${users.groupId} in ${inScopeOf(event.groupId, event.includeSubgroups)}`,
      ),
    );
  if (!me) throw new ApiError('FORBIDDEN');
  if (event.endedAt !== null) throw new ApiError('EMERGENCY_ENDED');

  await db
    .insert(emergencyResponses)
    .values({ eventId, userId, status })
    .onConflictDoUpdate({
      target: [emergencyResponses.eventId, emergencyResponses.userId],
      set: { status, respondedAt: sql`now()` },
    });
}
