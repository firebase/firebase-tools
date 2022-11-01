import { logger } from "../../../logger";

enum TokenState {
  "NONE",
  "VALID",
  "INVALID",
}

/**
 * GCF v1 deploys support reusing a build between function deploys.
 * This class will return a resolved promise for its first call to tokenPromise()
 * and then will always return a promise that is resolved by the poller function.
 */
export class SourceTokenScraper {
  private tokenValidDurationMs; // in ms
  private resolve!: (token?: string) => void;
  private promise: Promise<string | undefined>;
  private expiration: bigint | undefined;
  private tokenState: TokenState;

  constructor(validDurationMs = 1500000) {
    this.tokenValidDurationMs = validDurationMs;
    this.promise = new Promise((resolve) => (this.resolve = resolve));
    this.tokenState = TokenState.NONE;
  }

  async getToken(): Promise<string | undefined> {
    if (this.tokenState === TokenState.NONE) {
      this.tokenState = TokenState.INVALID;
      return undefined;
    } else if (this.tokenState === TokenState.INVALID) {
      return this.promise; // wait until we get a source token
    } else if (this.tokenState === TokenState.VALID) {
      if (this.checkTokenExpired()) {
        this.tokenState = TokenState.INVALID;
        this.promise = new Promise((resolve) => (this.resolve = resolve));
        return undefined;
      }
      return this.promise;
    }
  }

  checkTokenExpired(): boolean {
    if (this.expiration === undefined) {
      throw new Error();
    }
    return process.hrtime.bigint() >= this.expiration;
  }

  calculateTokenExpiry(): bigint {
    const now = process.hrtime.bigint();
    return now + BigInt(this.tokenValidDurationMs) * BigInt(1e6);
  }

  get poller() {
    return (op: any) => {
      if (op.metadata?.sourceToken || op.done) {
        const [, , , /* projects*/ /* project*/ /* regions*/ region] =
          op.metadata?.target?.split("/") || [];
        logger.debug(`Got source token ${op.metadata?.sourceToken} for region ${region as string}`);
        this.resolve(op.metadata?.sourceToken);
        this.tokenState = TokenState.VALID;
        this.expiration = this.calculateTokenExpiry(); // calculate expiration
      }
    };
  }
}
