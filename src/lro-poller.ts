import { Queue } from "./throttler/queue";
import * as api from "./api";
import * as FirebaseError from "./error";

export interface LroPollerOptions {
  pollerName?: string;
  apiOrigin: string;
  apiVersion: "v1" | "v1beta1";
  operationResourceName: string;
  backoff?: number;
  masterTimeout?: number;
}

export interface LroResult {
  error?: FirebaseError;
  response?: any;
}

const DEFAULT_INITIAL_BACKOFF_DELAY_MILLIS = 250;
const DEFAULT_MASTER_TIMEOUT_MILLIS = 15000;

export class LroPoller {
  /**
   * Returns a promise that resolves when the operation is "done", either successfully or with an
   * error response. Rejects the promise if the masterTimeout runs out before the operation is
   * "done".
   */
  async poll(options: LroPollerOptions): Promise<LroResult> {
    const queue: Queue<() => Promise<LroResult>, LroResult> = new Queue({
      name: options.pollerName || "LRO Poller",
      concurrency: 1,
      retries: Number.MAX_SAFE_INTEGER,
      backoff: options.backoff || DEFAULT_INITIAL_BACKOFF_DELAY_MILLIS,
    });

    const masterTimeout = options.masterTimeout || DEFAULT_MASTER_TIMEOUT_MILLIS;

    const lroResult = await queue.run(this.getPollingTask(options), masterTimeout);
    queue.close();

    return lroResult;
  }

  private getPollingTask(options: LroPollerOptions): () => Promise<LroResult> {
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

      const result: LroResult = {};
      const { error, response } = apiResponse.body;
      if (error) {
        result.error = new FirebaseError(error.message, { status: error.code });
      } else {
        result.response = response;
      }
      return result;
    };
  }
}
