// Dev-only design-system gallery (D1): every component in its states, for review and for Lane E.
// Production builds redirect to home.
import { Redirect } from 'expo-router';
import { Flag } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  Banner,
  CalendarMonth,
  CategoryTile,
  Countdown,
  EmptyState,
  ErrorState,
  HeroAction,
  OptionRow,
  PillButton,
  Sheet,
  Skeleton,
  StatusCard,
  TopBar,
  Txt,
  useToast,
} from '../../components';
import { makeStyles, useTheme } from '../../theme/theme';
import { cardSurface, space } from '../../theme/tokens';

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

export default function Gallery() {
  const styles = useStyles();
  const { c } = useTheme();
  const [picked, setPicked] = useState('a');
  const [sheet, setSheet] = useState<string | null>(null);
  const toast = useToast();
  if (!__DEV__) return <Redirect href="/" />;

  return (
    <View style={styles.page}>
      <TopBar title="רכיבי עיצוב" onMenu={() => {}} onClose={() => {}} />
      <ScrollView contentContainerStyle={styles.body}>
        <Section title="Countdown">
          <Countdown deadline={inMinutes(125)} />
          <Countdown deadline={inMinutes(12)} />
          <Countdown deadline={inMinutes(-5)} />
        </Section>

        <Section title="HeroAction" yellow>
          <View style={styles.center}>
            <HeroAction
              label="אני בבסיס"
              icon={<Flag size={56} strokeWidth={1.75} color={c.text.primary} />}
              onPress={() => toast.show('הדיווח נשלח ✓')}
            />
          </View>
        </Section>

        <Section title="PillButton">
          <PillButton label="אני במקום אחר" onPress={() => {}} />
          <PillButton label="שליחת דיווח" variant="dark" onPress={() => {}} />
          <PillButton label="דיווחים עתידיים" variant="ghost" onPress={() => {}} />
          <PillButton label="מחיקה" variant="danger" onPress={() => {}} />
          <PillButton label="שליחה" variant="dark" loading onPress={() => {}} />
          <PillButton
            label="שליחת דיווח"
            disabled
            disabledReason="יש לצרף אישור רפואי"
            onPress={() => {}}
          />
        </Section>

        <Section title="CategoryTile" yellow>
          <View style={styles.grid}>
            <CategoryTile code="outside_unit" label="מחוץ ליחידה" onPress={() => {}} />
            <CategoryTile code="annual_leave" label="חופשה שנתית" onPress={() => {}} selected />
          </View>
          <View style={styles.grid}>
            <CategoryTile code="abroad" label='חו"ל' onPress={() => {}} />
            <CategoryTile code="sick_leave" label="חופשת מחלה" onPress={() => {}} />
          </View>
        </Section>

        <Section title="OptionRow">
          <View>
            <OptionRow
              label="בתפקיד מחוץ ליחידה"
              hint="ניתן להוסיף הערה"
              selected={picked === 'a'}
              onPress={() => setPicked('a')}
            />
            <OptionRow
              label="יום סידורים"
              selected={picked === 'b'}
              onPress={() => setPicked('b')}
            />
            <OptionRow
              label="חופשת מחלה (גימלים)"
              hint="נדרש מסמך"
              selected={picked === 'c'}
              onPress={() => setPicked('c')}
            />
          </View>
        </Section>

        <Section title="StatusCard">
          <StatusCard categoryCode="on_base" categoryLabel="נמצא/ת ביחידה" reasonLabel="נוכח/ת" />
          <StatusCard
            categoryCode="outside_unit"
            categoryLabel="מחוץ ליחידה"
            reasonLabel="אחרי תורנות / משמרת"
            note="משמרת לילה במוצב"
            updatedBy="עידו גפן"
          />
        </Section>

        <Section title="CalendarMonth">
          <CalendarMonth
            month={{ year: 2026, month: 9 }}
            today="2026-09-23"
            isEnabled={(d) => d !== '2026-09-30'}
            onPressDay={setSheet}
            onPrev={() => {}}
            onNext={() => {}}
            marks={{
              '2026-09-20': { present: true },
              '2026-09-21': { label: 'גימלים', attachment: true },
              '2026-09-22': { label: 'חופשה שנתית', changed: true },
              '2026-09-24': { present: true, scheduled: true },
              '2026-09-25': { label: 'חו״ל', scheduled: true },
            }}
          />
        </Section>
        <Sheet visible={!!sheet} onClose={() => setSheet(null)} title={sheet ?? undefined}>
          <StatusCard categoryCode="on_base" categoryLabel="נמצא/ת ביחידה" reasonLabel="נוכח/ת" />
          <PillButton label="סגירה" variant="ghost" onPress={() => setSheet(null)} />
        </Sheet>

        <Section title="Banner">
          <Banner kind="danger" text="לא ניתן לשלוח דיווח אחרי 23:59" />
          <Banner kind="warning" text="הדיווח באיחור" />
          <Banner kind="info" text="ניתן לדווח עד 7 ימים קדימה" />
        </Section>

        <Section title="Skeleton">
          <Skeleton height={20} width="60%" />
          <Skeleton height={56} />
          <Skeleton height={48} width={48} round />
        </Section>

        <Section title="EmptyState / ErrorState">
          <EmptyState body="לא נמצאו דיווחים בחודש זה" />
          <ErrorState message="אין חיבור לרשת. בדקו את החיבור ונסו שוב" onRetry={() => {}} />
        </Section>
      </ScrollView>
      {toast.element}
    </View>
  );
}

function Section({
  title,
  yellow,
  children,
}: {
  title: string;
  yellow?: boolean;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  const { c } = useTheme();
  return (
    <View style={[styles.section, yellow && { backgroundColor: c.surface.page }]}>
      <Txt variant="caption" tone="secondary">
        {title}
      </Txt>
      {children}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  page: { flex: 1, backgroundColor: c.surface.page },
  body: { padding: space.screen, gap: space.lg, paddingBottom: space.xxl * 3 },
  section: {
    gap: space.md,
    padding: space.md,
    ...cardSurface(c),
  },
  center: { alignItems: 'center', paddingVertical: space.lg },
  grid: { flexDirection: 'row' },
}));
