import { BULK_MAX, CATEGORY_CODES, type CategoryCode, type GroupReportRow } from '@doch1/shared';
import { router } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import {
  Banner,
  EmptyState,
  ErrorState,
  LoadingScreen,
  PillButton,
  Sheet,
  Skeleton,
  TopBar,
  useSideMenu,
  Txt,
  useToast,
} from '../../components';
import { Chip } from '../../components/commander/Chip';
import { EmergencyConfirm } from '../../components/commander/EmergencyConfirm';
import { NotCommander } from '../../components/commander/NotCommander';
import { GroupPicker } from '../../components/commander/GroupPicker';
import { ReportEditor } from '../../components/commander/ReportEditor';
import { SoldierModal } from '../../components/commander/SoldierModal';
import { SoldierRow } from '../../components/commander/SoldierRow';
import { SummaryHero } from '../../components/commander/SummaryHero';
import {
  canApprove,
  categoryName,
  defaultScope,
  flattenGroups,
  pinStarred,
  shortDayIL,
  viewWindow,
  type Scope,
} from '../../hooks/commander/logic';
import {
  useApprove,
  useCommanderGroups,
  useGroupReports,
  useToggleFavorite,
} from '../../hooks/commander/useCommander';
import { useStartEmergency } from '../../hooks/commander/useEmergency';
import {
  emergency as te,
  commanderTeam as tt,
  commander as t,
} from '../../i18n/he';
import type { ApiError } from '../../lib/api';
import { useStatuses, useTodayReport } from '../../lib/hooks/useReports';
import { font, radius, space, type } from '../../theme/tokens';
import { makeStyles, useTheme } from '../../theme/theme';

/** F8 — commander: group reports for a day, with search, filters and starred soldiers on top. */
export default function CommanderList() {
  const st = useStyles();
  const menu = useSideMenu();
  const { c: th } = useTheme();
  const groups = useCommanderGroups();
  const today = useTodayReport();
  const statuses = useStatuses();
  const favorite = useToggleFavorite();
  const approve = useApprove();
  const toast = useToast();
  const [approveError, setApproveError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<GroupReportRow | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  // E4: "דיווח במקומו" straight from a "לא דיווח/ה" row.
  const startEmergency = useStartEmergency();
  const [confirmEmergency, setConfirmEmergency] = useState(false);
  const [emergencyError, setEmergencyError] = useState<string | null>(null);

  const [scope, setScope] = useState<Scope | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<ListFilter>(undefined);

  // Debounce the server-side search.
  useEffect(() => {
    const id = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const effScope = scope ?? (groups.data ? defaultScope(groups.data) : null);
  const todayDate = today.data?.date;
  const day = date ?? todayDate;
  const list = useGroupReports(
    effScope && day ? { ...effScope, date: day, pending: false, q, category: undefined } : null,
  );
  const allRows = useMemo(() => pinStarred(list.data?.rows ?? []), [list.data]);
  const rows = useMemo(() => allRows.filter((r) => matches(r, filter)), [allRows, filter]);
  // The list shows the previous result while a new day/group/search loads — never bulk-approve that.
  const listSettled = !list.isPlaceholderData && !list.isFetching && search === q;

  if (groups.isError) {
    return <ErrorState message={groups.error.message} onRetry={() => groups.refetch()} />;
  }
  if (!groups.data || !todayDate) return <LoadingScreen />;
  if (!effScope) return <NotCommander />;

  const counts = list.data?.counts;
  const openEmergencyId = list.data?.openEmergencyId ?? null;
  const groupName = effScope.includeSub
    ? t.allGroups
    : (flattenGroups(groups.data).find((g) => g.id === effScope.groupId)?.name ?? '');
  const openLive = (id: string) =>
    router.push({ pathname: '/commander/emergency/[id]', params: { id } });
  const approvable = rows.filter(canApprove);
  const countOf = (f: ListFilter) => allRows.filter((r) => matches(r, f)).length;
  const filterLabel = (f: ListFilter) =>
    !f
      ? t.filterAll
      : f === 'pending'
        ? tt.filterPending
        : f === 'not_reported'
          ? tt.filterNotReported
          : categoryName(statuses.data, f);
  const openRow = allRows.find((r) => r.soldier.id === openId) ?? null;

  const approveOne = (r: GroupReportRow, onDone?: () => void) => {
    if (!r.report) return;
    setApprovingId(r.soldier.id);
    approve.mutate([r.report.id], {
      onSuccess: () => {
        toast.show(tt.approvedOne);
        onDone?.();
      },
      onError: (e) => toast.show((e as ApiError).message),
      onSettled: () => setApprovingId(null),
    });
  };
  // Approves only the pending rows currently shown (filter + search), in BULK_MAX chunks.
  const approveAll = async () => {
    setApproveError(null);
    setBulkBusy(true);
    const ids = approvable.map((r) => r.report!.id);
    let n = 0;
    try {
      for (let i = 0; i < ids.length; i += BULK_MAX) {
        n += (await approve.mutateAsync(ids.slice(i, i + BULK_MAX))).approvedCount;
      }
      setConfirmAll(false);
      toast.show(tt.approvedK(n));
    } catch (e) {
      setApproveError(n ? `${tt.approvedK(n)} · ${(e as ApiError).message}` : (e as ApiError).message);
    } finally {
      setBulkBusy(false);
    }
  };
  const openDetails = (r: GroupReportRow) => {
    setOpenId(null);
    router.push({
      pathname: '/commander/soldier/[id]',
      params: {
        id: r.soldier.id,
        groupId: effScope.groupId,
        includeSub: String(effScope.includeSub),
        date: day!,
      },
    });
  };
  const catName = (r: GroupReportRow) =>
    r.report ? categoryName(statuses.data, r.report.reason.categoryCode) : '';

  const header = (
    <View style={st.header}>
      <Banner kind="danger" text={t.lockBanner} />
      {openEmergencyId ? (
        <Pressable onPress={() => openLive(openEmergencyId)} accessibilityRole="link">
          <Banner kind="warning" text={te.activeBanner} />
        </Pressable>
      ) : null}
      <GroupPicker groups={groups.data} value={effScope} onChange={setScope} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.chips}
      >
        {viewWindow(todayDate).map((d) => (
          <Chip
            key={d}
            label={d === todayDate ? t.today : shortDayIL(d)}
            selected={d === day}
            onPress={() => setDate(d)}
          />
        ))}
      </ScrollView>

      <View style={st.toolbar}>
        <Txt variant="heading" style={st.flex}>
          {t.soldiersCount(counts?.total ?? 0)}
        </Txt>
        <View style={st.toggle}>
          <Txt variant="body" tone={openEmergencyId ? 'present' : 'secondary'}>
            {te.toggle}
          </Txt>
          <Switch
            value={!!openEmergencyId}
            disabled={!list.data}
            // On → confirm and start. Off → the live view, where the event is ended.
            onValueChange={(on) => {
              if (on) setConfirmEmergency(true);
              else if (openEmergencyId) openLive(openEmergencyId);
            }}
            accessibilityLabel={te.toggle}
            trackColor={{ true: th.status.present, false: th.border.subtle }}
          />
        </View>
      </View>
      <View style={st.search}>
        <Search size={20} strokeWidth={1.75} color={th.text.secondary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t.search}
          placeholderTextColor={th.text.disabled}
          accessibilityLabel={t.search}
          style={st.input}
        />
      </View>

      {counts ? (
        <SummaryHero
          counts={counts}
          presentOn={filter === 'on_base'}
          missingOn={filter === 'not_reported'}
          onPresent={() => setFilter(filter === 'on_base' ? undefined : 'on_base')}
          onMissing={() => setFilter(filter === 'not_reported' ? undefined : 'not_reported')}
        />
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.chips}
      >
        {([undefined, ...CATEGORY_CODES, 'pending', 'not_reported'] as ListFilter[]).map((f) => (
          <Chip
            key={f ?? 'all'}
            label={tt.chipLabel(filterLabel(f), countOf(f))}
            tone={f === 'not_reported' ? 'missing' : undefined}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </ScrollView>
      {list.data ? (
        <Txt variant="caption" tone="secondary">
          {tt.shown(rows.length, filterLabel(filter))}
        </Txt>
      ) : null}
    </View>
  );

  const footer =
    list.data && rows.length > 0 ? (
      <View style={st.footer}>
        <PillButton
          label={approvable.length ? tt.approveAll(approvable.length) : tt.nothingPending}
          variant="primary"
          onPress={() => setConfirmAll(true)}
          disabled={approvable.length === 0 || !listSettled}
        />
        {approvable.length ? (
          <Txt variant="caption" tone="secondary" center>
            {tt.approveAllCaption}
          </Txt>
        ) : null}
      </View>
    ) : null;

  return (
    <View style={st.page}>
      <TopBar title={t.title} onMenu={menu.open} />
      {menu.element}
      <FlatList
        data={list.data ? rows : []}
        keyExtractor={(r) => r.soldier.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <SoldierRow
            row={item}
            categoryName={catName(item)}
            canApprove={canApprove(item)}
            approving={approvingId === item.soldier.id}
            onPress={() => setOpenId(item.soldier.id)}
            onEdit={() => setEditRow(item)}
            onApprove={() => approveOne(item)}
            onStar={() => favorite.mutate({ soldierId: item.soldier.id, on: !item.isFavorite })}
          />
        )}
        ListEmptyComponent={
          list.isError ? (
            <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
          ) : !list.data ? (
            <View style={st.skeletons}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={56} />
              ))}
            </View>
          ) : (
            <View style={st.empty}>
              <EmptyState title={q || filter ? tt.emptyFiltered : t.emptyList} />
              {filter || search ? (
                <PillButton
                  label={tt.clearFilter}
                  variant="soft"
                  onPress={() => {
                    setFilter(undefined);
                    setSearch('');
                  }}
                />
              ) : null}
            </View>
          )
        }
        ListFooterComponent={footer}
        contentContainerStyle={st.content}
      />
      <SoldierModal
        row={openRow}
        categoryName={openRow ? catName(openRow) : ''}
        canApprove={!!openRow && canApprove(openRow)}
        approving={!!openRow && approvingId === openRow.soldier.id}
        onClose={() => setOpenId(null)}
        onApprove={() => openRow && approveOne(openRow, () => setOpenId(null))}
        onEdit={() => {
          setEditRow(openRow);
          setOpenId(null);
        }}
        onDetails={openRow ? () => openDetails(openRow) : undefined}
      />
      {statuses.data && editRow ? (
        <ReportEditor
          visible
          onClose={() => setEditRow(null)}
          onSaved={() => {
            const r = editRow;
            setEditRow(null);
            // The server approves a report a commander writes (SPEC §9 row 37).
            toast.show(tt.editedApproved(r.soldier.firstName));
          }}
          statuses={statuses.data}
          soldierId={editRow.soldier.id}
          soldierName={`${editRow.soldier.firstName} ${editRow.soldier.lastName}`}
          date={day!}
          report={editRow.report}
        />
      ) : null}
      <Sheet
        visible={confirmAll}
        onClose={() => {
          setConfirmAll(false);
          setApproveError(null);
        }}
        title={tt.confirmTitle(approvable.length)}
      >
        <Txt variant="body">{tt.confirmBody(filterLabel(filter), q)}</Txt>
        {approveError ? <Banner kind="danger" text={approveError} /> : null}
        <PillButton
          label={tt.confirm}
          variant="primary"
          onPress={approveAll}
          loading={bulkBusy}
          disabled={approvable.length === 0 || !listSettled}
        />
        <PillButton label={tt.cancel} variant="ghost" onPress={() => setConfirmAll(false)} />
      </Sheet>
      <EmergencyConfirm
        visible={confirmEmergency}
        groupName={groupName}
        defaultIncludeSub
        loading={startEmergency.isPending}
        error={emergencyError}
        onCancel={() => {
          setConfirmEmergency(false);
          setEmergencyError(null);
        }}
        onStart={({ includeSub, message }) => {
          setEmergencyError(null);
          startEmergency.mutate(
            { groupId: effScope.groupId, includeSub: includeSub || effScope.includeSub, message },
            {
              onSuccess: ({ id }) => {
                setConfirmEmergency(false);
                openLive(id);
              },
              onError: (e) => setEmergencyError((e as ApiError).message),
            },
          );
        }}
      />
      {toast.element}
    </View>
  );
}

/** Client-side filter over today's full list (DESIGN.md §7.5 item 3). */
type ListFilter = CategoryCode | 'pending' | 'not_reported' | undefined;

const matches = (r: GroupReportRow, f: ListFilter) =>
  !f
    ? true
    : f === 'not_reported'
      ? !r.report
      : f === 'pending'
        ? canApprove(r)
        : r.report?.reason.categoryCode === f;

const useStyles = makeStyles((c) => ({
  flex: { flex: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  footer: { gap: space.sm, padding: space.screen },
  empty: { gap: space.md, padding: space.screen },
  page: { flex: 1, backgroundColor: c.surface.page },
  content: { paddingBottom: space.xxl * 3 },
  header: { padding: space.screen, gap: space.md },
  chips: { gap: space.sm },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border.subtle,
    backgroundColor: c.surface.base,
  },
  input: {
    ...type.body,
    fontFamily: font.regular,
    color: c.text.primary,
    flex: 1,
    minHeight: 44,
    textAlign: 'right',
  },
  skeletons: { padding: space.screen, gap: space.sm },
}));
