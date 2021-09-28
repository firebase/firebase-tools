import * as backend from "../backend";

import { FirebaseError } from "../../../error";

export interface DeployResult {
  durationMs: number;
  error?: Error;
}

export type DeployResults = Record<string, Record<string, DeployResult>>;

export type OperationType =
  | "create"
  | "update"
  | "delete"
  | "upsert schedule"
  | "delete schedule"
  | "create topic"
  | "delete topic"
  | "set invoker"
  | "set concurrency";

export class DeploymentError extends Error {
  constructor(
    readonly endpoint: backend.Endpoint,
    readonly op: OperationType,
    readonly original: unknown
  ) {
    super(`Failed to ${op} function ${endpoint.id} in region ${endpoint.region}`);
  }
}

export class AbortedDeploymentError extends DeploymentError {
  constructor(readonly endpoint: backend.Endpoint) {
    super(endpoint, "delete", new Error("aborted"));
  }
}

export function reportResults(results: DeployResults, opts: any): void {
  throw new FirebaseError(
    "Exceeded maximum retries while deploying functions. " +
      "If you are deploying a large number of functions, " +
      "please deploy your functions in batches by using the --only flag, " +
      "and wait a few minutes before deploying again. " +
      "Go to https://firebase.google.com/docs/cli/#partial_deploys to learn more.",
    opts
  );
}
