import { FirebaseError } from "../../../error";
import { assertExhaustive } from "../../../functional";
import { logger } from "../../../logger";

type TokenFetchState = "NONE" | "FETCHING" | "VALID";
interface TokenFetchOptions {
  /**
   * Maximum time to wait for a token before returning undefined.
   * Keeps callers from blocking the entire deploy when the backend
   * never returns a source token (as is possible with some APIs).
   */
  timeoutMs?: number;
}
interface TokenFetchResult {
  token?: string;
  aborted: boolean;
}

/**
 * GCF v1 deploys support reusing a build between function deploys.
 * This class will return a resolved promise for its first call to tokenPromise()
 * and then will always return a promise that is resolved by the poller function.
 */
export class SourceTokenScraper {
  private tokenValidDurationMs;
  private resolve!: (token: TokenFetchResult) => void;
  private promise: Promise<TokenFetchResult>;
  private expiry: number | undefined;
  private fetchState: TokenFetchState;

  constructor(validDurationMs = 1500000) {
    this.tokenValidDurationMs = validDurationMs;
    this.promise = new Promise((resolve) => (this.resolve = resolve));
    this.fetchState = "NONE";
  }

  abort(): void {
    this.resolve({ aborted: true });
  }

  async getToken(options: TokenFetchOptions = {}): Promise<string | undefined> {
    if (this.fetchState === "NONE") {
      this.fetchState = "FETCHING";
      return undefined;
    } else if (this.fetchState === "FETCHING") {
      const tokenResult = await this.waitForToken(options.timeoutMs);
      if (!tokenResult) {
        return undefined;
      }
      if (tokenResult.aborted) {
        this.promise = new Promise((resolve) => (this.resolve = resolve));
        return undefined;
      }
      return tokenResult.token;
    } else if (this.fetchState === "VALID") {
      const tokenResult = await this.waitForToken(options.timeoutMs);
      if (!tokenResult) {
        return undefined;
      }
      if (this.isTokenExpired()) {
        this.fetchState = "FETCHING";
        this.promise = new Promise((resolve) => (this.resolve = resolve));
        return undefined;
      }
      return tokenResult.token;
    } else {
      assertExhaustive(this.fetchState);
    }
  }

  private async waitForToken(timeoutMs?: number): Promise<TokenFetchResult | undefined> {
    if (timeoutMs === undefined) {
      return this.promise;
    }
    return Promise.race([
      this.promise,
      new Promise<undefined>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  isTokenExpired(): boolean {
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
      if (op.metadata?.sourceToken || op.done) {
        const [, , , /* projects*/ /* project*/ /* regions*/ region] =
          op.metadata?.target?.split("/") || [];
        logger.debug(`Got source token ${op.metadata?.sourceToken} for region ${region as string}`);
        this.resolve({
          token: op.metadata?.sourceToken,
          aborted: false,
        });
        this.fetchState = "VALID";
        this.expiry = Date.now() + this.tokenValidDurationMs;
      }
    };
  }
}
