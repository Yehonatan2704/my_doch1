/**
 * Runs a notification without letting it affect the request that triggered it. Expo being
 * slow or down must never stop an emergency from starting or a report from being saved.
 */
export async function bestEffort(send: () => Promise<unknown>): Promise<void> {
  try {
    await send();
  } catch {
    // Swallowed on purpose: the caller's work is already committed, and the error carries
    // nothing the client could act on.
  }
}
