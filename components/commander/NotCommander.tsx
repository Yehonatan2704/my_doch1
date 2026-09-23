import { router } from 'expo-router';
import { ShieldOff } from 'lucide-react-native';
import { View } from 'react-native';
import { auth, notCommander as t } from '../../i18n/he';
import { useSignOut } from '../../lib/auth';
import { space } from '../../theme/tokens';
import { makeStyles, useTheme } from '../../theme/theme';
import { PillButton } from '../PillButton';
import { EmptyState } from '../States';
import { TopBar } from '../TopBar';

/** F8/E6: someone who commands no group (and isn't HR) opened the commander area. */
export function NotCommander() {
  const signOut = useSignOut();
  const s = useStyles();
  const { c } = useTheme();
  return (
    <View style={s.page}>
      <TopBar onBack={() => router.replace('/')} />
      <EmptyState
        title={t.title}
        body={t.body}
        icon={<ShieldOff size={48} strokeWidth={1.5} color={c.text.secondary} />}
      />
      <View style={s.actions}>
        <PillButton label={t.back} variant="primary" onPress={() => router.replace('/')} />
        <PillButton label={auth.logout} variant="ghost" onPress={signOut} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  page: { flex: 1, backgroundColor: c.surface.page },
  actions: { padding: space.screen, gap: space.md, paddingBottom: space.xxl },
}));
