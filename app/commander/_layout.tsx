import { Stack } from 'expo-router';
import { AuthGate, TabBar } from '../../components';
import { EmergencyGate } from '../../components/commander/EmergencyGate';
import { canApprove, defaultScope } from '../../hooks/commander/logic';
import { useCommanderGroups, useGroupReports } from '../../hooks/commander/useCommander';
import { useTodayReport } from '../../lib/hooks/useReports';

/**
 * Pending-approval count for the Team tab badge. Same params as the list's default view, so it
 * shares the list's cached query.
 */
function usePendingBadge() {
  const groups = useCommanderGroups();
  const today = useTodayReport();
  const scope = groups.data ? defaultScope(groups.data) : null;
  const date = today.data?.date;
  const list = useGroupReports(
    scope && date ? { ...scope, date, pending: false, q: '', category: undefined } : null,
  );
  const n = list.data?.rows.filter(canApprove).length ?? 0;
  return n > 0 ? n : undefined;
}

function CommanderTabBar() {
  return <TabBar badge={usePendingBadge()} />;
}

/** Commander area (F8–F10): signed-in users only; the screens handle "not a commander" (E6). */
export default function CommanderLayout() {
  return (
    <AuthGate>
      <Stack screenOptions={{ headerShown: false }} />
      <CommanderTabBar />
      {/* A commander is also a soldier: answer roll-calls that include me (F10). */}
      <EmergencyGate />
    </AuthGate>
  );
}
