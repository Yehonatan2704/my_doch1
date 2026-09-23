// Web: Supabase's default storage (localStorage) — SECURITY.md §3. Native uses secureStorage.native.ts.
export const secureStorage = undefined;

// Small key/value helper for app flags (mock session). Web: localStorage.
export const kv = {
  get: async (key: string): Promise<string | null> => {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set: async (key: string, value: string) => {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // storage blocked — the session just won't survive a reload
    }
  },
  remove: async (key: string) => {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // ignore
    }
  },
};
