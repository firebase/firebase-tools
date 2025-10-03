import * as clc from "colorette";
import * as utils from "../utils";
import { withHttpBackoff } from "./retryWithBackoff";

/**
 * Convenience wrapper for Cloud Functions deploy operations.
 * Retries **only** on HTTP 429 and logs a clear message.
 */
export function with429Backoff<T>(
  op: "create" | "update" | "delete" | "generateUploadUrl",
  resourceName: string,
  thunk: () => Promise<T>,
) {
  return withHttpBackoff(thunk, {
    statuses: [429],
    onRetry: ({ attempt, maxAttempts }) => {
      utils.logLabeledWarning(
        "functions",
        `${clc.bold(clc.yellow("429 (Quota Exceeded)"))} on ${op} ${resourceName}; retrying (attempt ${attempt}${maxAttempts ? `/${maxAttempts}` : ""})…`,
      );
    },
  });
}
