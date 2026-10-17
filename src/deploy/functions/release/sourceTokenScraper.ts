import { FirebaseError } from "../../../error";
import { assertExhaustive } from "../../../functional";
import { logger } from "../../../logger";

type TokenFetchState = "NONE" | "FETCHING" | "VALID";
interface TokenFetchResult {
  token?: string;
  aborted: boolean;
}

/**
 * Shares one source build across function deploys in a region. The first caller of getToken()
 * builds from source; other callers wait until the poller sees that build's source token.
 */
export class SourceTokenScraper {
  private tokenValidDurationMs;
  private resolve!: (token: TokenFetchResult) => void;
  private promise: Promise<TokenFetchResult>;
  private expiry: number | undefined;
  private fetchState: TokenFetchState;
  private currentFetcher: symbol | undefined;

  constructor(validDurationMs = 1500000) {
    this.tokenValidDurationMs = validDurationMs;
    this.promise = new Promise((resolve) => (this.resolve = resolve));
    this.fetchState = "NONE";
  }

  /**
   * Runs an operation that may reuse a shared source build. If the operation retries, `fn`
   * should wrap the whole retry loop (e.g. `functionExecutor.run`) and call `getToken()` at the
   * start of every attempt. Wrapping the retries keeps other callers waiting through this
   * caller's retries instead of building in parallel, and fetching per attempt refreshes a
   * token that expired during a backoff. If `fn` throws while this caller is the one building
   * from source, waiting callers are released.
   */
  async withToken<T>(fn: (getToken: () => Promise<string | undefined>) => Promise<T>): Promise<T> {
    const callerId = Symbol();
    let abortedWhileWaiting = false;
    // Wait before entering fn (e.g. before taking an executor slot) while another caller builds;
    // only claim the build inside fn.
    if (this.fetchState === "FETCHING") {
      const result = await this.promise;
      abortedWhileWaiting = result.aborted;
    }

    try {
      return await fn(async () => {
        if (abortedWhileWaiting) {
          abortedWhileWaiting = false;
          return undefined;
        }
        return this.getTokenForCaller(callerId);
      });
    } catch (err) {
      // Only abort if this caller still owns the in-flight token fetch.
      if (this.currentFetcher === callerId) {
        this.abort();
      }
      throw err;
    }
  }

  private abort(): void {
    if (this.fetchState === "FETCHING") {
      this.fetchState = "NONE";
      this.currentFetcher = undefined;
      const resolve = this.resolve;
      this.promise = new Promise((r) => (this.resolve = r));
      resolve({ aborted: true });
    }
  }

  private async getTokenForCaller(callerId: symbol): Promise<string | undefined> {
    if (this.fetchState === "NONE") {
      // First caller (or first caller after an abort): claim the fetch and deploy without a token.
      this.fetchState = "FETCHING";
      this.currentFetcher = callerId;
      return undefined;
    } else if (this.fetchState === "FETCHING") {
      // Active fetcher retrying after a transient error: keep deploying without a token.
      if (this.currentFetcher === callerId) {
        return undefined;
      }
      // Concurrent caller: wait for the active fetcher to poll a token or abort.
      const tokenResult = await this.promise;
      if (tokenResult.aborted) {
        return undefined;
      }
      return tokenResult.token;
    } else if (this.fetchState === "VALID") {
      // Token expired (e.g. after long retry backoffs): become the new fetcher to refresh it.
      if (this.isTokenExpired()) {
        this.fetchState = "FETCHING";
        this.currentFetcher = callerId;
        this.promise = new Promise((resolve) => (this.resolve = resolve));
        return undefined;
      }
      const tokenResult = await this.promise;
      return tokenResult.token;
    } else {
      assertExhaustive(this.fetchState);
    }
  }

  private isTokenExpired(): boolean {
    if (this.expiry === undefined) {
      throw new FirebaseError(
        "Your deployment is checking the expiration of a source token that has not yet been polled. " +
          "Hitting this case should never happen and should be considered a bug. " +
          "Please file an issue at https://github.com/firebase/firebase-tools/issues " +
          "and try deploying your functions again.",
      );
    }
    return Date.now() >= this.expiry;
  }

  get poller() {
    return (op: any) => {
      // A failed op without a token isn't a reusable build. Leave the fetch in flight so the
      // fetcher's retry (or abort) decides what waiters do.
      if (op.metadata?.sourceToken || (op.done && !op.error)) {
        const [, , , /* projects*/ /* project*/ /* regions*/ region] =
          op.metadata?.target?.split("/") || [];
        logger.debug(`Got source token ${op.metadata?.sourceToken} for region ${region as string}`);
        this.resolve({
          token: op.metadata?.sourceToken,
          aborted: false,
        });
        this.fetchState = "VALID";
        this.currentFetcher = undefined;
        this.expiry = Date.now() + this.tokenValidDurationMs;
      }
    };
  }
}
