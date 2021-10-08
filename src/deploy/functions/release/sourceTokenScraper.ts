import { logger } from "../../../logger";

/**
 * GCF v1 deploys support reusing a build between function deploys.
 * This class will return a resolved promise for its first call to tokenPromise()
 * and then will always return a promise that is resolved by the poller function.
 */
export class SourceTokenScraper {
  private firstCall = true;
  private resolve!: (token: string) => void;
  private promise: Promise<string | undefined>;

  constructor() {
    this.promise = new Promise((resolve) => (this.resolve = resolve));
  }

  // Token Promise will return undefined for the first caller
  // (because we presume it's this function's source token we'll scrape)
  // and then returns the promise generated from the first function's onCall
  tokenPromise(): Promise<string | undefined> {
    if (this.firstCall) {
      this.firstCall = false;
      return Promise.resolve(undefined);
    }
    return this.promise;
  }

  get poller() {
    return (op: any) => {
      if (op.metadata?.sourceToken || op.done) {
        const [, , , /* projects*/ /* project*/ /* regions*/ region] =
          op.metadata?.target?.split("/") || [];
        logger.debug(`Got source token ${op.metadata?.sourceToken} for region ${region as string}`);
        this.resolve(op.metadata?.sourceToken);
      }
    };
  }
}
