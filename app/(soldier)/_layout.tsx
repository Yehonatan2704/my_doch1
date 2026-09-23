import { Stack } from 'expo-router';
import { AuthGate, TabBar } from '../../components';
import { useReminderSync } from '../../lib/hooks/useReminderSync';

/** Everything the soldier sees needs a signed-in, registered user (F1). */
export default function SoldierLayout() {
  return (
    <AuthGate>
      <ReminderSync />
      <Stack screenOptions={{ headerShown: false }} />
      <TabBar />
    </AuthGate>
  );
}

/** F6: schedules / cancels the local reminders while signed in (D8). */
function ReminderSync() {
  useReminderSync();
  return null;
}
