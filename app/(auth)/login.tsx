import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingScreen, PillButton, Txt } from '../../components';
import { auth as t, common } from '../../i18n/he';
import { SignInError, signInWithGoogle, useAuthStatus } from '../../lib/auth';
import { isMock } from '../../lib/supabase';
import { makeStyles, useTheme } from '../../theme/theme';
import { space } from '../../theme/tokens';

/* eslint-disable @typescript-eslint/no-require-imports -- static image assets for Metro */
const logoLight = require('../../assets/logo-light.webp');
const logoDark = require('../../assets/logo-dark.webp');
/* eslint-enable @typescript-eslint/no-require-imports */

/** F1 — "התחברות עם Google" → Google → back in the app. */
export default function Login() {
  const status = useAuthStatus();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const s = useStyles();
  const { scheme } = useTheme();
  const [error, setError] = useState<string | null>(null);

  if (status === 'signedIn') return <Redirect href="/" />;
  if (status === 'loading') return <LoadingScreen />;

  const onLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof SignInError ? e.message : t.signInFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[s.page, { paddingTop: insets.top, paddingBottom: insets.bottom + space.xl }]}>
      <View style={s.hero}>
        <Image
          source={scheme === 'dark' ? logoDark : logoLight}
          style={s.logo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <Txt variant="display" tone="primary" center accessibilityRole="header">
          {common.appName}
        </Txt>
        <Txt variant="heading" tone="secondary" center>
          {t.subtitle}
        </Txt>
      </View>
      <View style={s.actions}>
        <PillButton label={t.loginButton} variant="primary" loading={busy} onPress={onLogin} />
        {error ? (
          <Txt variant="body" tone="missing" center accessibilityRole="alert">
            {error}
          </Txt>
        ) : null}
        {isMock ? (
          <Txt variant="caption" tone="secondary" center>
            {t.demoMode}
          </Txt>
        ) : null}
        <Txt variant="caption" tone="primary" center>
          {t.support}
        </Txt>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  page: {
    flex: 1,
    backgroundColor: c.surface.page,
    paddingHorizontal: space.screen,
    justifyContent: 'space-between',
  },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  logo: { width: 144, height: 144, marginBottom: space.lg },
  actions: { gap: space.md },
}));
