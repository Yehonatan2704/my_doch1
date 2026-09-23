// Await before the first API call. Metro picks start.native.ts on iOS/Android, start.ts on web.
export const mockReady: Promise<void> =
  process.env.EXPO_PUBLIC_USE_MOCK === '1'
    ? import('./start').then((m) => m.start())
    : Promise.resolve();
