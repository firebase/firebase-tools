import { Queue } from "../../../throttler/queue";
import { ThrottlerOptions } from "../../../throttler/throttler";

/**
 * An Executor runs lambdas (which may be async).
 */
export interface Executor {
  run<T>(func: () => Promise<T>): Promise<T>;
}

interface Operation {
  func: () => any;
  result?: any;
  error?: any;
}

async function handler(op: Operation): Promise<undefined> {
  try {
    op.result = await op.func();
  } catch (err: any) {
    // Throw retry functions back to the queue where they will be retried
    // with backoffs. To do this we cast a wide net for possible error codes.
    // These can be either TOO MANY REQUESTS (429) errors or CONFLICT (409)
    // errors. This can be a raw error with the correct HTTP code, a raw
    // error with the HTTP code stashed where GCP puts it, or a FirebaseError
    // wrapping either of the previous two cases.
    const code =
      err.status ||
      err.code ||
      err.context?.response?.statusCode ||
      err.original?.code ||
      err.original?.context?.response?.statusCode;
    if (code === 429 || code === 409) {
      throw err;
    }
    op.error = err;
  }
  return;
}

/**
 * A QueueExecutor implements the executor interface on top of a throttler queue.
 * Any 429 will be retried within the ThrottlerOptions parameters, but all
 * other errors are rethrown.
 */
export class QueueExecutor implements Executor {
  private readonly queue: Queue<Operation, void>;
  constructor(options: Omit<ThrottlerOptions<Operation, void>, "handler">) {
    this.queue = new Queue({ ...options, handler });
  }

  async run<T>(func: () => Promise<T>): Promise<T> {
    const op: Operation = { func };
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
export class InlineExecutor {
  run<T>(func: () => Promise<T>): Promise<T> {
    return func();
  }
}
