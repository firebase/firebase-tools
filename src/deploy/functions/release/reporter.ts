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
