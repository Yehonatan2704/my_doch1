import {
  CATEGORY_CODES,
  FUTURE_WINDOW_DAYS,
  type Report,
  type StatusesResponse,
  isChangedByOther,
} from '@doch1/shared';
import { router, useFocusEffect } from 'expo-router';
import { Info, X } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  Banner,
  CalendarMonth,
  ErrorState,
  PillButton,
  Sheet,
  Skeleton,
  StatusCard,
  TemplateCard,
  TopBar,
  Txt,
  useToast,
} from '../../components';
import { categoryRole } from '../../components/CategoryIcon';
import { calendarSelect as ts, calendarTab as tc, history as th } from '../../i18n/he';
import type { ApiError } from '../../lib/api';
import {
  addDays,
  editableRange,
  isEditable,
  marksFor,
  monthOf,
  monthRange,
  shiftMonth,
  shortDM,
  type Month,
  type Ymd,
} from '../../lib/calendar';
import { personName, stages } from '../../lib/history';
import {
  statusNames,
  useReportsRange,
  useStatuses,
  useTodayReport,
} from '../../lib/hooks/useReports';
import { selectionSavedSince } from '../../lib/calendarSelection';
import { dayLabelIL, dayTimeIL, monthLabelIL } from '../../lib/time';
import { makeStyles, useTheme } from '../../theme/theme';
import { cardSurface, font, radius, space } from '../../theme/tokens';

const monthKey = (m: Month) => m.year * 12 + m.month;
/** §7.3: the month buttons reach 12 months back and forward. */
const MONTH_SPAN = 12;
const openPicker = (dates: Ymd[]) =>
  router.push({ pathname: '/report', params: { dates: dates.join(',') } });
const monthName = (m: Month) => monthLabelIL(m.year, m.month).split(' ')[0]!;
const union = (a: readonly Ymd[], b: readonly Ymd[]) => [...new Set([...a, ...b])].sort();

/**
 * DESIGN.md §7.3 — one calendar for the whole report history and reporting ahead:
 * past days are read-only, today…today+7 can be tapped or dragged (range), later days disabled.
 */
export default function Future() {
  const styles = useStyles();
  const today = useTodayReport();
  const statuses = useStatuses();
  const todayDate = today.data?.date;
  const [picked, setPicked] = useState<Month | null>(null);
  const month = picked ?? (todayDate ? monthOf(todayDate) : null);
  const reports = useReportsRange(month ? monthRange(month) : undefined);
  const toast = useToast();
  // Past day whose read-only sheet is open.
  const [open, setOpen] = useState<Ymd | null>(null);
  // §7.3 multi-select: kept across months; cleared once a report for it is saved.
  const [selection, setSelection] = useState<Ymd[]>([]);
  const [dragging, setDragging] = useState<Ymd[] | null>(null);
  const [erasing, setErasing] = useState(false);
  const leftAt = useRef(0);

  const { refetch } = reports;
  useFocusEffect(
    useCallback(() => {
      refetch();
      if (leftAt.current && selectionSavedSince(leftAt.current)) setSelection([]);
      leftAt.current = 0;
    }, [refetch]),
  );

  if (reports.isError || today.isError) {
    const e = (reports.error ?? today.error) as ApiError;
    return (
      <View style={styles.page}>
        <TopBar title={tc.title} account />
        <ErrorState message={e.message} onRetry={() => (today.refetch(), reports.refetch())} />
      </View>
    );
  }

  const byDate = new Map(reports.data?.map((r) => [r.date, r]));
  const lastDay = todayDate ? addDays(todayDate, FUTURE_WINDOW_DAYS) : null;
  const ready = month && todayDate && statuses.data;

  const onPressDay = (d: Ymd) => {
    if (!todayDate) return;
    if (d < todayDate) return setOpen(d);
    if (d > (lastDay ?? d)) return toast.show(tc.beyondWindow);
    setSelection((s) => (s.includes(d) ? s.filter((x) => x !== d) : union(s, [d])));
  };
  const reportSelected = () => {
    leftAt.current = Date.now();
    openPicker(selection);
  };
  // What the grid shows while a finger is down: the swipe added to, or erased from, the selection.
  const preview = !dragging
    ? selection
    : erasing
      ? selection.filter((d) => !dragging.includes(d))
      : union(selection, dragging);
  const current = todayDate ? monthOf(todayDate) : null;
  const prevMonth = month ? shiftMonth(month, -1) : null;
  const nextMonth = month ? shiftMonth(month, 1) : null;
  const canPrev = !!current && !!prevMonth && monthKey(prevMonth) >= monthKey(current) - MONTH_SPAN;
  const canNext = !!current && !!nextMonth && monthKey(nextMonth) <= monthKey(current) + MONTH_SPAN;

  return (
    <View style={styles.page}>
      <TopBar title={tc.title} account />
      <ScrollView
        contentContainerStyle={[styles.body, selection.length ? styles.bodyWithBar : null]}
        scrollEnabled={!dragging}
        refreshControl={
          <RefreshControl refreshing={reports.isRefetching} onRefresh={() => reports.refetch()} />
        }
      >
        {/* §7.3 item 0 — weekly template card. */}
        <TemplateCard variant="future" onToast={toast.show} />

        {lastDay ? (
          <View style={styles.info}>
            <Info size={18} strokeWidth={1.75} color={styles.infoIcon.color} />
            <Txt variant="caption" tone="secondary" style={styles.flex}>
              {ts.info(shortDM(lastDay))}
            </Txt>
          </View>
        ) : null}

        {ready ? (
          <CalendarMonth
            month={month}
            today={todayDate}
            marks={marksFor(reports.data, todayDate)}
            isEnabled={(d) => isEditable(todayDate, d)}
            onPressDay={onPressDay}
            selected={preview}
            rangeOf={(a, b) => editableRange(todayDate, a, b)}
            onSelecting={(days, start) => {
              setDragging(days);
              // A swipe that starts on a selected day erases; any other swipe adds.
              if (start && !dragging) setErasing(selection.includes(start));
            }}
            onRangeSelect={(days, start) =>
              setSelection((s) =>
                s.includes(start) ? s.filter((d) => !days.includes(d)) : union(s, days),
              )
            }
            onPrev={canPrev && prevMonth ? () => setPicked(prevMonth) : undefined}
            onNext={canNext && nextMonth ? () => setPicked(nextMonth) : undefined}
            prevLabel={prevMonth ? monthName(prevMonth) : undefined}
            nextLabel={nextMonth ? monthName(nextMonth) : undefined}
            onToday={() => setPicked(null)}
          />
        ) : (
          <Skeleton height={440} />
        )}

        <Legend statuses={statuses.data} />
      </ScrollView>

      {dragging && dragging.length ? (
        <View style={styles.banner} pointerEvents="none" accessibilityLiveRegion="polite">
          <Txt variant="body" tone="onAccent" style={styles.bannerText}>
            {ts.count(preview.length)}
          </Txt>
        </View>
      ) : null}

      {selection.length ? (
        <SelectionBar
          days={selection}
          reported={new Set(reports.data?.map((r) => r.date))}
          onClear={() => setSelection([])}
          onRemove={(d) => setSelection((s) => s.filter((x) => x !== d))}
          onReport={reportSelected}
        />
      ) : null}

      {ready ? (
        <Sheet
          visible={!!open}
          onClose={() => setOpen(null)}
          title={open ? dayLabelIL(open) : undefined}
        >
          {open ? <PastSheet report={byDate.get(open) ?? null} statuses={statuses.data} /> : null}
        </Sheet>
      ) : null}
      {toast.element}
    </View>
  );
}

function Legend({ statuses }: { statuses?: StatusesResponse }) {
  const styles = useStyles();
  const { c } = useTheme();
  return (
    <View style={styles.legend} aria-hidden>
      <Txt variant="caption" tone="secondary">
        {tc.legendTitle}
      </Txt>
      <View style={styles.legendRow}>
        {CATEGORY_CODES.map((code) => (
          <View key={code} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: c.tint[categoryRole(code)].base }]} />
            <Txt variant="caption">{statusNames(statuses, code)}</Txt>
          </View>
        ))}
      </View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={styles.pendingDot} />
          <Txt variant="caption">{tc.legendPending}</Txt>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.box, { backgroundColor: c.brand.accent }]} />
          <Txt variant="caption">{ts.legendSelected}</Txt>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.box, styles.boxDisabled]} />
          <Txt variant="caption">{tc.legendDisabled}</Txt>
        </View>
      </View>
    </View>
  );
}

/** §7.3 selection bar: count, clear, the chosen dates, and "report for the selected days". */
function SelectionBar({
  days,
  reported,
  onClear,
  onRemove,
  onReport,
}: {
  days: Ymd[];
  reported: Set<Ymd>;
  onClear: () => void;
  onRemove: (d: Ymd) => void;
  onReport: () => void;
}) {
  const styles = useStyles();
  const { c } = useTheme();
  return (
    <View style={styles.bar} accessibilityRole="summary" aria-label={ts.region}>
      <View style={styles.barHead}>
        <Txt variant="heading" accessibilityLiveRegion="polite">
          {ts.count(days.length)}
        </Txt>
        <Pressable onPress={onClear} accessibilityRole="button" hitSlop={8}>
          <Txt variant="body" tone="accent" style={styles.bannerText}>
            {ts.clear}
          </Txt>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {days.map((d) => (
          <Pressable
            key={d}
            onPress={() => onRemove(d)}
            accessibilityRole="button"
            accessibilityLabel={`${dayLabelIL(d)} · ${ts.clear}`}
            style={[styles.chip, reported.has(d) && { borderColor: c.status.away }]}
          >
            <Txt variant="caption" style={styles.bannerText}>
              {shortDM(d)}
            </Txt>
            <X size={12} strokeWidth={2} color={c.text.secondary} />
          </Pressable>
        ))}
      </ScrollView>
      <PillButton label={ts.report} onPress={onReport} />
    </View>
  );
}

/** Past day — read only (§7.3). */
function PastSheet({ report, statuses }: { report: Report | null; statuses: StatusesResponse }) {
  const styles = useStyles();
  if (!report) {
    return (
      <View style={styles.sheet}>
        <Txt variant="body" tone="secondary">
          {tc.pastNoReport}
        </Txt>
        <Banner kind="info" text={tc.pastReadOnly} />
      </View>
    );
  }
  const { approval, finalization } = stages(report);
  return (
    <View style={styles.sheet}>
      <StatusCard
        categoryCode={report.reason.categoryCode}
        categoryLabel={statusNames(statuses, report.reason.categoryCode)}
        reasonLabel={report.reason.nameHe}
        note={report.note}
        updatedBy={isChangedByOther(report.source) ? personName(report.lastModifiedBy) : null}
      />
      <View style={styles.rows}>
        <Row label={th.reportedBy} value={personName(report.reportedBy)} />
        <Row label={th.reportedAt} value={dayTimeIL(report.createdAt)} />
        {report.documentId ? <Row label={th.document} value={th.documentAttached} /> : null}
        <Row label={th.stage1} value={approval} />
        <Row label={th.stage2} value={finalization} last />
      </View>
      <Banner kind="info" text={tc.pastReadOnly} />
    </View>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.row, !last && styles.divider]} accessible>
      <Txt variant="body" tone="secondary">
        {label}
      </Txt>
      <Txt variant="body" style={styles.flexShrink}>
        {value}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  page: { flex: 1, backgroundColor: c.surface.page },
  body: { padding: space.screen, gap: space.lg, paddingBottom: space.xxl * 2 },
  // Room for the selection bar so it never hides the calendar or legend.
  bodyWithBar: { paddingBottom: 200 },
  bar: {
    position: 'absolute',
    left: space.screen,
    right: space.screen,
    bottom: space.sm,
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: c.surface.elevated,
    borderWidth: 1,
    borderColor: c.border.subtle,
  },
  barHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { gap: space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    height: 30,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: c.border.subtle,
    backgroundColor: c.surface.accent,
  },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.tile,
    backgroundColor: c.surface.accent,
  },
  infoIcon: { color: c.accentInk },
  legend: { ...cardSurface(c), padding: space.md, gap: space.sm },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  pendingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.status.away },
  box: { width: 14, height: 14, borderRadius: 4 },
  boxDisabled: { borderWidth: 1, borderColor: c.border.subtle, opacity: 0.35 },
  banner: {
    position: 'absolute',
    top: space.xxl * 2,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: c.brand.accent,
  },
  bannerText: { fontFamily: font.bold },
  sheet: { gap: space.md },
  rows: { ...cardSurface(c), paddingHorizontal: space.lg },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border.subtle },
  rowBtns: { flexDirection: 'row', gap: space.sm },
}));
