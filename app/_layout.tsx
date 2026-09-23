import {
  IBMPlexSansHebrew_400Regular,
  IBMPlexSansHebrew_500Medium,
  IBMPlexSansHebrew_600SemiBold,
  IBMPlexSansHebrew_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans-hebrew';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import '../lib/mock';
import { ThemeProvider, useTheme } from '../theme/theme';

// Native RTL is forced by expo-localization `forcesRTL` (app.json). Web needs it on <html> so
// portals/modals are RTL too.
if (Platform.OS === 'web') {
  const html = (globalThis as { document?: { documentElement: { dir: string; lang: string } } })
    .document?.documentElement;
  if (html) Object.assign(html, { dir: 'rtl', lang: 'he' });
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    IBMPlexSansHebrew_400Regular,
    IBMPlexSansHebrew_500Medium,
    IBMPlexSansHebrew_600SemiBold,
    IBMPlexSansHebrew_700Bold,
  });

  // Refetch when the app returns to the foreground (SPEC F2: fixes the "stuck" app).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ThemedStack />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function ThemedStack() {
  const { c } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.surface.page } }} />
  );
}
