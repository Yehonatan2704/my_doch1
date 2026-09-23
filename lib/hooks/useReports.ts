import type { PutReportBody, StatusesResponse } from '@doch1/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { serverOffset } from '../../components/countdownState';

export const reportKeys = {
  all: ['reports'] as const,
  today: ['reports', 'today'] as const,
};

/**
 * GET /reports/today. Also records server − phone clock at receipt, so the countdown follows the
 * server's clock (SPEC §9 row 10). Always refetched on focus/foreground (F2 "stuck" fix).
 */
export function useTodayReport() {
  return useQuery({
    queryKey: reportKeys.today,
    queryFn: async () => {
      const data = await api.todayReport();
      return { ...data, serverOffsetMs: serverOffset(data.serverTime, Date.now()) };
    },
    staleTime: 0,
  });
}

/** GET /statuses — categories + reasons (commander-only ones already filtered by the server). */
export function useStatuses() {
  return useQuery({ queryKey: ['statuses'], queryFn: api.statuses, staleTime: 60 * 60_000 });
}

export type Reason = StatusesResponse['categories'][number]['reasons'][number];

/** Look up the Hebrew names for a report's reason/category. */
export function statusNames(statuses: StatusesResponse | undefined, categoryCode: string) {
  return statuses?.categories.find((c) => c.code === categoryCode)?.nameHe ?? '';
}

export function reasonByCode(statuses: StatusesResponse | undefined, code: string) {
  for (const c of statuses?.categories ?? []) {
    const r = c.reasons.find((x) => x.code === code);
    if (r) return r;
  }
  return undefined;
}

/** PUT /reports/:date — create or change the caller's report; refreshes every report query. */
export function useSubmitReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, body }: { date: string; body: PutReportBody }) =>
      api.putReport(date, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportKeys.all }),
  });
}

/** DELETE /reports/:date — future days only (the server enforces it). */
export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => api.deleteReport(date),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportKeys.all }),
  });
}

/** One day's own report (or null) — pre-fills "שינוי דיווח" and future-day edits. */
export function useDayReport(date: string | undefined) {
  return useQuery({
    queryKey: ['reports', 'day', date],
    // Guarded as well as disabled: a manual refetch() on a disabled query still runs queryFn,
    // and GET /reports without from/to is a 400.
    queryFn: async () =>
      date ? ((await api.reports({ from: date, to: date })).reports[0] ?? null) : null,
    enabled: !!date,
  });
}

/** GET /reports?from&to — own reports in a range (future window, a history month). */
export function useReportsRange(range: { from: string; to: string } | undefined) {
  return useQuery({
    queryKey: ['reports', 'range', range?.from, range?.to],
    queryFn: async () => (range ? (await api.reports(range)).reports : []),
    enabled: !!range,
  });
}
