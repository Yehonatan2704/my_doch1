import { Redirect } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { ApiError } from '../lib/api';
import { useAuthStatus, useSignOut } from '../lib/auth';
import { gateFor } from '../lib/authGate';
import { useMe } from '../lib/hooks/useMe';
import { makeStyles, useTheme } from '../theme/theme';
import { ErrorState } from './States';

/**
 * Wrap a signed-in area's layout (soldier, commander): signed out → /login, unknown or inactive
 * Google account → /not-registered, expired session → signed out. Children render once /me is OK.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuthStatus();
  const me = useMe(status === 'signedIn');
  const signOut = useSignOut();
  const gate = gateFor(me.error as ApiError | null);

  useEffect(() => {
    if (gate === 'signed-out') signOut();
  }, [gate, signOut]);

  if (status === 'signedOut') return <Redirect href="/login" />;
  if (gate === 'not-registered') {
    const reason = (me.error as ApiError).code === 'INACTIVE_USER' ? 'inactive' : 'unknown';
    return <Redirect href={{ pathname: '/not-registered', params: { reason } }} />;
  }
  if (gate === 'error') {
    return <ErrorState message={(me.error as ApiError).message} onRetry={() => me.refetch()} />;
  }
  if (status === 'loading' || !me.data) return <LoadingScreen />;
  return children;
}

export function LoadingScreen() {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={c.brand.accent} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface.page,
  },
}));
