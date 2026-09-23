import {
  NOTE_MAX,
  ONE_TAP_REASON_CODE,
  type CategoryCode,
  type PutReportBody,
} from '@doch1/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { Paperclip } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Banner,
  CategoryIcon,
  CategoryTile,
  LoadingScreen,
  OptionRow,
  PillButton,
  TopBar,
  Txt,
  useToast,
} from '../../components';
import { calendarTab as tc, future as tFuture, report as t } from '../../i18n/he';
import type { ApiError } from '../../lib/api';
import {
  canUseCamera,
  pickFile,
  takePhoto,
  useUploadDocument,
  type Picked,
} from '../../lib/documents';
import { shortDM } from '../../lib/calendar';
import {
  reasonByCode,
  useDayReport,
  useDeleteReport,
  useReportsRange,
  useStatuses,
  useSubmitReport,
  useTodayReport,
} from '../../lib/hooks/useReports';
import {
  blockedReason,
  fileProblem,
  pickableCategories,
  selfReasons,
  toBody,
} from '../../lib/reportForm';
import { dayLabelIL } from '../../lib/time';
import { markSelectionSaved } from '../../lib/calendarSelection';
import { makeStyles, useTheme } from '../../theme/theme';
import { cardSurface, font, radius, space, type } from '../../theme/tokens';

const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * F3 — "Where are you today?": category → reason → note → document → send.
 * `?date=YYYY-MM-DD` reports for that day (today by default, or a future day from F4); an existing
 * report pre-fills the form ("שינוי דיווח").
 * `?dates=YYYY-MM-DD,YYYY-MM-DD,…` (from the calendar range drag, §7.2) reports every listed day
 * with the same status — one PUT per day, sequentially.
 */
export default function Report() {
  const styles = useStyles();
  const { c } = useTheme();
  const params = useLocalSearchParams<{ date?: string; dates?: string }>();
  const today = useTodayReport();
  const list = [
    ...new Set((params.dates ?? '').split(',').filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))),
  ].sort();
  const isRange = list.length > 1;
  const date = list[0] ?? params.date ?? today.data?.date;
  const statuses = useStatuses();
  const existing = useDayReport(isRange ? undefined : date);
  const rangeReports = useReportsRange(isRange ? { from: list[0]!, to: list.at(-1)! } : undefined);
  const [progress, setProgress] = useState(false);
  // Range days already saved in this screen — a retry sends only the rest.
  const [saved, setSaved] = useState<string[]>([]);
  const submit = useSubmitReport();
  const del = useDeleteReport();
  const upload = useUploadDocument();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [categoryCode, setCategoryCode] = useState<CategoryCode | null>(null);
  const [reasonId, setReasonId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  // "שינוי דיווח": start from the current values (on_base has no step-2 form, so start fresh).
  useEffect(() => {
    if (prefilled || (!isRange && existing.isPending)) return;
    const r = existing.data;
    if (r && r.reason.categoryCode !== 'on_base') {
      setCategoryCode(r.reason.categoryCode);
      setReasonId(r.reason.id);
      setNote(r.note ?? '');
      setDocumentId(r.documentId);
    }
    setPrefilled(true);
  }, [prefilled, isRange, existing.isPending, existing.data]);

  if (!date || !statuses.data || (!isRange && existing.isPending)) return <LoadingScreen />;

  const isToday = date === today.data?.date;
  const title = isRange
    ? tc.rangeTitle(list.length)
    : isToday
      ? t.titleToday
      : t.titleForDay(dayLabelIL(date));
  const reported = new Set((rangeReports.data ?? []).map((r) => r.date));
  const finalized = isRange
    ? (rangeReports.data ?? []).some((r) => list.includes(r.date) && !!r.finalizedAt)
    : !!existing.data?.finalizedAt;
  const rangeHeader = isRange ? <RangeHeader dates={list} reported={reported} /> : null;
  const categories = pickableCategories(statuses.data);
  const category = categories.find((c) => c.code === categoryCode);

  // One PUT per day; keeps going past a failed day so the rest still save, and a retry sends only
  // the days not saved yet.
  const saveAll = async (body: PutReportBody) => {
    setError(null);
    if (isRange) {
      setProgress(true);
      const ok = [...saved];
      let lastError: ApiError | null = null;
      // Keep going past a failed day (e.g. today locked after the deadline) so the rest still save.
      for (const d of list.filter((x) => !saved.includes(x))) {
        try {
          await submit.mutateAsync({ date: d, body });
          ok.push(d);
        } catch (e) {
          lastError = e as ApiError;
        }
      }
      setSaved(ok);
      setProgress(false);
      if (!lastError) {
        markSelectionSaved();
        toast.show(tc.rangeSaved(list.length));
        setTimeout(close, 900);
      } else {
        setError(tc.rangePartial(ok.length, list.length, lastError.message));
      }
      return;
    }
    submit.mutate(
      { date, body },
      {
        onSuccess: () => {
          markSelectionSaved();
          toast.show(t.sent);
          setTimeout(close, 900);
        },
        onError: (e) => setError((e as ApiError).message),
      },
    );
  };

  const present = reasonByCode(statuses.data, ONE_TAP_REASON_CODE);
  // A future day that already has a report can be cleared here (the server only deletes future days).
  const canDelete = !isRange && !isToday && !!existing.data && !finalized;
  const remove = () => {
    setError(null);
    del.mutate(date, {
      onSuccess: () => {
        markSelectionSaved();
        toast.show(tFuture.deleted);
        setTimeout(close, 900);
      },
      onError: (e) => setError((e as ApiError).message),
    });
  };

  // ---------- step 1: category ----------
  if (!category) {
    return (
      <View style={styles.yellow}>
        <TopBar title={title} onClose={close} />
        <ScrollView contentContainerStyle={styles.body}>
          {rangeHeader}
          {present && !finalized ? (
            // §7.2: the quick "נוכח/ת" option — the most common status, one tap.
            <PillButton
              label={tFuture.onBase}
              onPress={() => saveAll({ reasonId: present.id })}
              loading={progress || submit.isPending}
            />
          ) : null}
          {error ? <Banner kind="danger" text={error} /> : null}
          <Txt variant="heading" tone="primary" center>
            {t.pickCategory}
          </Txt>
          {[0, 2].map((i) => (
            <View key={i} style={styles.grid}>
              {categories.slice(i, i + 2).map((c) => (
                <CategoryTile
                  key={c.code}
                  code={c.code}
                  label={c.nameHe}
                  onPress={() => {
                    setCategoryCode(c.code);
                    if (c.code !== existing.data?.reason.categoryCode) setReasonId(null);
                  }}
                />
              ))}
            </View>
          ))}
          {canDelete ? (
            <PillButton
              label={tFuture.delete}
              variant="ghost"
              onPress={remove}
              loading={del.isPending}
            />
          ) : null}
        </ScrollView>
        {toast.element}
      </View>
    );
  }

  // ---------- step 2: reason, note, document ----------
  const reasons = selfReasons(category);
  const reason = reasons.find((r) => r.id === reasonId);
  const form = { reason, note, documentId };
  const blocked = finalized ? t.finalized : blockedReason(form);

  const onPicked = (p: Picked | null | 'denied') => {
    if (p === 'denied') return setError(t.cameraDenied);
    if (!p) return;
    const problem = fileProblem(p);
    if (problem) return setError(problem);
    setError(null);
    upload.mutate(p, {
      onSuccess: (id) => {
        setDocumentId(id);
        setFileName(p.name);
      },
      onError: (e) => setError((e as ApiError).message),
    });
  };

  const send = () => saveAll(toBody(form));

  return (
    <View style={styles.page}>
      <TopBar title={title} onBack={() => setCategoryCode(null)} onClose={close}>
        <View style={styles.categoryHeader}>
          <CategoryIcon code={category.code} size={28} />
          <Txt variant="title" tone="primary">
            {category.nameHe}
          </Txt>
        </View>
      </TopBar>

      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {rangeHeader ? <View style={styles.rangeInList}>{rangeHeader}</View> : null}
        {finalized ? <Banner kind="danger" text={t.finalized} /> : null}
        <View accessibilityRole="radiogroup">
          {reasons.map((r) => (
            <OptionRow
              key={r.id}
              label={r.nameHe}
              hint={r.requiresDocument ? t.hintDocument : r.allowsNote ? t.hintNote : undefined}
              selected={r.id === reasonId}
              onPress={() => setReasonId(r.id)}
            />
          ))}
        </View>

        {reason?.allowsNote ? (
          <View style={styles.section}>
            <Txt variant="body" tone="secondary">
              {t.noteLabel}
            </Txt>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t.notePlaceholder}
              placeholderTextColor={c.text.disabled}
              maxLength={NOTE_MAX}
              multiline
              accessibilityLabel={t.noteLabel}
              style={styles.note}
            />
            <Txt variant="caption" tone="secondary">
              {t.noteCount(note.length, NOTE_MAX)}
            </Txt>
          </View>
        ) : null}

        {reason?.requiresDocument ? (
          <View style={styles.section}>
            <Txt variant="heading">{t.documentTitle}</Txt>
            <Txt variant="body" tone="secondary">
              {t.documentExplain}
            </Txt>
            {documentId ? (
              <View style={styles.attached}>
                <Paperclip size={20} strokeWidth={1.75} color={c.status.present} />
                <Txt variant="body" tone="present" numberOfLines={1} style={styles.flex}>
                  {fileName ? `${t.attached} · ${fileName}` : t.attached}
                </Txt>
              </View>
            ) : null}
            <View style={styles.row}>
              {canUseCamera ? (
                <PillButton
                  label={t.camera}
                  variant="ghost"
                  loading={upload.isPending}
                  onPress={async () => onPicked(await takePhoto())}
                  style={styles.flex}
                />
              ) : null}
              <PillButton
                label={documentId ? t.replace : t.chooseFile}
                variant="ghost"
                loading={upload.isPending}
                onPress={async () => onPicked(await pickFile())}
                style={styles.flex}
              />
            </View>
          </View>
        ) : null}

        {error ? <Banner kind="danger" text={error} /> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <PillButton
          label={isRange ? tc.rangeSend(list.length) : t.send}
          variant="dark"
          onPress={send}
          loading={submit.isPending || progress}
          disabled={!!blocked}
          disabledReason={blocked ?? undefined}
        />
      </View>
      {toast.element}
    </View>
  );
}

/** §7.2 range header: eyebrow d.m – d.m, day chips (blue ring = already reported), overwrite note. */
function RangeHeader({ dates, reported }: { dates: string[]; reported: Set<string> }) {
  const styles = useStyles();
  const k = dates.filter((d) => reported.has(d)).length;
  return (
    <View style={styles.range}>
      <Txt variant="caption" tone="secondary" center>
        {`${shortDM(dates[0]!)} – ${shortDM(dates.at(-1)!)}`}
      </Txt>
      <View style={styles.chips}>
        {dates.map((d) => (
          <View key={d} style={[styles.chip, reported.has(d) && styles.chipReported]}>
            <Txt variant="caption">{shortDM(d)}</Txt>
          </View>
        ))}
      </View>
      {k ? <Banner kind="info" text={tc.rangeOverwrite(k)} /> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  range: { gap: space.sm },
  rangeInList: { marginHorizontal: space.screen, marginTop: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, justifyContent: 'center' },
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: c.border.subtle,
    backgroundColor: c.surface.base,
  },
  chipReported: { borderColor: c.status.away },
  yellow: { flex: 1, backgroundColor: c.surface.page },
  page: { flex: 1, backgroundColor: c.surface.page },
  body: { padding: space.screen, gap: space.lg },
  grid: { flexDirection: 'row' },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.sm,
  },
  list: { paddingBottom: space.xxl * 3, gap: space.lg },
  section: {
    gap: space.sm,
    marginHorizontal: space.screen,
    padding: space.lg,
    ...cardSurface(c),
  },
  note: {
    ...type.body,
    fontFamily: font.regular,
    color: c.text.primary,
    minHeight: 96,
    borderWidth: 1,
    borderColor: c.border.subtle,
    borderRadius: radius.tile,
    backgroundColor: c.surface.page,
    padding: space.md,
    textAlign: 'right',
    textAlignVertical: 'top',
    writingDirection: 'rtl',
  },
  attached: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  footer: {
    paddingHorizontal: space.screen,
    paddingTop: space.md,
    backgroundColor: c.surface.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border.subtle,
  },
}));
