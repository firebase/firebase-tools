import { FirebaseError } from "../../../error";
import { assertExhaustive } from "../../../functional";
import { logger } from "../../../logger";

type TokenFetchState = "NONE" | "FETCHING" | "VALID";

/**
 * GCF v1 deploys support reusing a build between function deploys.
 * This class will return a resolved promise for its first call to tokenPromise()
 * and then will always return a promise that is resolved by the poller function.
 */
export class SourceTokenScraper {
  private tokenValidDurationMs;
  private fetchTimeoutMs;
  private resolve!: (token?: string) => void;
  private promise: Promise<string | undefined>;
  private expiry: number | undefined;
  private fetchState: TokenFetchState;

  constructor(validDurationMs = 1500000, fetchTimeoutMs = 180_000) {
    this.tokenValidDurationMs = validDurationMs;
    this.fetchTimeoutMs = fetchTimeoutMs;
    this.promise = new Promise((resolve) => (this.resolve = resolve));
    this.fetchState = "NONE";
  }

  async getToken(): Promise<string | undefined> {
    if (this.fetchState === "NONE") {
      this.fetchState = "FETCHING";
      return undefined;
    } else if (this.fetchState === "FETCHING") {
      const timeout = new Promise<undefined>((resolve) => {
        setTimeout(() => {
          this.fetchState = "NONE";
          resolve(undefined);
        }, this.fetchTimeoutMs);
      });
      // wait until we get a source token, or the timeout occurs
      // and we reset the fetch state and return an undefined token.
      return Promise.race([this.promise, timeout]);
    } else if (this.fetchState === "VALID") {
      if (this.isTokenExpired()) {
        this.fetchState = "FETCHING";
        this.promise = new Promise((resolve) => (this.resolve = resolve));
        return undefined;
      }
      return this.promise;
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
          "and try deploying your functions again."
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
        this.resolve(op.metadata?.sourceToken);
        this.fetchState = "VALID";
        this.expiry = Date.now() + this.tokenValidDurationMs;
      }
    };
  }
}
