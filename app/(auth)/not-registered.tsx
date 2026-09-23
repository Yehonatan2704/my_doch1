import { Redirect, useLocalSearchParams } from 'expo-router';
import { UserX } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PillButton, Txt } from '../../components';
import { auth as t } from '../../i18n/he';
import { useAuthStatus, useSignOut } from '../../lib/auth';
import { makeStyles, useTheme } from '../../theme/theme';
import { space } from '../../theme/tokens';

/** F1 — signed in with Google, but the email isn't a user (or the user is inactive). */
export default function NotRegistered() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const status = useAuthStatus();
  const signOut = useSignOut();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const s = useStyles();
  const { c } = useTheme();

  if (status === 'signedOut') return <Redirect href="/login" />;
  const inactive = reason === 'inactive';

  return (
    <View style={[s.page, { paddingTop: insets.top, paddingBottom: insets.bottom + space.xl }]}>
      <View style={s.body}>
        <UserX size={64} strokeWidth={1.5} color={c.text.secondary} />
        <Txt variant="title" tone="primary" center accessibilityRole="header">
          {inactive ? t.inactiveTitle : t.notRegisteredTitle}
        </Txt>
        <Txt variant="body" tone="secondary" center>
          {inactive ? t.inactiveBody : t.notRegisteredBody}
        </Txt>
      </View>
      <PillButton
        label={t.logout}
        variant="primary"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          await signOut();
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  page: {
    flex: 1,
    backgroundColor: c.surface.page,
    paddingHorizontal: space.screen,
  },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg },
}));
