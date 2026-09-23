import { afterAll, beforeAll, expect, test } from 'vitest';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { api, ApiError, setTokenProvider } from './api';
import { createDb, U } from './mock/fixtures';
import { createHandlers } from './mock/handlers';

const NOW = new Date('2026-09-22T07:00:00Z');
const TEAM1 = '00000000-0000-0000-0000-00000000a003';
let seenAuth: string | null = null;

const server = setupServer(
  http.all('*', ({ request }) => {
    seenAuth = request.headers.get('authorization');
  }),
  ...createHandlers(createDb(NOW), U.team1Cmd, () => NOW),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

test('typed calls, query strings, bearer token, 204s', async () => {
  setTokenProvider(async () => 'tok123');
  expect((await api.me()).user.firstName).toBe('עידו');
  expect(seenAuth).toBe('Bearer tok123');
  const list = await api.groupReports(TEAM1, { pending: true });
  expect(list.rows).toHaveLength(3);
  expect(await api.addFavorite('00000000-0000-0000-0000-000000000017')).toBeUndefined();
});

test('errors become ApiError with code + Hebrew message', async () => {
  const err = await api.groupReports('00000000-0000-0000-0000-00000000a001').catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ status: 403, code: 'FORBIDDEN', message: 'אין הרשאה לבצע פעולה זו' });
});
