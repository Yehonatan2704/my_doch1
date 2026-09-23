// Mock API for every route in SPEC §6. Requests are validated and responses are parsed with the
// shared contract, so a drift between mock and contract fails loudly instead of silently.
import { http, HttpResponse } from 'msw';
import {
  ALLOWED_MIME,
  CATEGORY_CODES,
  EDIT_LOCK,
  ERROR_HTTP,
  FILE_MAX_BYTES,
  FUTURE_WINDOW_DAYS,
  SIGNED_URL_TTL_SEC,
  activeEmergenciesResponseSchema,
  approveReportsResponseSchema,
  commanderGroupsResponseSchema,
  commanderPutReportBodySchema,
  documentIdParamsSchema,
  documentUrlResponseSchema,
  emergencyDetailResponseSchema,
  finalizeReportsResponseSchema,
  groupIdParamsSchema,
  groupReportsQuerySchema,
  groupReportsResponseSchema,
  idParamsSchema,
  meResponseSchema,
  pushTokenBodySchema,
  putReportBodySchema,
  putReportResponseSchema,
  putSettingsBodySchema,
  putWeekTemplateBodySchema,
  reportDateParamsSchema,
  reportIdParamsSchema,
  reportIdsBodySchema,
  reportsQuerySchema,
  reportsResponseSchema,
  respondEmergencyBodySchema,
  settingsSchema,
  weekTemplateSchema,
  soldierIdParamsSchema,
  soldierReportParamsSchema,
  startEmergencyBodySchema,
  startEmergencyResponseSchema,
  statusesResponseSchema,
  todayReportResponseSchema,
  uploadDocumentResponseSchema,
  type ErrorCode,
  type GroupNode,
  type Report,
} from '@doch1/shared';
import {
  CATEGORIES,
  REASONS,
  defaultWeekTemplate,
  U,
  createDb,
  newId,
  type EmergencyRow,
  type MockDb,
  type MockReason,
  type ReportRow,
} from './fixtures';
import { addDays, atIL, hhmmIL, todayIL } from './time';

const P = '*/api/v1';

const fail = (code: ErrorCode) =>
  HttpResponse.json(
    { error: { code, message: ERROR_HTTP[code].messageHe } },
    { status: ERROR_HTTP[code].status },
  );
const ok = <T,>(schema: { parse(v: unknown): T }, data: T) =>
  HttpResponse.json(schema.parse(data) as Record<string, unknown>);
const noContent = () => new HttpResponse(null, { status: 204 });
const parse = <T,>(schema: { safeParse(v: unknown): { success: boolean; data?: T } }, v: unknown) => {
  const r = schema.safeParse(v);
  return r.success ? (r.data as T) : null;
};
const body = (request: Request) => request.json().catch(() => undefined);
// MSW exposes the leading `*` of the route as params['0']; drop it before strict validation.
const named = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).filter(([k]) => k !== '0'));
const query = (request: Request) => Object.fromEntries(new URL(request.url).searchParams);

export function createHandlers(db: MockDb, me: string, clock: () => Date = () => new Date()) {
  const user = (id: string) => db.users.find((u) => u.id === id);
  const person = (id: string) => {
    const u = user(id)!;
    return { id: u.id, firstName: u.firstName, lastName: u.lastName };
  };
  const personOrNull = (id: string | null) => (id ? person(id) : null);
  const reasonById = (id: number) => REASONS.find((r) => r.id === id);
  const toReport = (r: ReportRow): Report => {
    const reason = reasonById(r.reasonId)!;
    return {
      id: r.id,
      userId: r.userId,
      date: r.date,
      reason: { id: reason.id, code: reason.code, nameHe: reason.nameHe, categoryCode: reason.categoryCode },
      note: r.note,
      documentId: r.documentId,
      source: r.source,
      reportedBy: person(r.reportedBy),
      lastModifiedBy: person(r.lastModifiedBy),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      approvedBy: personOrNull(r.approvedBy),
      approvedAt: r.approvedAt,
      finalizedBy: personOrNull(r.finalizedBy),
      finalizedAt: r.finalizedAt,
    };
  };
  const reportOf = (userId: string, date: string) =>
    db.reports.find((r) => r.userId === userId && r.date === date);

  // ---- scope: same rules as can_act_on() in db/init.sql ----
  const subtree = (root: string) => {
    const out = [root];
    for (let i = 0; i < out.length; i++)
      for (const g of db.groups) if (g.parentId === out[i]) out.push(g.id);
    return out;
  };
  const uniq = <T,>(xs: T[]) => [...new Set(xs)];
  const commanderGroupIds = (u: string) =>
    uniq(db.groups.filter((g) => g.commanderId === u).flatMap((g) => subtree(g.id)));
  const isHr = (u: string) => user(u)?.role === 'admin' && !!user(u)?.isActive;
  const hrGroupIds = (u: string) =>
    isHr(u)
      ? uniq(db.hrAssignments.filter((a) => a.hrUserId === u).flatMap((a) => subtree(a.groupId)))
      : [];
  const inScope = (groupIds: string[], actor: string, target: string) => {
    const t = user(target);
    return !!t && t.id !== actor && t.isActive && !!t.groupId && groupIds.includes(t.groupId);
  };
  const inHrScope = (actor: string, target: string) => inScope(hrGroupIds(actor), actor, target);
  const canActOn = (actor: string, target: string) =>
    inScope(commanderGroupIds(actor), actor, target) || inHrScope(actor, target);

  const eventMembers = (e: EmergencyRow) => {
    const gids = e.includeSub ? subtree(e.groupId) : [e.groupId];
    return db.users.filter((u) => u.isActive && u.groupId && gids.includes(u.groupId));
  };

  const checkReason = (
    reason: MockReason | undefined,
    note: string | undefined,
    documentId: string | undefined,
    asCommander: boolean,
  ): ErrorCode | null => {
    if (!reason || (reason.commanderOnly && !asCommander)) return 'REASON_NOT_ALLOWED';
    if (note && !reason.allowsNote) return 'NOTE_NOT_ALLOWED';
    if (!asCommander && reason.requiresDocument && !documentId) return 'DOCUMENT_REQUIRED';
    return null;
  };

  const upsertReport = (userId: string, date: string, fields: Partial<ReportRow>, now: Date) => {
    const nowIso = now.toISOString();
    const existing = reportOf(userId, date);
    if (existing) return Object.assign(existing, fields, { updatedAt: nowIso });
    const row: ReportRow = {
      id: newId(),
      userId,
      date,
      reasonId: 0,
      note: null,
      documentId: null,
      source: 'self',
      reportedBy: me,
      lastModifiedBy: me,
      createdAt: nowIso,
      updatedAt: nowIso,
      approvedBy: null,
      approvedAt: null,
      finalizedBy: null,
      finalizedAt: null,
      ...fields,
    };
    db.reports.push(row);
    return row;
  };

  const groupTree = (id: string): GroupNode => {
    const g = db.groups.find((x) => x.id === id)!;
    return {
      id: g.id,
      name: g.name,
      code: g.code,
      children: db.groups.filter((c) => c.parentId === id).map((c) => groupTree(c.id)),
    };
  };

  return [
    http.get(`${P}/health`, () => HttpResponse.json({ ok: true })),

    // ---------- soldier ----------
    http.get(`${P}/me`, () => {
      const u = user(me)!;
      const group = db.groups.find((g) => g.id === u.groupId);
      return ok(meResponseSchema, {
        user: { ...person(me), role: u.role },
        isCommander: db.groups.some((g) => g.commanderId === me),
        group: group ? { id: group.id, name: group.name } : null,
      });
    }),

    http.get(`${P}/statuses`, () => {
      const isCommander = db.groups.some((g) => g.commanderId === me) || isHr(me);
      return ok(statusesResponseSchema, {
        categories: CATEGORIES.map((c) => ({
          ...c,
          reasons: REASONS.filter((r) => r.categoryCode === c.code && (isCommander || !r.commanderOnly)).map(
            ({ id, code, nameHe, requiresDocument, allowsNote, commanderOnly }) => ({
              id,
              code,
              nameHe,
              requiresDocument,
              allowsNote,
              commanderOnly,
            }),
          ),
        })),
      });
    }),

    http.get(`${P}/reports/today`, () => {
      const now = clock();
      const today = todayIL(now);
      const deadline = atIL(today, '11:00');
      const row = reportOf(me, today);
      return ok(todayReportResponseSchema, {
        date: today,
        serverTime: now.toISOString(),
        deadline,
        isLate: now.toISOString() > deadline,
        editLockAt: atIL(today, EDIT_LOCK),
        report: row ? toReport(row) : null,
      });
    }),

    http.get(`${P}/reports`, ({ request }) => {
      const q = parse(reportsQuerySchema, query(request));
      if (!q) return fail('VALIDATION_ERROR');
      const rows = db.reports
        .filter((r) => r.userId === me && r.date >= q.from && r.date <= q.to)
        .sort((a, b) => a.date.localeCompare(b.date));
      return ok(reportsResponseSchema, { reports: rows.map(toReport) });
    }),

    http.put(`${P}/reports/:date`, async ({ params, request }) => {
      const p = parse(reportDateParamsSchema, named(params));
      const b = parse(putReportBodySchema, await body(request));
      if (!p || !b) return fail('VALIDATION_ERROR');
      const now = clock();
      const today = todayIL(now);
      if (p.date < today || (p.date === today && hhmmIL(now) >= EDIT_LOCK)) return fail('DAY_LOCKED');
      if (p.date > addDays(today, FUTURE_WINDOW_DAYS)) return fail('OUT_OF_WINDOW');
      if (reportOf(me, p.date)?.finalizedAt) return fail('DAY_FINALIZED');
      const err = checkReason(reasonById(b.reasonId), b.note, b.documentId, false);
      if (err) return fail(err);
      if (b.documentId && !db.documents.some((d) => d.id === b.documentId && d.ownerId === me))
        return fail('FORBIDDEN');
      const row = upsertReport(
        me,
        p.date,
        {
          reasonId: b.reasonId,
          note: b.note ?? null,
          documentId: b.documentId ?? null,
          source: 'self',
          lastModifiedBy: me,
          approvedBy: null, // stage-1 approval resets on soldier edit
          approvedAt: null,
        },
        now,
      );
      return ok(putReportResponseSchema, toReport(row));
    }),

    http.delete(`${P}/reports/:date`, ({ params }) => {
      const p = parse(reportDateParamsSchema, named(params));
      if (!p) return fail('VALIDATION_ERROR');
      if (p.date <= todayIL(clock())) return fail('DAY_LOCKED');
      const row = reportOf(me, p.date);
      if (!row) return fail('NOT_FOUND');
      if (row.finalizedAt) return fail('DAY_FINALIZED');
      db.reports.splice(db.reports.indexOf(row), 1);
      return noContent();
    }),

    http.post(`${P}/documents`, async ({ request }) => {
      // ponytail: RN's fetch polyfill can't parse multipart bodies; on native the mock accepts the
      // upload unchecked. Web and tests validate size/type. The real API checks magic bytes.
      const form = (await request.formData().catch(() => undefined)) as
        | { get(name: string): unknown }
        | undefined; // RN's FormData typing lacks get(); this is a WHATWG Request
      const file = form?.get('file');
      if (form && !(file instanceof Blob)) return fail('VALIDATION_ERROR');
      if (file instanceof Blob) {
        if (file.size > FILE_MAX_BYTES) return fail('FILE_TOO_LARGE');
        if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) return fail('FILE_TYPE_NOT_ALLOWED');
      }
      const doc = {
        id: newId(),
        ownerId: me,
        mimeType: file instanceof Blob ? file.type : 'application/pdf',
        sizeBytes: file instanceof Blob ? file.size : 1,
      };
      db.documents.push(doc);
      return ok(uploadDocumentResponseSchema, { documentId: doc.id });
    }),

    http.get(`${P}/settings`, () => ok(settingsSchema, db.settings.get(me)!)),

    http.put(`${P}/settings`, async ({ request }) => {
      const b = parse(putSettingsBodySchema, await body(request));
      if (!b) return fail('VALIDATION_ERROR');
      const next = { ...db.settings.get(me)!, ...b };
      db.settings.set(me, next);
      return ok(settingsSchema, next);
    }),

    http.get(`${P}/settings/template`, () =>
      ok(weekTemplateSchema, db.templates.get(me) ?? defaultWeekTemplate()),
    ),

    http.put(`${P}/settings/template`, async ({ request }) => {
      const b = parse(putWeekTemplateBodySchema, await body(request));
      if (!b) return fail('VALIDATION_ERROR');
      for (const d of b.days) {
        if (!d) continue;
        const r = reasonById(d.reasonId);
        if (!r) return fail('VALIDATION_ERROR');
        if (r.commanderOnly || r.requiresDocument) return fail('REASON_NOT_ALLOWED');
      }
      const next = { days: b.days.map((d) => (d ? { reasonId: d.reasonId } : null)) };
      db.templates.set(me, next);
      return ok(weekTemplateSchema, next);
    }),

    http.post(`${P}/push-tokens`, async ({ request }) => {
      const b = parse(pushTokenBodySchema, await body(request));
      if (!b) return fail('VALIDATION_ERROR');
      db.pushTokens.set(b.token, { userId: me, platform: b.platform });
      return noContent();
    }),

    http.get(`${P}/emergencies/active`, () =>
      ok(activeEmergenciesResponseSchema, {
        events: db.emergencies
          .filter((e) => !e.endedAt && eventMembers(e).some((u) => u.id === me))
          .map((e) => ({
            id: e.id,
            groupName: db.groups.find((g) => g.id === e.groupId)!.name,
            message: e.message,
            startedAt: e.startedAt,
            myResponse: e.responses.get(me)?.status ?? null,
          })),
      }),
    ),

    http.post(`${P}/emergencies/:id/respond`, async ({ params, request }) => {
      const p = parse(idParamsSchema, named(params));
      const b = parse(respondEmergencyBodySchema, await body(request));
      if (!p || !b) return fail('VALIDATION_ERROR');
      const e = db.emergencies.find((x) => x.id === p.id);
      if (!e) return fail('NOT_FOUND');
      if (!eventMembers(e).some((u) => u.id === me)) return fail('FORBIDDEN');
      if (e.endedAt) return fail('EMERGENCY_ENDED');
      e.responses.set(me, { status: b.status, respondedAt: clock().toISOString() });
      return noContent();
    }),

    // ---------- commander / HR ----------
    http.get(`${P}/commander/groups`, () => {
      const roots = uniq([
        ...db.groups.filter((g) => g.commanderId === me).map((g) => g.id),
        ...(isHr(me) ? db.hrAssignments.filter((a) => a.hrUserId === me).map((a) => a.groupId) : []),
      ]);
      if (!roots.length) return fail('FORBIDDEN');
      const top = roots.filter((r) => !roots.some((o) => o !== r && subtree(o).includes(r)));
      return ok(commanderGroupsResponseSchema, { groups: top.map(groupTree) });
    }),

    http.get(`${P}/commander/groups/:groupId/reports`, ({ params, request }) => {
      const p = parse(groupIdParamsSchema, named(params));
      const q = parse(groupReportsQuerySchema, query(request));
      if (!p || !q) return fail('VALIDATION_ERROR');
      if (![...commanderGroupIds(me), ...hrGroupIds(me)].includes(p.groupId)) return fail('FORBIDDEN');
      const date = q.date ?? todayIL(clock());
      const gids = q.includeSub ? subtree(p.groupId) : [p.groupId];
      const favs = new Set(db.favorites.filter((f) => f.commanderId === me).map((f) => f.soldierId));

      const all = db.users
        .filter((u) => u.groupId && gids.includes(u.groupId) && canActOn(me, u.id))
        .map((u) => {
          const row = reportOf(u.id, date);
          return {
            soldier: {
              ...person(u.id),
              groupId: u.groupId!,
              groupName: db.groups.find((g) => g.id === u.groupId)!.name,
            },
            isFavorite: favs.has(u.id),
            report: row ? toReport(row) : null,
          };
        });

      const present = all.filter((r) => r.report?.reason.categoryCode === 'on_base').length;
      const notReported = all.filter((r) => !r.report).length;
      const counts = {
        total: all.length,
        present,
        away: all.length - present - notReported,
        notReported,
        pendingApproval: all.filter((r) => r.report && !r.report.approvedAt).length,
      };

      const needle = q.q?.toLowerCase();
      const catRank = (r: (typeof all)[number]) =>
        r.report ? CATEGORY_CODES.indexOf(r.report.reason.categoryCode) : CATEGORY_CODES.length;
      const rows = all
        .filter((r) => !q.pending || (r.report && !r.report.approvedAt))
        .filter(
          (r) =>
            !needle ||
            `${r.soldier.firstName} ${r.soldier.lastName}`.toLowerCase().includes(needle),
        )
        .filter(
          (r) =>
            !q.category ||
            (q.category === 'not_reported' ? !r.report : r.report?.reason.categoryCode === q.category),
        )
        .sort(
          (a, b) =>
            Number(b.isFavorite) - Number(a.isFavorite) ||
            (q.sort === 'category' ? catRank(a) - catRank(b) : 0) ||
            a.soldier.lastName.localeCompare(b.soldier.lastName, 'he') ||
            a.soldier.firstName.localeCompare(b.soldier.firstName, 'he'),
        );

      const open = db.emergencies.find((e) => e.groupId === p.groupId && !e.endedAt);
      return ok(groupReportsResponseSchema, { date, counts, openEmergencyId: open?.id ?? null, rows });
    }),

    http.post(`${P}/commander/reports/approve`, async ({ request }) => {
      const b = parse(reportIdsBodySchema, await body(request));
      if (!b) return fail('VALIDATION_ERROR');
      const rows = uniq(b.reportIds).map((id) => db.reports.find((r) => r.id === id));
      if (rows.some((r) => !r || !canActOn(me, r.userId))) return fail('FORBIDDEN');
      if (rows.some((r) => r!.finalizedAt)) return fail('DAY_FINALIZED');
      const nowIso = clock().toISOString();
      for (const r of rows) if (!r!.approvedAt) Object.assign(r!, { approvedBy: me, approvedAt: nowIso });
      return ok(approveReportsResponseSchema, { approvedCount: rows.length });
    }),

    http.put(`${P}/commander/soldiers/:userId/reports/:date`, async ({ params, request }) => {
      const p = parse(soldierReportParamsSchema, named(params));
      const b = parse(commanderPutReportBodySchema, await body(request));
      if (!p || !b) return fail('VALIDATION_ERROR');
      if (!canActOn(me, p.userId)) return fail('FORBIDDEN');
      const asHr = inHrScope(me, p.userId);
      const now = clock();
      const today = todayIL(now);
      if (p.date < today && !asHr) return fail('DAY_LOCKED');
      if (p.date > addDays(today, FUTURE_WINDOW_DAYS)) return fail('OUT_OF_WINDOW');
      if (reportOf(p.userId, p.date)?.finalizedAt && !asHr) return fail('DAY_FINALIZED');
      const err = checkReason(reasonById(b.reasonId), b.note, undefined, true);
      if (err) return fail(err);
      const row = upsertReport(
        p.userId,
        p.date,
        {
          reasonId: b.reasonId,
          note: b.note ?? null,
          source: asHr ? 'hr' : 'commander',
          lastModifiedBy: me,
        },
        now,
      );
      return ok(putReportResponseSchema, toReport(row));
    }),

    http.get(`${P}/commander/documents/:documentId/url`, ({ params }) => {
      const p = parse(documentIdParamsSchema, named(params));
      if (!p) return fail('VALIDATION_ERROR');
      const doc = db.documents.find((d) => d.id === p.documentId);
      if (!doc) return fail('NOT_FOUND');
      if (!canActOn(me, doc.ownerId)) return fail('FORBIDDEN');
      return ok(documentUrlResponseSchema, {
        url: `https://mock.doch1.invalid/documents/${doc.id}`,
        expiresAt: new Date(clock().getTime() + SIGNED_URL_TTL_SEC * 1000).toISOString(),
      });
    }),

    http.put(`${P}/commander/favorites/:soldierId`, ({ params }) => {
      const p = parse(soldierIdParamsSchema, named(params));
      if (!p) return fail('VALIDATION_ERROR');
      if (!canActOn(me, p.soldierId)) return fail('FORBIDDEN');
      if (!db.favorites.some((f) => f.commanderId === me && f.soldierId === p.soldierId))
        db.favorites.push({ commanderId: me, soldierId: p.soldierId });
      return noContent();
    }),

    http.delete(`${P}/commander/favorites/:soldierId`, ({ params }) => {
      const p = parse(soldierIdParamsSchema, named(params));
      if (!p) return fail('VALIDATION_ERROR');
      if (!canActOn(me, p.soldierId)) return fail('FORBIDDEN');
      db.favorites = db.favorites.filter((f) => !(f.commanderId === me && f.soldierId === p.soldierId));
      return noContent();
    }),

    http.post(`${P}/commander/emergencies`, async ({ request }) => {
      const b = parse(startEmergencyBodySchema, await body(request));
      if (!b) return fail('VALIDATION_ERROR');
      if (!commanderGroupIds(me).includes(b.groupId)) return fail('FORBIDDEN');
      if (db.emergencies.some((e) => e.groupId === b.groupId && !e.endedAt))
        return fail('EMERGENCY_ALREADY_OPEN');
      const e: EmergencyRow = {
        id: newId(),
        groupId: b.groupId,
        includeSub: b.includeSub,
        startedBy: me,
        message: b.message ?? null,
        startedAt: clock().toISOString(),
        endedAt: null,
        endedBy: null,
        responses: new Map(),
      };
      db.emergencies.push(e);
      return ok(startEmergencyResponseSchema, { id: e.id });
    }),

    http.get(`${P}/commander/emergencies/:id`, ({ params }) => {
      const p = parse(idParamsSchema, named(params));
      if (!p) return fail('VALIDATION_ERROR');
      const e = db.emergencies.find((x) => x.id === p.id);
      if (!e) return fail('NOT_FOUND');
      if (!commanderGroupIds(me).includes(e.groupId)) return fail('FORBIDDEN');
      const rank = { need_help: 0, none: 1, ok: 2 };
      const responses = eventMembers(e)
        .map((u) => {
          const r = e.responses.get(u.id);
          return { soldier: person(u.id), status: r?.status ?? null, respondedAt: r?.respondedAt ?? null };
        })
        .sort((a, b) => rank[a.status ?? 'none'] - rank[b.status ?? 'none']);
      const count = (s: string | null) => responses.filter((r) => r.status === s).length;
      return ok(emergencyDetailResponseSchema, {
        id: e.id,
        group: { id: e.groupId, name: db.groups.find((g) => g.id === e.groupId)!.name },
        includeSub: e.includeSub,
        message: e.message,
        startedBy: person(e.startedBy),
        startedAt: e.startedAt,
        endedAt: e.endedAt,
        counts: { ok: count('ok'), needHelp: count('need_help'), noResponse: count(null) },
        responses,
      });
    }),

    http.post(`${P}/commander/emergencies/:id/end`, ({ params }) => {
      const p = parse(idParamsSchema, named(params));
      if (!p) return fail('VALIDATION_ERROR');
      const e = db.emergencies.find((x) => x.id === p.id);
      if (!e) return fail('NOT_FOUND');
      if (!commanderGroupIds(me).includes(e.groupId)) return fail('FORBIDDEN');
      if (e.endedAt) return fail('EMERGENCY_ENDED');
      Object.assign(e, { endedAt: clock().toISOString(), endedBy: me });
      return noContent();
    }),

    http.post(`${P}/hr/reports/finalize`, async ({ request }) => {
      const b = parse(reportIdsBodySchema, await body(request));
      if (!b) return fail('VALIDATION_ERROR');
      const rows = uniq(b.reportIds).map((id) => db.reports.find((r) => r.id === id));
      if (!isHr(me) || rows.some((r) => !r || !inHrScope(me, r.userId))) return fail('FORBIDDEN');
      const nowIso = clock().toISOString();
      for (const r of rows) Object.assign(r!, { finalizedBy: me, finalizedAt: nowIso });
      return ok(finalizeReportsResponseSchema, { finalizedCount: rows.length });
    }),

    http.delete(`${P}/hr/reports/:reportId/finalize`, ({ params }) => {
      const p = parse(reportIdParamsSchema, named(params));
      if (!p) return fail('VALIDATION_ERROR');
      const r = db.reports.find((x) => x.id === p.reportId);
      if (!isHr(me) || !r || !inHrScope(me, r.userId)) return fail('FORBIDDEN');
      Object.assign(r, { finalizedBy: null, finalizedAt: null });
      return noContent();
    }),
  ];
}

export const mockHandlers = () =>
  createHandlers(createDb(), process.env.EXPO_PUBLIC_MOCK_USER_ID || U.team1Cmd);
