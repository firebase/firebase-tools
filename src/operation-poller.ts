import { Queue } from "./throttler/queue";
import * as api from "./api";
import { FirebaseError } from "./error";

export interface OperationPollerOptions {
  pollerName?: string;
  apiOrigin: string;
  apiVersion: string;
  operationResourceName: string;
  backoff?: number;
  masterTimeout?: number;
}

const DEFAULT_INITIAL_BACKOFF_DELAY_MILLIS = 250;
const DEFAULT_MASTER_TIMEOUT_MILLIS = 30000;

interface OperationResult<T> {
  response?: T;
  error?: {
    message: string;
    code: number;
  };
}

export class OperationPoller<T> {
  /**
   * Returns a promise that resolves when the operation is completed with a successful response.
   * Rejects the promise if the masterTimeout runs out before the operation is "done", or when it is
   * "done" with an error response, or when the api request rejects with an unrecoverable error.
   */
  async poll(options: OperationPollerOptions): Promise<T> {
    const queue: Queue<() => Promise<OperationResult<T>>, OperationResult<T>> = new Queue({
      name: options.pollerName || "LRO Poller",
      concurrency: 1,
      retries: Number.MAX_SAFE_INTEGER,
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
    return response!;
  }

  private getPollingTask(options: OperationPollerOptions): () => Promise<OperationResult<T>> {
    const { apiOrigin, apiVersion, operationResourceName } = options;
    const requestOptions = { auth: true, origin: apiOrigin };
    return async () => {
      let apiResponse;

      try {
        apiResponse = await api.request(
          "GET",
          `/${apiVersion}/${operationResourceName}`,
          requestOptions
        );
      } catch (err) {
        // Responses with 500 or 503 status code are treated as retriable errors
        if (err.status === 500 || err.status === 503) {
          throw err;
        }
        return { error: err };
      }

      if (!apiResponse.body || !apiResponse.body.done) {
        throw new Error("Polling incomplete, should trigger retry with backoff");
      }

      return apiResponse.body as OperationResult<T>;
    };
  }
}

export function pollOperation<T>(options: OperationPollerOptions): Promise<T> {
  return new OperationPoller<T>().poll(options);
}
