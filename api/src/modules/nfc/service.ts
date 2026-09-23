import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  NFC_DUPLICATE_WINDOW_SECONDS,
  NFC_PRESENCE_RESULTS,
  NFC_SCAN_RESULTS,
  type CreateNfcReaderResponse,
  type NfcCardEnrollmentResponse,
  type SpeedgateScanResponse,
} from '@doch1/shared';
import { db } from '../../db/client';
import {
  baseVisits,
  bases,
  nfcPresenceDays,
  nfcReaders,
  nfcScanEvents,
  reportAudit,
  reports,
  statusReasons,
  userNfcCards,
  users,
} from '../../db/schema';
import { ApiError } from '../../plugins/errors';
import type { AuthUser } from '../../plugins/types';
import { assertHr, inHrScope, type Executor } from '../commander/access';
import { cardFingerprint, newReaderSecret, serialLast4, sha256Hex } from './crypto';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ScanResult = (typeof NFC_SCAN_RESULTS)[number];
type PresenceResult = (typeof NFC_PRESENCE_RESULTS)[number];
type Visit = { id: string; baseId: string; enteredAt: string; exitedAt: string | null };
type ReportDay = SpeedgateScanResponse['reportDays'][number];

const iso = (v: string) => new Date(v).toISOString();
const ex = (tx: Tx) => tx as unknown as Executor;

// ---------- enrollment (HR only) ----------

/**
 * Card enrollment is an HR power: admin role AND the soldier inside the actor's HR-assigned units
 * (`is_in_hr_scope`) — never the command chain (SECURITY.md §4). An unknown personal number and an
 * out-of-scope one both answer 403, so the route can't be used to probe the roster.
 */
async function soldierInHrScope(tx: Tx, actor: AuthUser, personalNumber: string): Promise<string> {
  assertHr(actor);
  const [u] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.personalNumber, personalNumber))
    .limit(1);
  if (!u || !(await inHrScope(actor.id, [u.id], ex(tx)))) throw new ApiError('FORBIDDEN');
  return u.id;
}

const lockKey = (tx: Tx, key: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);

export function enrollCard(
  actor: AuthUser,
  body: { personalNumber: string; calypsoSerial: string },
): Promise<NfcCardEnrollmentResponse> {
  return db.transaction(async (tx) => {
    const userId = await soldierInHrScope(tx, actor, body.personalNumber);
    const fingerprint = cardFingerprint(body.calypsoSerial);
    await lockKey(tx, `nfc-card:${fingerprint}`);

    const [existing] = await tx
      .select()
      .from(userNfcCards)
      .where(eq(userNfcCards.serialFingerprint, fingerprint))
      .for('update');
    if (existing && existing.revokedAt === null) {
      if (existing.userId !== userId) throw new ApiError('NFC_CARD_ALREADY_ENROLLED');
      return toEnrollment(existing); // same card, same soldier: idempotent
    }

    // One active card per soldier: enrolling a new card replaces the previous one.
    await tx
      .update(userNfcCards)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(userNfcCards.userId, userId), isNull(userNfcCards.revokedAt)));

    const values = {
      userId,
      serialLast4: serialLast4(body.calypsoSerial),
      enrolledBy: actor.id,
      enrolledAt: sql`now()`,
      revokedAt: null,
    };
    // A previously revoked card keeps its row (fingerprints are unique) and is re-activated.
    const [row] = existing
      ? await tx.update(userNfcCards).set(values).where(eq(userNfcCards.id, existing.id)).returning()
      : await tx.insert(userNfcCards).values({ ...values, serialFingerprint: fingerprint }).returning();
    return toEnrollment(row!);
  });
}

const toEnrollment = (r: { userId: string; serialLast4: string; enrolledAt: string }) => ({
  userId: r.userId,
  serialLast4: r.serialLast4,
  enrolledAt: iso(r.enrolledAt),
});

export function revokeCard(actor: AuthUser, personalNumber: string): Promise<void> {
  return db.transaction(async (tx) => {
    const userId = await soldierInHrScope(tx, actor, personalNumber);
    const revoked = await tx
      .update(userNfcCards)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(userNfcCards.userId, userId), isNull(userNfcCards.revokedAt)))
      .returning({ id: userNfcCards.id });
    if (revoked.length === 0) throw new ApiError('NOT_FOUND');
  });
}

// ---------- reader provisioning (HR only) ----------

export async function createReader(
  actor: AuthUser,
  body: { baseCode: string; name: string },
): Promise<CreateNfcReaderResponse> {
  assertHr(actor);
  const [base] = await db
    .select({ id: bases.id, code: bases.code, name: bases.name })
    .from(bases)
    .where(and(eq(bases.code, body.baseCode), eq(bases.isActive, true)))
    .limit(1);
  if (!base) throw new ApiError('NOT_FOUND');
  const secret = newReaderSecret();
  const [reader] = await db
    .insert(nfcReaders)
    .values({ baseId: base.id, name: body.name, keyHash: sha256Hex(secret) })
    .returning({ id: nfcReaders.id });
  // The only time the secret leaves the server. The device keeps it in Android Keystore.
  return { readerId: reader!.id, readerToken: `${reader!.id}.${secret}`, base };
}

// ---------- speedgate scan (reader-authenticated) ----------

type Outcome = {
  result: ScanResult;
  cardId?: string;
  /** Recorded on the scan event. May be set while `soldier` is null (identity withheld). */
  userId?: string;
  /** Shown to the reader — null for unknown cards and inactive users. */
  soldier?: { id: string; firstName: string; lastName: string } | null;
  visit?: Visit | null;
  present: boolean;
  reportDays?: ReportDay[];
};

/**
 * One physical scan, in one transaction. The first scan of a card opens a visit at the reader's
 * base; the next one (after the duplicate window) closes it and reconciles a report for every
 * Jerusalem calendar date the visit touched. Manual, commander, HR, integration and finalized
 * reports are never overwritten — they are recorded as conflicts.
 */
export function scan(
  reader: { id: string; baseId: string },
  body: { calypsoSerial: string; requestId: string },
): Promise<SpeedgateScanResponse> {
  const fingerprint = cardFingerprint(body.calypsoSerial);
  return db.transaction(async (tx) => {
    // Retries of one physical scan are serialized and answered from the first result.
    await lockKey(tx, `nfc-scan:${reader.id}:${body.requestId}`);
    const [prior] = await tx
      .select()
      .from(nfcScanEvents)
      .where(and(eq(nfcScanEvents.readerId, reader.id), eq(nfcScanEvents.requestId, body.requestId)))
      .limit(1);
    if (prior) return replay(tx, reader, prior);

    await tx.update(nfcReaders).set({ lastSeenAt: sql`now()` }).where(eq(nfcReaders.id, reader.id));
    const outcome = await decide(tx, reader, fingerprint);

    const [event] = await tx
      .insert(nfcScanEvents)
      .values({
        readerId: reader.id,
        baseId: reader.baseId,
        cardId: outcome.cardId ?? null,
        userId: outcome.userId ?? outcome.soldier?.id ?? null,
        cardFingerprint: fingerprint,
        requestId: body.requestId,
        result: outcome.result,
        visitId: outcome.visit?.id ?? null,
      })
      .returning({ scannedAt: nfcScanEvents.scannedAt });
    return respond(tx, reader, event!.scannedAt, outcome);
  });
}

async function decide(tx: Tx, reader: { baseId: string }, fingerprint: string): Promise<Outcome> {
  // Locking the card row serializes concurrent scans of the same card across all readers.
  const [card] = await tx
    .select({ id: userNfcCards.id, userId: userNfcCards.userId })
    .from(userNfcCards)
    .where(and(eq(userNfcCards.serialFingerprint, fingerprint), isNull(userNfcCards.revokedAt)))
    .for('update');
  if (!card) return { result: 'unknown_card', present: false };

  const [soldier] = await tx
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, card.userId));
  // Identity is withheld for inactive users; the event still records who it was.
  if (!soldier?.isActive)
    return { result: 'inactive_user', cardId: card.id, userId: card.userId, soldier: null, present: false };

  const person = { id: soldier.id, firstName: soldier.firstName, lastName: soldier.lastName };
  const [open] = await tx
    .select({ id: baseVisits.id, baseId: baseVisits.baseId, enteredAt: baseVisits.enteredAt, exitedAt: baseVisits.exitedAt })
    .from(baseVisits)
    .where(and(eq(baseVisits.userId, soldier.id), isNull(baseVisits.exitedAt)))
    .for('update');

  const [recent] = await tx
    .select({ id: nfcScanEvents.id })
    .from(nfcScanEvents)
    .where(
      and(
        eq(nfcScanEvents.cardId, card.id),
        inArray(nfcScanEvents.result, ['entry', 'exit']),
        sql`${nfcScanEvents.scannedAt} > now() - make_interval(secs => ${NFC_DUPLICATE_WINDOW_SECONDS})`,
      ),
    )
    .limit(1);
  // A second tap within the window is the same person at the same gate — it must not exit them.
  if (recent) return { result: 'duplicate', cardId: card.id, soldier: person, visit: open ?? null, present: !!open };

  if (!open) {
    const [visit] = await tx
      .insert(baseVisits)
      .values({ baseId: reader.baseId, userId: soldier.id, cardId: card.id })
      .returning({ id: baseVisits.id, baseId: baseVisits.baseId, enteredAt: baseVisits.enteredAt, exitedAt: baseVisits.exitedAt });
    // "Open visit = present": the entry day is reflected immediately, the rest at exit.
    const reportDays = await reconcile(tx, soldier.id, visit!);
    return { result: 'entry', cardId: card.id, soldier: person, visit: visit!, present: true, reportDays };
  }
  if (open.baseId !== reader.baseId)
    return { result: 'wrong_base', cardId: card.id, soldier: person, visit: open, present: true };

  const [closed] = await tx
    .update(baseVisits)
    .set({ exitedAt: sql`now()` })
    .where(eq(baseVisits.id, open.id))
    .returning({ id: baseVisits.id, baseId: baseVisits.baseId, enteredAt: baseVisits.enteredAt, exitedAt: baseVisits.exitedAt });
  const reportDays = await reconcile(tx, soldier.id, closed!);
  return { result: 'exit', cardId: card.id, soldier: person, visit: closed!, present: false, reportDays };
}

/**
 * For every Asia/Jerusalem calendar date from entry through exit (entry date only while open):
 * no report → create `present` (source `nfc`, audited); `present` → already_present; anything
 * else → conflict / finalized_conflict. Existing reports are never changed. Dates already
 * recorded for this visit keep their first result.
 */
async function reconcile(tx: Tx, userId: string, visit: Visit): Promise<ReportDay[]> {
  const dates = await tx.execute<{ d: string }>(sql`
    select g::date::text as d
    from generate_series(
      (${visit.enteredAt}::timestamptz at time zone 'Asia/Jerusalem')::date,
      (coalesce(${visit.exitedAt}::timestamptz, ${visit.enteredAt}::timestamptz) at time zone 'Asia/Jerusalem')::date,
      interval '1 day') as g
    order by 1`);
  const done = new Map(
    (
      await tx
        .select({ date: nfcPresenceDays.reportDate, result: nfcPresenceDays.result })
        .from(nfcPresenceDays)
        .where(eq(nfcPresenceDays.visitId, visit.id))
    ).map((r) => [r.date, r.result as PresenceResult]),
  );
  const [present] = await tx
    .select({ id: statusReasons.id })
    .from(statusReasons)
    .where(eq(statusReasons.code, 'present'));

  const out: ReportDay[] = [];
  for (const { d: date } of dates) {
    const recorded = done.get(date);
    if (recorded) {
      out.push({ date, result: recorded });
      continue;
    }
    // Insert-if-absent: a report the soldier sends concurrently wins, and is classified below.
    const [created] = await tx
      .insert(reports)
      .values({
        userId,
        reportDate: date,
        reasonId: present!.id,
        source: 'nfc',
        reportedBy: userId,
        lastModifiedBy: userId,
      })
      .onConflictDoNothing({ target: [reports.userId, reports.reportDate] })
      .returning({ id: reports.id });

    let result: PresenceResult;
    let reportId: string;
    if (created) {
      await tx.insert(reportAudit).values({
        reportId: created.id,
        userId,
        reportDate: date,
        action: 'create',
        actorId: userId,
        newReasonId: present!.id,
      });
      result = 'created';
      reportId = created.id;
    } else {
      const [existing] = await tx
        .select({ id: reports.id, reasonId: reports.reasonId, finalizedAt: reports.finalizedAt })
        .from(reports)
        .where(and(eq(reports.userId, userId), eq(reports.reportDate, date)));
      reportId = existing!.id;
      result =
        existing!.reasonId === present!.id ? 'already_present'
        : existing!.finalizedAt !== null ? 'finalized_conflict'
        : 'conflict';
    }
    await tx.insert(nfcPresenceDays).values({ visitId: visit.id, reportDate: date, reportId, result });
    out.push({ date, result });
  }
  return out;
}

async function respond(
  tx: Tx,
  reader: { baseId: string },
  scannedAt: string,
  o: Outcome,
): Promise<SpeedgateScanResponse> {
  const [base] = await tx
    .select({ id: bases.id, code: bases.code, name: bases.name })
    .from(bases)
    .where(eq(bases.id, reader.baseId));
  return {
    result: o.result,
    scannedAt: iso(scannedAt),
    base: base!,
    soldier: o.soldier ? { id: o.soldier.id, firstName: o.soldier.firstName, lastName: o.soldier.lastName } : null,
    present: o.present,
    visit: o.visit
      ? { id: o.visit.id, enteredAt: iso(o.visit.enteredAt), exitedAt: o.visit.exitedAt ? iso(o.visit.exitedAt) : null }
      : null,
    reportDays: o.reportDays ?? [],
  };
}

/** A retried request gets the first answer again; nothing is re-applied. */
async function replay(
  tx: Tx,
  reader: { baseId: string },
  prior: typeof nfcScanEvents.$inferSelect,
): Promise<SpeedgateScanResponse> {
  const result = prior.result as ScanResult;
  const withheld = result === 'unknown_card' || result === 'inactive_user';
  const [soldier] = prior.userId && !withheld
    ? await tx
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, prior.userId))
    : [];
  const [visit] = prior.visitId
    ? await tx
        .select({ id: baseVisits.id, baseId: baseVisits.baseId, enteredAt: baseVisits.enteredAt, exitedAt: baseVisits.exitedAt })
        .from(baseVisits)
        .where(eq(baseVisits.id, prior.visitId))
    : [];
  let reportDays: ReportDay[] = [];
  if (visit && (result === 'entry' || result === 'exit')) {
    const rows = await tx
      .select({ date: nfcPresenceDays.reportDate, result: nfcPresenceDays.result })
      .from(nfcPresenceDays)
      .where(eq(nfcPresenceDays.visitId, visit.id))
      .orderBy(nfcPresenceDays.reportDate);
    const entryDay = (await tx.execute<{ d: string }>(
      sql`select (${visit.enteredAt}::timestamptz at time zone 'Asia/Jerusalem')::date::text as d`,
    ))[0]!.d;
    reportDays = rows
      .filter((r) => result === 'exit' || r.date === entryDay)
      .map((r) => ({ date: r.date, result: r.result as PresenceResult }));
  }
  const present = soldier
    ? (
        await tx
          .select({ id: baseVisits.id })
          .from(baseVisits)
          .where(and(eq(baseVisits.userId, soldier.id), isNull(baseVisits.exitedAt)))
          .orderBy(desc(baseVisits.enteredAt))
          .limit(1)
      ).length > 0
    : false;
  return respond(tx, reader, prior.scannedAt, {
    result,
    soldier: soldier ?? null,
    visit: visit ?? null,
    present,
    reportDays,
  });
}
