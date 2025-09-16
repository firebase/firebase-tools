"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourceTokenScraper = void 0;
const error_1 = require("../../../error");
const functional_1 = require("../../../functional");
const logger_1 = require("../../../logger");
/**
 * GCF v1 deploys support reusing a build between function deploys.
 * This class will return a resolved promise for its first call to tokenPromise()
 * and then will always return a promise that is resolved by the poller function.
 */
class SourceTokenScraper {
    constructor(validDurationMs = 1500000) {
        this.tokenValidDurationMs = validDurationMs;
        this.promise = new Promise((resolve) => (this.resolve = resolve));
        this.fetchState = "NONE";
    }
    abort() {
        this.resolve({ aborted: true });
    }
    async getToken() {
        if (this.fetchState === "NONE") {
            this.fetchState = "FETCHING";
            return undefined;
        }
        else if (this.fetchState === "FETCHING") {
            const tokenResult = await this.promise;
            if (tokenResult.aborted) {
                this.promise = new Promise((resolve) => (this.resolve = resolve));
                return undefined;
            }
            return tokenResult.token;
        }
        else if (this.fetchState === "VALID") {
            const tokenResult = await this.promise;
            if (this.isTokenExpired()) {
                this.fetchState = "FETCHING";
                this.promise = new Promise((resolve) => (this.resolve = resolve));
                return undefined;
            }
            return tokenResult.token;
        }
        else {
            (0, functional_1.assertExhaustive)(this.fetchState);
        }
    }
    isTokenExpired() {
        if (this.expiry === undefined) {
            throw new error_1.FirebaseError("Your deployment is checking the expiration of a source token that has not yet been polled. " +
                "Hitting this case should never happen and should be considered a bug. " +
                "Please file an issue at https://github.com/firebase/firebase-tools/issues " +
                "and try deploying your functions again.");
        }
        return Date.now() >= this.expiry;
    }
    get poller() {
        return (op) => {
            if (op.metadata?.sourceToken || op.done) {
                const [, , , /* projects*/ /* project*/ /* regions*/ region] = op.metadata?.target?.split("/") || [];
                logger_1.logger.debug(`Got source token ${op.metadata?.sourceToken} for region ${region}`);
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
exports.SourceTokenScraper = SourceTokenScraper;
//# sourceMappingURL=sourceTokenScraper.js.map