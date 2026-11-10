export const DEFAULT_WAIT_TIMEOUT_MS = 10000;
export const DEFAULT_WAIT_INTERVAL_MS = 50;

/**
 * Polls for a condition to be met within a specified timeout.
 * Resolves immediately once predicate returns true.
 * @param predicate A synchronous or asynchronous function returning a boolean.
 * @param timeoutMs Maximum time to wait in milliseconds (default: 10000ms).
 * @param intervalMs Time between predicate evaluations in milliseconds (default: 50ms).
 */
export async function waitForCondition(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = DEFAULT_WAIT_TIMEOUT_MS,
  intervalMs = DEFAULT_WAIT_INTERVAL_MS,
): Promise<void> {
  const startTime = Date.now();
  for (;;) {
    if (await predicate()) {
      return;
    }
    if (Date.now() - startTime >= timeoutMs) {
      throw new Error(
        `Timed out waiting for condition after ${timeoutMs}ms: ${predicate.toString()}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
