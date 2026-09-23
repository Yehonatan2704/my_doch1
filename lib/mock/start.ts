import { setupWorker } from 'msw/browser';
import { mockHandlers } from './handlers';

export async function start() {
  await setupWorker(...mockHandlers()).start({ onUnhandledRequest: 'bypass', quiet: true });
}
