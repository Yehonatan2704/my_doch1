import type { CommanderPutReportBody, GroupReportsResponse } from '@doch1/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ApiError } from '../../lib/api';
import type { Filter, Scope } from './logic';

export const commanderKeys = {
  all: ['commander'] as const,
  groups: ['commander', 'groups'] as const,
  reports: ['commander', 'reports'] as const,
};

/**
 * GET /commander/groups. A non-commander gets `{groups: []}` (SPEC §9 row 17); the mock answers
 * 403 instead, so both mean "not a commander" (F8/E6).
 */
export function useCommanderGroups() {
  return useQuery({
    queryKey: commanderKeys.groups,
    queryFn: async () => {
      try {
        return (await api.commanderGroups()).groups;
      } catch (e) {
        if ((e as ApiError).code === 'FORBIDDEN') return [];
        throw e;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export type ListParams = Scope & {
  date: string;
  pending: boolean;
  q: string;
  category: Filter;
};

/** GET /commander/groups/:id/reports — rows + counts for F8. Keeps the old list while refetching. */
export function useGroupReports(p: ListParams | null) {
  return useQuery({
    queryKey: [...commanderKeys.reports, p],
    queryFn: () =>
      api.groupReports(p!.groupId, {
        date: p!.date,
        includeSub: p!.includeSub,
        pending: p!.pending,
        q: p!.q.trim() || undefined,
        category: p!.category,
      }),
    enabled: !!p,
    placeholderData: keepPreviousData,
  });
}

/** PUT/DELETE /commander/favorites/:id — flips the star optimistically on every cached list. */
export function useToggleFavorite() {
  const qc = useQueryClient();
  const flip = (soldierId: string, on: boolean) =>
    qc.setQueriesData<GroupReportsResponse>(
      { queryKey: commanderKeys.reports },
      (d) =>
        d && {
          ...d,
          rows: d.rows.map((r) => (r.soldier.id === soldierId ? { ...r, isFavorite: on } : r)),
        },
    );
  return useMutation({
    mutationFn: ({ soldierId, on }: { soldierId: string; on: boolean }) =>
      on ? api.addFavorite(soldierId) : api.removeFavorite(soldierId),
    onMutate: ({ soldierId, on }) => flip(soldierId, on),
    onError: (_e, { soldierId, on }) => flip(soldierId, !on),
    onSettled: () => qc.invalidateQueries({ queryKey: commanderKeys.reports }),
  });
}

/** POST /commander/reports/approve — one or many (≤ BULK_MAX), all-or-nothing. */
export function useApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportIds: string[]) => api.approveReports(reportIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: commanderKeys.reports }),
  });
}

/** PUT /commander/soldiers/:id/reports/:date — edit a report or report for a non-reporter. */
export function useCommanderPutReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; date: string; body: CommanderPutReportBody }) =>
      api.putSoldierReport(v.userId, v.date, v.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: commanderKeys.reports }),
  });
}

/** GET /commander/documents/:id/url — fetched on tap only; the signed URL expires fast. */
export function useDocumentUrl() {
  return useMutation({ mutationFn: (documentId: string) => api.documentUrl(documentId) });
}
