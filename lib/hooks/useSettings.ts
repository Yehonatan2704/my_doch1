import type { PutSettingsBody, PutWeekTemplateBody, Settings } from '@doch1/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export const settingsKey = ['settings'] as const;

/** GET /settings — reminder, nudge and notification toggles (F6). */
export function useSettings() {
  return useQuery({ queryKey: settingsKey, queryFn: api.settings });
}

/**
 * PUT /settings with only the changed fields (SPEC §9 row 12). Optimistic: the switch moves at
 * once and snaps back if the server says no.
 */
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: PutSettingsBody) => api.putSettings(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: settingsKey });
      const prev = qc.getQueryData<Settings>(settingsKey);
      if (prev) qc.setQueryData<Settings>(settingsKey, { ...prev, ...patch } as Settings);
      return { prev };
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(settingsKey, ctx.prev);
    },
    onSuccess: (next) => qc.setQueryData(settingsKey, next),
  });
}

export const templateKey = ['weekTemplate'] as const;

/** GET /settings/template — my weekly default template (DESIGN §7.8); days[0] = Sunday. */
export function useTemplate() {
  return useQuery({ queryKey: templateKey, queryFn: api.getTemplate });
}

/** PUT /settings/template — full replace of all 7 days. */
export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PutWeekTemplateBody) => api.putTemplate(body),
    onSuccess: (next) => qc.setQueryData(templateKey, next),
  });
}
