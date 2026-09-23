// Polyfills must load before msw (MSW React Native docs).
import 'fast-text-encoding';
import 'react-native-url-polyfill/auto';
import { setupServer } from 'msw/native';
import { mockHandlers } from './handlers';

export async function start() {
  setupServer(...mockHandlers()).listen({ onUnhandledRequest: 'bypass' });
}
