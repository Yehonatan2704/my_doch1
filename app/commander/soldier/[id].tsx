import { isChangedByOther } from '@doch1/shared';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Paperclip } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Banner,
  EmptyState,
  ErrorState,
  LoadingScreen,
  PillButton,
  StatusCard,
  TopBar,
  Txt,
  useToast,
} from '../../../components';
import { ReportEditor } from '../../../components/commander/ReportEditor';
import { canApprove, categoryName } from '../../../hooks/commander/logic';
import { useApprove, useDocumentUrl, useGroupReports } from '../../../hooks/commander/useCommander';
import { commanderDetail as t } from '../../../i18n/he';
import { hhmmIL } from '../../../lib/time';
import type { ApiError } from '../../../lib/api';
import { useStatuses } from '../../../lib/hooks/useReports';
import { dayLabelIL } from '../../../lib/time';
import { cardSurface, space } from '../../../theme/tokens';
import { makeStyles, useTheme } from '../../../theme/theme';

const back = () => (router.canGoBack() ? router.back() : router.replace('/commander'));

/**
 * F9 — one soldier's report for a day: status, note, document, and the commander actions.
 * Params: `groupId`, `includeSub`, `date` — the list scope the soldier was opened from.
 */
export default function SoldierDetail() {
  const s = useStyles();
  const { c } = useTheme();
  const p = useLocalSearchParams<{
    id: string;
    groupId: string;
    includeSub?: string;
    date: string;
  }>();
  const list = useGroupReports(
    p.groupId && p.date
      ? {
          groupId: p.groupId,
          includeSub: p.includeSub === 'true',
          date: p.date,
          pending: false,
          q: '',
          category: undefined,
        }
      : null,
  );
  const statuses = useStatuses();
  const doc = useDocumentUrl();
  const approve = useApprove();
  const toast = useToast();
  const { bottom } = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (list.isError)
    return <ErrorState message={list.error.message} onRetry={() => list.refetch()} />;
  if (!list.data || !statuses.data) return <LoadingScreen />;

  const row = list.data.rows.find((r) => r.soldier.id === p.id);
  if (!row) {
    return (
      <View style={s.page}>
        <TopBar title={t.title} onBack={back} />
        <EmptyState title={t.notFound} />
      </View>
    );
  }

  const { soldier, report } = row;
  const name = `${soldier.firstName} ${soldier.lastName}`;
  const finalized = !!report?.finalizedAt;
  const changedBy =
    report && isChangedByOther(report.source)
      ? `${report.lastModifiedBy.firstName} ${report.lastModifiedBy.lastName}`
      : null;

  const openDocument = (documentId: string) => {
    setError(null);
    // Fetched on tap: the signed URL lives for seconds, so it's never cached or stored.
    doc.mutate(documentId, {
      onSuccess: ({ url }) => WebBrowser.openBrowserAsync(url),
      onError: (e) => setError((e as ApiError).message),
    });
  };

  return (
    <View style={s.page}>
      <TopBar title={name} onBack={back}>
        <Txt variant="body" tone="primary" center>
          {`${soldier.groupName} · ${dayLabelIL(p.date)}`}
        </Txt>
      </TopBar>

      <ScrollView contentContainerStyle={s.body}>
        {finalized ? <Banner kind="danger" text={t.finalized} /> : null}

        {report ? (
          <StatusCard
            categoryCode={report.reason.categoryCode}
            categoryLabel={categoryName(statuses.data, report.reason.categoryCode)}
            reasonLabel={report.reason.nameHe}
            note={report.note}
            updatedBy={changedBy}
          />
        ) : (
          <View style={s.card}>
            <Txt variant="heading" tone="missing">
              {t.notReported}
            </Txt>
          </View>
        )}

        {report?.approvedBy && report.approvedAt ? (
          <Txt variant="body" tone="present">
            {t.approvedBy(
              `${report.approvedBy.firstName} ${report.approvedBy.lastName}`,
              hhmmIL(report.approvedAt),
            )}
          </Txt>
        ) : null}

        {report?.documentId ? (
          <View style={s.card}>
            <View style={s.docRow}>
              <Paperclip size={20} strokeWidth={1.75} color={c.text.secondary} />
              <Txt variant="body" style={s.flex}>
                {t.document}
              </Txt>
            </View>
            <PillButton
              label={t.viewDocument}
              variant="ghost"
              loading={doc.isPending}
              onPress={() => openDocument(report.documentId!)}
            />
          </View>
        ) : null}

        {error ? <Banner kind="danger" text={error} /> : null}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: bottom + space.md }]}>
        {canApprove(row) ? (
          <PillButton
            label={t.approve}
            variant="primary"
            loading={approve.isPending}
            onPress={() => {
              setError(null);
              approve.mutate([report!.id], {
                onSuccess: () => toast.show(t.approved),
                onError: (e) => setError((e as ApiError).message),
              });
            }}
          />
        ) : null}
        <PillButton
          label={report ? t.edit : t.reportFor}
          variant={report ? 'ghost' : 'dark'}
          onPress={() => setEditing(true)}
          disabled={finalized}
          disabledReason={finalized ? t.finalized : undefined}
        />
      </View>

      <ReportEditor
        visible={editing}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          toast.show(t.saved);
        }}
        statuses={statuses.data}
        soldierId={soldier.id}
        soldierName={name}
        date={p.date}
        report={report}
      />
      {toast.element}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  page: { flex: 1, backgroundColor: c.surface.page },
  body: { padding: space.screen, gap: space.lg, paddingBottom: space.xxl * 3 },
  card: {
    gap: space.md,
    padding: space.lg,
    ...cardSurface(c),
  },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  footer: {
    gap: space.sm,
    paddingHorizontal: space.screen,
    paddingTop: space.md,
    backgroundColor: c.surface.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border.subtle,
  },
}));
