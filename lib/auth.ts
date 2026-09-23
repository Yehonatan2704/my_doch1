// Session state + Google sign-in (F1). Screens use `useAuthStatus()`, `signInWithGoogle()`,
// and `useSignOut()`; the API client gets the access token from here.
import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { auth as t } from '../i18n/he';
import { setTokenProvider } from './api';
import { clearReminders } from './notifications';
import { kv } from './secureStorage';
import { isMock, supabase } from './supabase';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

let status: AuthStatus = 'loading';
const listeners = new Set<() => void>();
function setStatus(next: AuthStatus) {
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l());
}

// Mock mode (EXPO_PUBLIC_USE_MOCK=1) has no Supabase: "signing in" just sets a local flag, and the
// mock API answers as EXPO_PUBLIC_MOCK_USER_ID.
const MOCK_KEY = 'doch1.mock-session';

async function init() {
  if (isMock) return setStatus((await kv.get(MOCK_KEY)) ? 'signedIn' : 'signedOut');
  if (!supabase) return setStatus('signedOut');
  const sb = supabase;
  setTokenProvider(async () => (await sb.auth.getSession()).data.session?.access_token ?? null);
  sb.auth.onAuthStateChange((_event, session) => setStatus(session ? 'signedIn' : 'signedOut'));
  const { data } = await sb.auth.getSession();
  setStatus(data.session ? 'signedIn' : 'signedOut');
  // Supabase guidance for React Native: refresh tokens only while the app is in the foreground.
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (s) =>
      s === 'active' ? sb.auth.startAutoRefresh() : sb.auth.stopAutoRefresh(),
    );
  }
}
init().catch(() => setStatus('signedOut'));

export function useAuthStatus(): AuthStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
    () => status,
  );
}

/** Error whose message is safe Hebrew to show on the login screen. */
export class SignInError extends Error {}

/** Google only (SPEC §3). Resolves when signed in, or silently when the user cancels. */
export async function signInWithGoogle(): Promise<void> {
  if (isMock) {
    await kv.set(MOCK_KEY, '1');
    return setStatus('signedIn');
  }
  if (!supabase) throw new SignInError(t.notConfigured);

  if (Platform.OS === 'web') {
    // Full-page redirect; Supabase exchanges ?code=… when we land back on /login.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${globalThis.location?.origin ?? ''}/login` },
    });
    if (error) throw new SignInError(t.signInFailed);
    return;
  }

  // Native: PKCE through the system auth session, back to doch1://login (Supabase allowlist).
  const redirectTo = Linking.createURL('login');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data?.url) throw new SignInError(t.signInFailed);
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return; // cancelled / dismissed
  const code = new URL(res.url).searchParams.get('code');
  if (!code) throw new SignInError(t.signInFailed);
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw new SignInError(t.signInFailed);
}

async function signOut() {
  await clearReminders().catch(() => {}); // nothing may fire for the next person on this phone
  if (isMock) await kv.remove(MOCK_KEY);
  else await supabase?.auth.signOut().catch(() => {}); // local session is cleared either way
  setStatus('signedOut');
}

/** Sign out and drop every cached server answer, so the next user sees nothing of this one. */
export function useSignOut() {
  const qc = useQueryClient();
  return useCallback(async () => {
    await signOut();
    qc.clear();
  }, [qc]);
}
