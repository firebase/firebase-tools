import { backOff, type BackoffOptions } from "exponential-backoff";

/** Extract an HTTP status from common firebase-tools error shapes. */
export const statusOf = (err: any): number | undefined =>
  err?.context?.response?.statusCode ?? err?.status ?? err?.statusCode;

export interface HttpBackoffOptions extends Partial<BackoffOptions> {
  /**
   * Optional: custom predicate to decide if an error should be retried.
   * If provided, this takes precedence over `statuses`.
   */
  shouldRetry?: (err: unknown, nextAttempt: number) => boolean;

  /**
   * Optional: retry when HTTP status is in this set (e.g., [429, 503]).
   * Ignored if `shouldRetry` is provided.
   */
  statuses?: readonly number[] | ReadonlySet<number>;

  /**
   * Optional: called right before a retry. Use e.g. to log context.
   */
  onRetry?: (info: {
    err: unknown;
    attempt: number;
    maxAttempts?: number;
    status?: number;
  }) => void;
}

/** Base backoff knobs (env-tunable if you want to tweak in CI). */
const defaultBackoff: BackoffOptions = {
  numOfAttempts: Number(process.env.FIREBASE_TOOLS_FUNC_RETRY_MAX ?? 9),
  startingDelay: Number(process.env.FIREBASE_TOOLS_FUNC_RETRY_BASE_MS ?? 60 * 1_000),
  timeMultiple: Number(process.env.FIREBASE_TOOLS_FUNC_RETRY_MULTIPLIER ?? 2),
  maxDelay: Number(process.env.FIREBASE_TOOLS_FUNC_RETRY_MAX_MS ?? 20 * 60 * 1_000),
  jitter: "full",
  delayFirstAttempt: true,
};

/**
 * Generic exponential backoff wrapper for HTTP-ish operations.
 * - Retries when `shouldRetry` returns true OR status is in `statuses`.
 * - If neither is provided, nothing will retry.
 */
export async function withHttpBackoff<T>(
  thunk: () => Promise<T>,
  opts: HttpBackoffOptions = {},
): Promise<T> {
  const statuses =
    opts.statuses instanceof Set
      ? opts.statuses
      : Array.isArray(opts.statuses)
        ? new Set<number>(opts.statuses)
        : undefined;

  const options = {
    ...defaultBackoff,
    ...opts,
  };

  return backOff(thunk, {
    ...options,
    retry: (err, nextAttempt) => {
      const st = statusOf(err);
      const shouldRetry =
        opts.shouldRetry?.(err, nextAttempt) ??
        (st !== undefined && statuses ? statuses.has(st) : false);

      if (shouldRetry) {
        if (opts.onRetry) {
          opts.onRetry({
            err,
            attempt: nextAttempt,
            maxAttempts: options.numOfAttempts,
            status: st,
          });
        }
      }
      return shouldRetry;
    },
  });
}
