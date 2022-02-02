import { Client } from "./apiv2";
import { FirebaseError } from "./error";
import { Queue } from "./throttler/queue";

export interface OperationPollerOptions {
  pollerName?: string;
  apiOrigin: string;
  apiVersion: string;
  operationResourceName: string;
  backoff?: number;
  maxBackoff?: number;
  masterTimeout?: number;
  onPoll?: (operation: OperationResult<any>) => any;
}

const DEFAULT_INITIAL_BACKOFF_DELAY_MILLIS = 250;
const DEFAULT_MASTER_TIMEOUT_MILLIS = 30000;

export interface OperationResult<T> {
  done?: boolean;
  response?: T;
  error?: {
    message: string;
    code: number;
  };
  metadata?: {
    [key: string]: any;
  };
}

export class OperationPoller<T> {
  /**
   * Returns a promise that resolves when the operation is completed with a successful response.
   * Rejects the promise if the masterTimeout runs out before the operation is "done", or when it is
   * "done" with an error response, or when the api request rejects with an unrecoverable error.
   * @param options poller options.
   */
  async poll(options: OperationPollerOptions): Promise<T> {
    const queue: Queue<() => Promise<OperationResult<T>>, OperationResult<T>> = new Queue({
      name: options.pollerName || "LRO Poller",
      concurrency: 1,
      retries: Number.MAX_SAFE_INTEGER,
      maxBackoff: options.maxBackoff,
      backoff: options.backoff || DEFAULT_INITIAL_BACKOFF_DELAY_MILLIS,
    });

    const masterTimeout = options.masterTimeout || DEFAULT_MASTER_TIMEOUT_MILLIS;

    const { response, error } = await queue.run(this.getPollingTask(options), masterTimeout);
    queue.close();
    if (error) {
      throw error instanceof FirebaseError
        ? error
        : new FirebaseError(error.message, { status: error.code });
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return response!;
  }

  private getPollingTask(options: OperationPollerOptions): () => Promise<OperationResult<T>> {
    const apiClient = new Client({
      urlPrefix: options.apiOrigin,
      apiVersion: options.apiVersion,
      auth: true,
    });
    return async () => {
      let res;
      try {
        res = await apiClient.get<OperationResult<T>>(options.operationResourceName);
      } catch (err: any) {
        // Responses with 500 or 503 status code are treated as retriable errors.
        if (err.status === 500 || err.status === 503) {
          throw err;
        }
        return { error: err };
      }
      if (options.onPoll) {
        options.onPoll(res.body);
      }
      if (!res.body.done) {
        throw new Error("Polling incomplete, should trigger retry with backoff");
      }
      return res.body;
    };
  }
}

export function pollOperation<T>(options: OperationPollerOptions): Promise<T> {
  return new OperationPoller<T>().poll(options);
}
