// Supabase client — AUTH ONLY (SECURITY.md §5): never used for tables or storage.
// Only the public URL + anon key reach the app (SECURITY.md §10).
import './urlPolyfill';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { secureStorage } from './secureStorage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isMock = process.env.EXPO_PUBLIC_USE_MOCK === '1';

/** Null in mock mode or when the project isn't configured — the login screen says so. */
export const supabase: SupabaseClient | null =
  !isMock && url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: secureStorage, // native: keychain/keystore; web: Supabase default
          autoRefreshToken: true,
          persistSession: true,
          // Web returns from Google with ?code=… on the page itself; native gets it from the
          // auth session result (lib/auth.ts).
          detectSessionInUrl: Platform.OS === 'web',
          flowType: 'pkce',
        },
      })
    : null;
