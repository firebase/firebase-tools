import { Queue } from "../../../throttler/queue";
import { ThrottlerOptions } from "../../../throttler/throttler";

/**
 * An Executor runs lambdas (which may be async).
 */
export interface Executor {
  run<T>(func: () => Promise<T>, opts?: RunOptions): Promise<T>;
}

export type RetryPredicate = (err: any) => boolean;

export function parseErrorCode(err: any): number {
  return (
    err.status ||
    err.code ||
    err.context?.response?.statusCode ||
    err.original?.code ||
    err.original?.context?.response?.statusCode
  );
}

export function hasErrorCode(...codes: number[]): RetryPredicate {
  return (err: any): boolean => codes.includes(parseErrorCode(err));
}

export const isQuotaExhaustion: RetryPredicate = (err: any): boolean => parseErrorCode(err) === 429;
export const isConflict: RetryPredicate = (err: any): boolean => parseErrorCode(err) === 409;
export const isServiceUnavailable: RetryPredicate = (err: any): boolean =>
  parseErrorCode(err) === 503;

export const isTransientError: RetryPredicate = (err: any): boolean =>
  isQuotaExhaustion(err) || isConflict(err) || isServiceUnavailable(err);

export const isServiceAccount404: RetryPredicate = (err: any): boolean => {
  if (parseErrorCode(err) !== 404) {
    return false;
  }
  let message = "";
  try {
    message = [
      err?.message,
      err?.original?.message,
      err?.context?.body?.error?.message,
      String(err),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  } catch {
    message = String(err).toLowerCase();
  }
  return (
    message.includes("serviceaccount") ||
    message.includes("service account") ||
    /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.gserviceaccount\.com\b/i.test(message) ||
    /\bgserviceaccount\.com\b/i.test(message)
  );
};

export const isCloudRunResourceExhausted: RetryPredicate = (err: any): boolean =>
  parseErrorCode(err) === 8;

export interface RunOptions {
  retryPredicates?: RetryPredicate[];
}

interface Operation {
  func: () => any;
  retryPredicates: RetryPredicate[];
  result?: any;
  error?: any;
}

async function handler(op: Operation): Promise<void> {
  try {
    op.result = await op.func();
  } catch (err: any) {
    // Throw retry functions back to the queue where they will be retried
    // with backoffs.
    const shouldRetry = op.retryPredicates.some((predicate) => predicate(err));
    if (shouldRetry) {
      throw err;
    }
    err.code = parseErrorCode(err);
    op.error = err;
  }
  return;
}

export interface QueueExecutorOptions extends Omit<ThrottlerOptions<Operation, void>, "handler"> {
  defaultRetryPredicates?: RetryPredicate[];
}

/**
 * A QueueExecutor implements the executor interface on top of a throttler queue.
 * Transient errors (429, 409, 503) will be retried within the ThrottlerOptions parameters by default,
 * but all other errors are rethrown unless custom retryPredicates are supplied.
 */
export class QueueExecutor implements Executor {
  private readonly queue: Queue<Operation, void>;
  private readonly defaultRetryPredicates: RetryPredicate[];

  constructor(options: QueueExecutorOptions) {
    const { defaultRetryPredicates, ...throttlerOptions } = options;
    this.defaultRetryPredicates = defaultRetryPredicates || [isTransientError];
    this.queue = new Queue({ ...throttlerOptions, handler });
  }

  async run<T>(func: () => Promise<T>, opts?: RunOptions): Promise<T> {
    const retryPredicates: RetryPredicate[] = opts?.retryPredicates
      ? [...opts.retryPredicates]
      : [...this.defaultRetryPredicates];

    const op: Operation = {
      func,
      retryPredicates,
    };
    await this.queue.run(op);
    if (op.error) {
      throw op.error;
    }
    return op.result as T;
  }
}

/**
 * Inline executors run their functions right away.
 * Useful for testing.
 */
export class InlineExecutor implements Executor {
  run<T>(func: () => Promise<T>): Promise<T> {
    return func();
  }
}
