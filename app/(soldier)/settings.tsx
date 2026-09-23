import { NUDGE_INTERVALS_MIN, type PutSettingsBody } from '@doch1/shared';
import { CalendarDays, Moon, Sun } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import {
  Banner,
  ErrorState,
  Skeleton,
  TemplateCard,
  TimePicker,
  TopBar,
  Txt,
  useAppMode,
  useToast,
} from '../../components';
import {
  appearance as ta,
  reminders as tr,
  settings as t,
  settingsV2 as t2,
  weekTemplate as tw,
} from '../../i18n/he';
import type { ApiError } from '../../lib/api';
import { useSettings, useUpdateSettings } from '../../lib/hooks/useSettings';
import { ensureReminderPermission, remindersSupported } from '../../lib/notifications';
import { makeStyles, useTheme } from '../../theme/theme';
import { cardSurface, font, radius, space } from '../../theme/tokens';


/** F6 — daily reminder, nudge, and "your report was changed" notification toggles. */
export default function SettingsScreen() {
  const styles = useStyles();
  const { c, scheme, setScheme } = useTheme();
  const query = useSettings();
  const update = useUpdateSettings();
  const mode = useAppMode();
  const toast = useToast();
  const [denied, setDenied] = useState(false);

  if (query.isError) {
    return (
      <View style={styles.page}>
        <TopBar title={t.title} account />
        <ErrorState message={(query.error as ApiError).message} onRetry={() => query.refetch()} />
      </View>
    );
  }

  const s = query.data;
  const save = (patch: PutSettingsBody) => update.mutate(patch);
  // Turning a reminder on is the moment to ask for notification permission (D8).
  const saveAlert = async (patch: PutSettingsBody, on: boolean) => {
    save(patch);
    if (on && remindersSupported) setDenied(!(await ensureReminderPermission()));
  };

  return (
    <View style={styles.page}>
      <TopBar title={t.title} account />
      {!s ? (
        <View style={styles.body}>
          <Skeleton height={20} width="40%" />
          <Skeleton height={112} />
          <Skeleton height={20} width="40%" />
          <Skeleton height={112} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {!remindersSupported ? <Banner kind="info" text={tr.webOnly} /> : null}
          {denied ? <Banner kind="warning" text={tr.denied} /> : null}
          {update.isError ? (
            <Banner kind="danger" text={(update.error as ApiError).message || t.saveFailed} />
          ) : null}

          <Group title={ta.section}>
            <View style={styles.row}>
              <View style={styles.segments} accessibilityRole="radiogroup">
                <Segment
                  label={ta.light}
                  icon={
                    <Sun
                      size={18}
                      strokeWidth={1.75}
                      color={scheme === 'light' ? c.onAccent : c.text.secondary}
                    />
                  }
                  selected={scheme === 'light'}
                  onPress={() => setScheme('light')}
                />
                <Segment
                  label={ta.dark}
                  icon={
                    <Moon
                      size={18}
                      strokeWidth={1.75}
                      color={scheme === 'dark' ? c.onAccent : c.text.secondary}
                    />
                  }
                  selected={scheme === 'dark'}
                  onPress={() => setScheme('dark')}
                />
              </View>
            </View>
          </Group>

          <Group title={t2.dailyTitle}>
            <SwitchRow
              label={t2.dailyTitle}
              hint={t2.dailySub(null, s.reminderTime.slice(0, 5))}
              value={s.reminderEnabled}
              onChange={(v) => saveAlert({ reminderEnabled: v }, v)}
            />
            <View style={[styles.row, styles.column]}>
              <View style={styles.days} aria-hidden>
                {tw.dayLetters.map((l, i) => {
                  const weekly = s.weeklyReminderEnabled && i === s.weeklyReminderDay;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.dayChip,
                        weekly ? styles.dayWeekly : s.reminderEnabled ? styles.dayOn : null,
                      ]}
                    >
                      {weekly ? (
                        <CalendarDays size={14} strokeWidth={1.75} color={c.cmd.ink} />
                      ) : null}
                      <Txt variant="caption" style={weekly ? { color: c.cmd.ink } : null}>
                        {l}
                      </Txt>
                    </View>
                  );
                })}
              </View>
              {s.weeklyReminderEnabled ? (
                <Txt variant="caption" tone="secondary">
                  {t2.weeklyDayNote(tw.dayNames[s.weeklyReminderDay]!)}
                </Txt>
              ) : null}
              <TimePicker
                value={s.reminderTime}
                disabled={!s.reminderEnabled}
                onChange={(reminderTime) => save({ reminderTime })}
              />
            </View>
          </Group>

          <Group title={t2.weeklyTitle}>
            <SwitchRow
              label={t2.weeklyTitle}
              hint={t2.weeklySub(
                tw.dayNames[s.weeklyReminderDay]!,
                s.weeklyReminderTime.slice(0, 5),
              )}
              value={s.weeklyReminderEnabled}
              onChange={(v) => saveAlert({ weeklyReminderEnabled: v }, v)}
            />
            <View style={[styles.row, styles.column]}>
              <Txt variant="body" tone={s.weeklyReminderEnabled ? 'primary' : 'disabled'}>
                {t2.weeklyDay}
              </Txt>
              <View style={styles.segmentsTight} accessibilityRole="radiogroup">
                {tw.dayLetters.map((l, i) => (
                  <Segment
                    key={i}
                    label={l}
                    selected={s.weeklyReminderDay === i}
                    disabled={!s.weeklyReminderEnabled}
                    onPress={() => save({ weeklyReminderDay: i })}
                  />
                ))}
              </View>
              <TimePicker
                value={s.weeklyReminderTime}
                disabled={!s.weeklyReminderEnabled}
                onChange={(weeklyReminderTime) => save({ weeklyReminderTime })}
              />
            </View>
          </Group>

          {mode === 'soldier' ? (
            <Group title={t2.templateSection}>
              <View style={styles.pad}>
                <TemplateCard variant="settings" onToast={toast.show} />
              </View>
            </Group>
          ) : null}

          <Group title={t.nudgeSection}>
            <SwitchRow
              label={t.nudge}
              hint={t.nudgeHint}
              value={s.nudgeEnabled}
              onChange={(v) => saveAlert({ nudgeEnabled: v }, v)}
            />
            <View style={[styles.row, styles.column]}>
              <Txt variant="body" tone={s.nudgeEnabled ? 'primary' : 'disabled'}>
                {t.nudgeInterval}
              </Txt>
              <View style={styles.segments} accessibilityRole="radiogroup">
                {NUDGE_INTERVALS_MIN.map((n) => (
                  <Segment
                    key={n}
                    label={t.minutes(n)}
                    selected={s.nudgeIntervalMin === n}
                    disabled={!s.nudgeEnabled}
                    onPress={() => save({ nudgeIntervalMin: n })}
                  />
                ))}
              </View>
            </View>
          </Group>

          <Group title={t.notifySection}>
            <SwitchRow
              label={t.notifyCommander}
              value={s.notifyCommanderChange}
              onChange={(v) => save({ notifyCommanderChange: v })}
            />
            <SwitchRow
              label={t.notifyHr}
              value={s.notifyHrChange}
              onChange={(v) => save({ notifyHrChange: v })}
            />
          </Group>
        </ScrollView>
      )}

      {toast.element}
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.group}>
      <Txt variant="caption" tone="secondary" accessibilityRole="header" style={styles.groupTitle}>
        {title}
      </Txt>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function SwitchRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const styles = useStyles();
  const { c } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Txt variant="body">{label}</Txt>
        {hint ? (
          <Txt variant="caption" tone="secondary">
            {hint}
          </Txt>
        ) : null}
      </View>
      {/* react-native-web's Switch slides its thumb the wrong way under RTL; native mirrors fine. */}
      <View {...(Platform.OS === 'web' ? { dir: 'ltr' } : null)}>
        <Switch
          value={value}
          onValueChange={onChange}
          accessibilityLabel={label}
          accessibilityHint={hint}
          trackColor={{ true: c.status.present, false: c.border.subtle }}
          thumbColor={c.surface.base}
          // react-native-web colours the "on" thumb with its own prop.
          {...{ activeThumbColor: c.surface.base }}
        />
      </View>
    </View>
  );
}

function Segment({
  label,
  icon,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  icon?: ReactNode;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={label}
      aria-checked={selected}
      aria-disabled={!!disabled}
      style={({ pressed }) => [
        styles.segment,
        selected && styles.segmentOn,
        disabled && styles.segmentOff,
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.segmentInner}>
        {icon}
        <Txt
          variant="body"
          center
          style={selected ? styles.segmentOnText : null}
          tone={disabled && !selected ? 'disabled' : 'primary'}
        >
          {label}
        </Txt>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  page: { flex: 1, backgroundColor: c.surface.page },
  body: { padding: space.screen, gap: space.xl, paddingBottom: space.xxl * 2 },
  group: { gap: space.sm },
  groupTitle: { paddingHorizontal: space.xs, fontFamily: font.medium },
  card: {
    ...cardSurface(c),

    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border.subtle,
  },
  column: { flexDirection: 'column', alignItems: 'stretch' },
  text: { flex: 1, gap: 2 },
  segments: { flexDirection: 'row', gap: space.sm },
  segment: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border.subtle,
    backgroundColor: c.surface.base,
  },
  segmentOn: { backgroundColor: c.brand.accent, borderColor: c.brand.accent },
  segmentOnText: { color: c.onAccent, fontFamily: font.semibold },
  segmentInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  segmentOff: { opacity: 0.6 },
  segmentsTight: { flexDirection: 'row', gap: space.xs },
  days: { flexDirection: 'row', gap: space.xs },
  dayChip: {
    flex: 1,
    minHeight: 36,
    flexDirection: 'row',
    gap: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.tile,
    backgroundColor: c.surface.page,
  },
  dayOn: { backgroundColor: c.surface.accent },
  dayWeekly: { backgroundColor: c.cmd.tint },
  pad: { padding: space.md },
  steppers: {
    // RTL is forced everywhere, so row-reverse puts the hour on the left: clocks read "HH:MM".
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.lg,
    paddingVertical: space.md,
  },
  stepper: { alignItems: 'center', gap: space.xs },
  stepValue: { minWidth: 64 },
  stepButton: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface.base,
    borderWidth: 1,
    borderColor: c.border.subtle,
  },
}));
