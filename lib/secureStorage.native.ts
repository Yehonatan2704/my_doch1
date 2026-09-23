import * as SecureStore from 'expo-secure-store';
import { chunkValue, CHUNK_COUNT_SUFFIX } from './chunks';

// The Supabase session lives in the OS keychain/keystore (CLAUDE.md: tokens in expo-secure-store).
// A session can exceed the ~2 KB some iOS versions accept per value, so it is stored in chunks:
// `<key>.n` holds the count, `<key>.0 … <key>.(n-1)` the parts.

async function removeChunks(key: string) {
  const n = Number((await SecureStore.getItemAsync(key + CHUNK_COUNT_SUFFIX)) ?? 0);
  await Promise.all(
    Array.from({ length: n }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)),
  );
  await SecureStore.deleteItemAsync(key + CHUNK_COUNT_SUFFIX);
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const n = Number((await SecureStore.getItemAsync(key + CHUNK_COUNT_SUFFIX)) ?? NaN);
    if (!Number.isInteger(n) || n < 1) return null;
    const parts = await Promise.all(
      Array.from({ length: n }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)),
    );
    return parts.some((p) => p === null) ? null : parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    await removeChunks(key);
    const parts = chunkValue(value);
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${key}.${i}`, p)));
    await SecureStore.setItemAsync(key + CHUNK_COUNT_SUFFIX, String(parts.length));
  },
  async removeItem(key: string): Promise<void> {
    await removeChunks(key);
  },
};

export const kv = {
  get: (key: string) => secureStorage.getItem(key),
  set: (key: string, value: string) => secureStorage.setItem(key, value),
  remove: (key: string) => secureStorage.removeItem(key),
};
