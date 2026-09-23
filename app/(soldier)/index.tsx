import { FUTURE_WINDOW_DAYS, ONE_TAP_REASON_CODE, TZ, type Report } from '@doch1/shared';
import { he } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';
import { router, useFocusEffect } from 'expo-router';
import { Plus, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import {
  Banner,
  CategoryIcon,
  Countdown,
  ErrorState,
  PillButton,
  Skeleton,
  TemplateEditorSheet,
  TopBar,
  Txt,
  WeekTemplateStrip,
  useSideMenu,
  useToast,
} from '../../components';
import { categoryRole } from '../../components/CategoryIcon';
import { common, home as th, homeV2 as t, weekTemplate as tw } from '../../i18n/he';
import type { ApiError } from '../../lib/api';
import { addDays, shortDM, type Ymd } from '../../lib/calendar';
import { useMe } from '../../lib/hooks/useMe';
import {
  reasonByCode,
  statusNames,
  useReportsRange,
  useStatuses,
  useSubmitReport,
  useTodayReport,
} from '../../lib/hooks/useReports';
import { useSettings, useTemplate, useUpdateSettings } from '../../lib/hooks/useSettings';
import { weekdayOf } from '../../lib/template';
import { dayLabelIL, hhmmIL, isPast } from '../../lib/time';
import { makeStyles, useTheme } from '../../theme/theme';
import { cardSurface, radius, space } from '../../theme/tokens';

/** "יום שלישי, 22 בספטמבר" */
const longDate = (d: Ymd) =>
  formatInTimeZone(new Date(`${d}T12:00:00Z`), TZ, "EEEE, d 'ב'MMMM", { locale: he });

/** DESIGN §7.1 — greeting, hero (one-tap present / today's report), template setup, next 7 days. */
export default function Home() {
  const me = useMe();
  const today = useTodayReport();
  const statuses = useStatuses();
  const submit = useSubmitReport();
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const template = useTemplate();
  const toast = useToast();
  const menu = useSideMenu();
  const [error, setError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const s = useStyles();
  const { c } = useTheme();
  const date = today.data?.date;
  const week = useReportsRange(
    date ? { from: addDays(date, 1), to: addDays(date, FUTURE_WINDOW_DAYS) } : undefined,
  );

  // Refresh whenever this screen is shown again (the root layout also refetches on foreground).
  const { refetch } = today;
  const { refetch: refetchWeek } = week;
  useFocusEffect(
    useCallback(() => {
      refetch();
      refetchWeek();
    }, [refetch, refetchWeek]),
  );

  if (today.isError) {
    return (
      <ErrorState message={(today.error as ApiError).message} onRetry={() => today.refetch()} />
    );
  }
  if (!today.data || !statuses.data) return <HomeSkeleton />;

  const { report, deadline, editLockAt, serverOffsetMs } = today.data;
  const todayDate = today.data.date;
  const locked = isPast(editLockAt, serverOffsetMs);
  const firstName = me.data?.user.firstName ?? '';
  const present = reasonByCode(statuses.data, ONE_TAP_REASON_CODE);
  const showSetup = settings.data ? !settings.data.templateOnboarded : false;

  const oneTap = () => {
    if (!present) return;
    setError(null);
    submit.mutate(
      { date: todayDate, body: { reasonId: present.id } },
      {
        onSuccess: () => toast.show(t.sentToast),
        onError: (e) => setError((e as ApiError).message),
      },
    );
  };
  const toReport = (d: Ymd = todayDate) => router.push({ pathname: '/report', params: { date: d } });
  const dismissSetup = () => updateSettings.mutate({ templateOnboarded: true });

  return (
    <View style={s.page}>
      <TopBar title={common.appName} onMenu={menu.open} />
      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={
          <RefreshControl refreshing={today.isRefetching} onRefresh={() => today.refetch()} />
        }
      >
        <View style={s.header}>
          <Txt variant="display" accessibilityRole="header">
            {th.greeting(firstName)}
          </Txt>
          <Txt variant="body" tone="secondary">
            {longDate(todayDate)}
          </Txt>
        </View>

        {error ? <Banner kind="danger" text={error} /> : null}

        {report ? (
          <ReportedHero
            report={report}
            categoryName={statusNames(statuses.data, report.reason.categoryCode)}
            canEdit={!locked && report.finalizedAt === null}
            onEdit={() => toReport()}
          />
        ) : locked ? (
          <Banner kind="danger" text={th.locked} />
        ) : (
          <View style={s.hero}>
            <View style={s.glow} aria-hidden />
            <View style={s.dotRow}>
              <View style={s.redDot} />
              <Txt variant="caption" tone="heroMuted">
                {t.notReported}
              </Txt>
            </View>
            <Txt variant="title" tone="hero">
              {t.whereToday}
            </Txt>
            <Countdown deadline={deadline} serverOffsetMs={serverOffsetMs} />
            <PillButton
              label={t.present}
              variant="onHero"
              loading={submit.isPending}
              disabled={!present}
              onPress={oneTap}
              style={s.big}
            />
            <Pressable
              onPress={() => toReport()}
              accessibilityRole="button"
              accessibilityLabel={t.otherStatus}
              style={s.link}
            >
              <Txt variant="heading" tone="hero" center>
                {t.otherStatus}
              </Txt>
            </Pressable>
          </View>
        )}

        {showSetup && template.data ? (
          <View style={s.card}>
            <View style={s.row}>
              <View style={s.flex}>
                <Txt variant="caption" tone="accent">
                  {tw.setupEyebrow}
                </Txt>
                <Txt variant="heading">{tw.setupHeading}</Txt>
              </View>
              <Pressable
                onPress={dismissSetup}
                accessibilityRole="button"
                accessibilityLabel={tw.notNow}
                hitSlop={8}
                style={s.x}
              >
                <X size={20} strokeWidth={1.75} color={c.text.secondary} />
              </Pressable>
            </View>
            <WeekTemplateStrip template={template.data} statuses={statuses.data} />
            <PillButton label={tw.setupCta} onPress={() => setSetupOpen(true)} />
            <PillButton label={tw.notNow} variant="ghost" onPress={dismissSetup} />
          </View>
        ) : null}

        <WeekStripCard
          today={todayDate}
          reports={week.data}
          onDay={toReport}
          onCalendar={() => router.push('/future')}
        />
      </ScrollView>
      {setupOpen ? (
        <TemplateEditorSheet
          from="setup"
          onClose={() => setSetupOpen(false)}
          onSaved={() => {
            dismissSetup();
            toast.show(tw.saved);
          }}
        />
      ) : null}
      {toast.element}
      {menu.element}
    </View>
  );
}

function ReportedHero({
  report,
  categoryName,
  canEdit,
  onEdit,
}: {
  report: Report;
  categoryName: string;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const s = useStyles();
  const { c } = useTheme();
  const approved = !!report.approvedBy;
  const role = categoryRole(report.reason.categoryCode);
  return (
    <View style={s.hero}>
      <View style={s.glow} aria-hidden />
      <View style={s.row}>
        <Txt variant="heading" tone="hero" style={s.flex}>
          {t.myToday}
        </Txt>
        <View style={s.badge}>
          <View
            style={[s.dot, { backgroundColor: approved ? c.status.present : c.status.warning }]}
          />
          <Txt variant="caption" tone="hero">
            {approved ? t.approved : t.pending}
          </Txt>
        </View>
      </View>
      <View style={s.row}>
        <View style={[s.tile, { backgroundColor: c.tint[role].bg }]}>
          <CategoryIcon code={report.reason.categoryCode} size={28} tint={c.tint[role].base} />
        </View>
        <View style={s.flex}>
          <Txt variant="display" tone="hero">
            {report.reason.nameHe}
          </Txt>
          <Txt variant="body" tone="heroMuted">
            {categoryName}
          </Txt>
        </View>
      </View>
      <Txt variant="caption" tone="heroMuted">
        {t.updated(hhmmIL(report.updatedAt))}
      </Txt>
      {canEdit ? <PillButton label={t.update} variant="onHero" onPress={onEdit} /> : null}
    </View>
  );
}

function WeekStripCard({
  today,
  reports,
  onDay,
  onCalendar,
}: {
  today: Ymd;
  reports: Report[] | undefined;
  onDay: (d: Ymd) => void;
  onCalendar: () => void;
}) {
  const s = useStyles();
  const { c } = useTheme();
  const byDate = new Map((reports ?? []).map((r) => [r.date, r]));
  const days = Array.from({ length: FUTURE_WINDOW_DAYS }, (_, i) => addDays(today, i + 1));
  const n = days.filter((d) => byDate.has(d)).length;
  return (
    <View style={s.card}>
      <View style={s.row}>
        <View style={s.flex}>
          <Txt variant="heading" accessibilityRole="header">
            {t.weekTitle}
          </Txt>
          <Txt variant="caption" tone="secondary">
            {t.weekCount(n)}
          </Txt>
        </View>
        <Pressable
          onPress={onCalendar}
          accessibilityRole="link"
          accessibilityLabel={t.toCalendar}
          hitSlop={8}
          style={s.link}
        >
          <Txt variant="heading" tone="accent">
            {t.toCalendar}
          </Txt>
        </Pressable>
      </View>
      <View style={s.strip}>
        {days.map((d) => {
          const r = byDate.get(d);
          return (
            <Pressable
              key={d}
              onPress={() => onDay(d)}
              accessibilityRole="button"
              accessibilityLabel={`${t.reportDay(dayLabelIL(d))}${r ? ` · ${r.reason.nameHe}` : ''}`}
              style={({ pressed }) => [
                s.dayTile,
                r && { backgroundColor: c.tint[categoryRole(r.reason.categoryCode)].bg },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Txt variant="caption" tone="secondary">
                {tw.dayLetters[weekdayOf(d)]}
              </Txt>
              <Txt variant="heading">{shortDM(d)}</Txt>
              {r ? (
                <CategoryIcon code={r.reason.categoryCode} size={18} />
              ) : (
                <Plus size={18} strokeWidth={1.75} color={c.text.disabled} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function HomeSkeleton() {
  const s = useStyles();
  return (
    <View style={s.page}>
      <TopBar title={common.appName} />
      <View style={[s.body, s.skeleton]}>
        <Skeleton height={34} width="50%" />
        <Skeleton height={20} width="40%" />
        <Skeleton height={240} />
        <Skeleton height={140} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  page: { flex: 1, backgroundColor: c.surface.page },
  body: { padding: space.screen, gap: space.lg, paddingBottom: space.xxl * 2 },
  header: { gap: space.xs },
  card: { ...cardSurface(c), padding: space.lg, gap: space.md },
  hero: {
    backgroundColor: c.hero.bg,
    borderRadius: radius.hero,
    padding: space.xl,
    gap: space.md,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: c.hero.tile,
  },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  redDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.status.missing },
  big: { marginTop: space.sm },
  link: { minHeight: 44, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  x: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: c.hero.tile,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tile: { width: 52, height: 52, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
  strip: { flexDirection: 'row', gap: space.xs },
  dayTile: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: space.sm,
    borderRadius: radius.tile,
    backgroundColor: c.surface.page,
    minWidth: 0,
  },
  skeleton: { gap: space.lg },
}));
