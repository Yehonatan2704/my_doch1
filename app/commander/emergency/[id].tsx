import type { EmergencyDetailResponse } from '@doch1/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Banner,
  ErrorState,
  LoadingScreen,
  PillButton,
  Sheet,
  TopBar,
  Txt,
  useToast,
} from '../../../components';
import { useEmergencyDetail, useEndEmergency } from '../../../hooks/commander/useEmergency';
import { emergency as t } from '../../../i18n/he';
import type { ApiError } from '../../../lib/api';
import { hhmmIL } from '../../../lib/time';
import { cardSurface, radius, space } from '../../../theme/tokens';
import { makeStyles } from '../../../theme/theme';

const back = () => (router.canGoBack() ? router.back() : router.replace('/commander'));

type Response = EmergencyDetailResponse['responses'][number];
const SECTIONS = [
  { key: 'need_help', title: t.needHelp, tone: 'missing' },
  { key: null, title: t.noResponse, tone: 'warning' },
  { key: 'ok', title: t.ok, tone: 'present' },
] as const;

/** F10 — commander live view: counts + who answered what, polled every 5s; end the event. */
export default function EmergencyLive() {
  const st = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useEmergencyDetail(id);
  const end = useEndEmergency();
  const toast = useToast();
  const { bottom } = useSafeAreaInsets();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (detail.isError)
    return <ErrorState message={detail.error.message} onRetry={() => detail.refetch()} />;
  if (!detail.data) return <LoadingScreen />;
  const e = detail.data;
  const open = !e.endedAt;
  const name = (r: Response) => `${r.soldier.firstName} ${r.soldier.lastName}`;

  return (
    <View style={st.page}>
      <TopBar title={t.liveTitle} onBack={back}>
        <Txt variant="body" tone="primary" center>
          {e.group.name}
        </Txt>
      </TopBar>

      <ScrollView contentContainerStyle={st.body}>
        <Txt variant="caption" tone="secondary">
          {t.startedBy(`${e.startedBy.firstName} ${e.startedBy.lastName}`, hhmmIL(e.startedAt))}
          {e.endedAt ? ` · ${t.endedAt(hhmmIL(e.endedAt))}` : ''}
        </Txt>
        {e.message ? <Banner kind="info" text={e.message} /> : null}

        {/* Counts: color + number + word, never color alone. */}
        <View style={st.counts} accessibilityLiveRegion="polite">
          <Count n={e.counts.needHelp} label={t.needHelp} tone="missing" />
          <Count n={e.counts.noResponse} label={t.noResponse} tone="warning" />
          <Count n={e.counts.ok} label={t.ok} tone="present" />
        </View>

        {SECTIONS.map((s) => {
          const people = e.responses.filter((r) => r.status === s.key);
          if (!people.length) return null;
          return (
            <View key={String(s.key)} style={st.section}>
              <Txt variant="heading" tone={s.tone} accessibilityRole="header">
                {`${s.title} (${people.length})`}
              </Txt>
              {people.map((r) => (
                <View key={r.soldier.id} style={[st.person, s.key === 'need_help' && st.help]}>
                  <Txt variant="body" style={st.flex}>
                    {name(r)}
                  </Txt>
                  {r.respondedAt ? (
                    <Txt variant="caption" tone="secondary">
                      {hhmmIL(r.respondedAt)}
                    </Txt>
                  ) : null}
                </View>
              ))}
            </View>
          );
        })}
        {error ? <Banner kind="danger" text={error} /> : null}
      </ScrollView>

      {open ? (
        <View style={[st.footer, { paddingBottom: bottom + space.md }]}>
          <PillButton label={t.end} variant="danger" onPress={() => setConfirm(true)} />
        </View>
      ) : null}

      <Sheet visible={confirm} onClose={() => setConfirm(false)} title={t.end}>
        <Txt variant="body">{t.endConfirm}</Txt>
        <PillButton
          label={t.endYes}
          variant="danger"
          loading={end.isPending}
          onPress={() => {
            setError(null);
            end.mutate(e.id, {
              onSuccess: () => {
                setConfirm(false);
                toast.show(t.ended);
              },
              onError: (err) => {
                setConfirm(false);
                setError((err as ApiError).message);
              },
            });
          }}
        />
        <PillButton label={t.cancel} variant="ghost" onPress={() => setConfirm(false)} />
      </Sheet>
      {toast.element}
    </View>
  );
}

function Count({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone: 'present' | 'missing' | 'warning';
}) {
  const st = useStyles();
  return (
    <View style={st.count} accessible accessibilityLabel={`${n} ${label}`}>
      <Txt variant="display" tone={tone} center>
        {n}
      </Txt>
      <Txt variant="caption" tone="secondary" center>
        {label}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  page: { flex: 1, backgroundColor: c.surface.page },
  body: { padding: space.screen, gap: space.lg, paddingBottom: space.xxl * 3 },
  counts: { flexDirection: 'row', gap: space.sm },
  count: {
    flex: 1,
    paddingVertical: space.md,
    ...cardSurface(c),
  },
  section: {
    gap: 1,
    ...cardSurface(c),
    padding: space.md,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: space.sm,
    borderRadius: radius.card / 2,
  },
  help: { backgroundColor: c.tint.missing.bg },
  flex: { flex: 1 },
  footer: {
    paddingHorizontal: space.screen,
    paddingTop: space.md,
    backgroundColor: c.surface.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border.subtle,
  },
}));
