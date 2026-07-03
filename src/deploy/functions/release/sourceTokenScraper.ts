import { FirebaseError } from "../../../error";
import { assertExhaustive } from "../../../functional";
import { logger } from "../../../logger";
import { timeoutFallback } from "../../../timeout";

// How long a concurrent getToken() call will wait for the first deploy's poller
// to produce a token before giving up and proceeding without one.
const SOURCE_TOKEN_FETCH_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

type TokenFetchState = "NONE" | "FETCHING" | "VALID";
interface TokenFetchResult {
  token?: string;
  aborted: boolean;
  timedOut?: boolean;
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

  async getToken(): Promise<string | undefined> {
    if (this.fetchState === "NONE") {
      this.fetchState = "FETCHING";
      return undefined;
    } else if (this.fetchState === "FETCHING") {
      // Race the token promise against a deadline so a lost token producer
      // (e.g. a failed deploy that didn't call abort()) degrades to a
      // token-less deploy rather than hanging the process forever.
      const tokenResult: TokenFetchResult = await timeoutFallback(
        this.promise,
        { aborted: true, timedOut: true },
        SOURCE_TOKEN_FETCH_TIMEOUT_MS,
      );
      if (tokenResult.aborted) {
        if (tokenResult.timedOut) {
          logger.warn(
            "Timed out waiting for a source token. Proceeding without one, which may slow the deploy.",
          );
        }
        this.promise = new Promise((resolve) => (this.resolve = resolve));
        return undefined;
      }
      return tokenResult.token;
    } else if (this.fetchState === "VALID") {
      const tokenResult = await this.promise;
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
