import { ScrollView, View } from 'react-native';
import { useState } from 'react';
import { weekTemplate as t } from '../i18n/he';
import type { ApiError } from '../lib/api';
import { addDays, shortDM } from '../lib/calendar';
import {
  useReportsRange,
  useStatuses,
  useSubmitReport,
  useTodayReport,
} from '../lib/hooks/useReports';
import { useTemplate } from '../lib/hooks/useSettings';
import { applyPlan, findReason, weekdayOf, type ApplyTag } from '../lib/template';
import { FUTURE_WINDOW_DAYS } from '@doch1/shared';
import { makeStyles, useTheme } from '../theme/theme';
import { radius, space } from '../theme/tokens';
import { Banner } from './Banner';
import { CategoryIcon } from './CategoryIcon';
import { PillButton } from './PillButton';
import { Sheet } from './Sheet';
import { Skeleton } from './States';
import { Txt } from './Txt';

/** Today + the next 7 days with the template filled into empty days. */
export function useApplyPlan() {
  const today = useTodayReport();
  const template = useTemplate();
  const date = today.data?.date;
  const reports = useReportsRange(
    date ? { from: date, to: addDays(date, FUTURE_WINDOW_DAYS) } : undefined,
  );
  if (!date || !template.data || !reports.data) return null;
  const rows = applyPlan(date, template.data, new Set(reports.data.map((r) => r.date)));
  return { today: date, rows, toAdd: rows.filter((r) => r.tag === 'add') };
}

/**
 * DESIGN §7.8 — fill the empty days of the rolling 8-day window from the template.
 * One PUT per day, sequentially; `onDone(k)` lets the screen show the toast.
 */
export function ApplyTemplateSheet({
  onClose,
  onDone,
  onEditTemplate,
}: {
  onClose: () => void;
  onDone: (k: number) => void;
  onEditTemplate: () => void;
}) {
  const s = useStyles();
  const plan = useApplyPlan();
  const statuses = useStatuses();
  const submit = useSubmitReport();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const k = plan?.toAdd.length ?? 0;

  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    let done = 0;
    let lastError: ApiError | null = null;
    // Keep going past a failed day (e.g. a locked day) so the rest of the week still fills.
    // Filled days drop out of the plan (the reports cache refreshes), so a retry sends only the rest.
    for (const r of plan.toAdd) {
      try {
        await submit.mutateAsync({ date: r.date, body: { reasonId: r.reasonId! } });
        done++;
      } catch (e) {
        lastError = e as ApiError;
      }
    }
    setBusy(false);
    if (lastError) setError(t.applyPartial(done, k, lastError.message));
    else onDone(done);
  };

  return (
    <Sheet visible onClose={onClose} title={t.applyTitle}>
      {!plan || !statuses.data ? (
        <View style={s.list}>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} height={44} />
          ))}
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {plan.rows.map((r) => {
            const found = findReason(statuses.data, r.reasonId ?? undefined);
            return (
              <View
                key={r.date}
                style={s.row}
                accessible
                accessibilityLabel={`${t.rowDay(t.dayNames[weekdayOf(r.date)]!)} ${shortDM(r.date)} · ${found?.reason.nameHe ?? t.none} · ${tagLabel(r.tag)}`}
              >
                <View style={s.date}>
                  <Txt variant="caption" tone="secondary">
                    {t.dayLetters[weekdayOf(r.date)]}
                  </Txt>
                  <Txt variant="heading">{shortDM(r.date)}</Txt>
                </View>
                <View style={s.icon}>
                  {found ? <CategoryIcon code={found.category.code} size={20} /> : null}
                </View>
                <Txt variant="body" style={s.flex} numberOfLines={1}>
                  {found?.reason.nameHe ?? '—'}
                </Txt>
                <Tag tag={r.tag} />
              </View>
            );
          })}
          <Txt variant="caption" tone="secondary">
            {t.applyNote}
          </Txt>
        </ScrollView>
      )}
      {error ? <Banner kind="danger" text={error} /> : null}
      <PillButton
        label={k ? t.applyCta(k) : t.applyNone}
        onPress={apply}
        loading={busy}
        disabled={!plan || k === 0}
      />
      <PillButton label={t.editLink} variant="ghost" onPress={onEditTemplate} />
    </Sheet>
  );
}

const tagLabel = (tag: ApplyTag) =>
  tag === 'add' ? t.tagAdd : tag === 'kept' ? t.tagKept : t.tagNone;

function Tag({ tag }: { tag: ApplyTag }) {
  const s = useStyles();
  const { c } = useTheme();
  const role = tag === 'add' ? 'accent' : 'neutral';
  return (
    <View style={[s.tag, { backgroundColor: c.tint[role].bg }]}>
      <Txt variant="caption" style={{ color: c.tint[role].fg }}>
        {tagLabel(tag)}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  list: { gap: space.sm, paddingBottom: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.tile,
    backgroundColor: c.surface.base,
    borderWidth: 1,
    borderColor: c.border.subtle,
  },
  date: { width: 44, alignItems: 'center' },
  icon: { width: 24, alignItems: 'center' },
  flex: { flex: 1 },
  tag: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
}));
