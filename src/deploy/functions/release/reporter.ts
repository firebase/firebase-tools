import * as backend from "../backend";
import * as clc from "colorette";

import * as args from "../args";
import { logger } from "../../../logger";
import { trackGA4 } from "../../../track";
import * as utils from "../../../utils";
import { getFunctionLabel } from "../functionsDeployHelper";

export interface DeployResult {
  endpoint: backend.Endpoint;
  durationMs: number;
  error?: Error;
}

export interface Summary {
  totalTime: number;
  results: DeployResult[];
}

export type OperationType =
  | "create"
  | "skip"
  | "update"
  | "delete"
  | "upsert schedule"
  | "delete schedule"
  | "upsert task queue"
  | "upsert eventarc channel"
  | "disable task queue"
  | "create topic"
  | "delete topic"
  | "set invoker"
  | "set concurrency"
  | "register blocking trigger"
  | "unregister blocking trigger";

/** An error with a deployment phase. */
export class DeploymentError extends Error {
  constructor(
    readonly endpoint: backend.Endpoint,
    readonly op: OperationType,
    readonly original: unknown,
  ) {
    super(`Failed to ${op} function ${endpoint.id} in region ${endpoint.region}`);
  }
}

/**
 * A specific error used to indicate that a function was not deleted because
 * other errors happened during deploy.
 */
export class AbortedDeploymentError extends DeploymentError {
  constructor(readonly endpoint: backend.Endpoint) {
    super(endpoint, "delete", new Error("aborted"));
  }
}

/** Add debugger logs and GA metrics for deploy stats. */
export async function logAndTrackDeployStats(
  summary: Summary,
  context?: args.Context,
): Promise<void> {
  let totalTime = 0;
  let totalErrors = 0;
  let totalSuccesses = 0;
  let totalAborts = 0;
  const reports: Array<Promise<void>> = [];

  const regions = new Set<string>();
  const codebases = new Set<string>();
  for (const result of summary.results) {
    const fnDeployEvent = {
      platform: result.endpoint.platform,
      trigger_type: backend.endpointTriggerType(result.endpoint),
      region: result.endpoint.region,
      runtime: result.endpoint.runtime,
      status: !result.error
        ? "success"
        : result.error instanceof AbortedDeploymentError
          ? "aborted"
          : "failure",
      duration: result.durationMs,
    };
    reports.push(trackGA4("function_deploy", fnDeployEvent));

    regions.add(result.endpoint.region);
    codebases.add(result.endpoint.codebase || "default");
    totalTime += result.durationMs;
    if (!result.error) {
      totalSuccesses++;
      if (context?.codebaseDeployEvents?.[result.endpoint.codebase || "default"] !== undefined) {
        context.codebaseDeployEvents[result.endpoint.codebase || "default"]
          .fn_deploy_num_successes++;
      }
    } else if (result.error instanceof AbortedDeploymentError) {
      totalAborts++;
      if (context?.codebaseDeployEvents?.[result.endpoint.codebase || "default"] !== undefined) {
        context.codebaseDeployEvents[result.endpoint.codebase || "default"]
          .fn_deploy_num_canceled++;
      }
    } else {
      totalErrors++;
      if (context?.codebaseDeployEvents?.[result.endpoint.codebase || "default"] !== undefined) {
        context.codebaseDeployEvents[result.endpoint.codebase || "default"]
          .fn_deploy_num_failures++;
      }
    }
  }

  for (const codebase of codebases) {
    if (context?.codebaseDeployEvents) {
      reports.push(trackGA4("codebase_deploy", { ...context.codebaseDeployEvents[codebase] }));
    }
  }
  const fnDeployGroupEvent = {
    codebase_deploy_count: codebases.size >= 5 ? "5+" : codebases.size.toString(),
    fn_deploy_num_successes: totalSuccesses,
    fn_deploy_num_canceled: totalAborts,
    fn_deploy_num_failures: totalErrors,
  };
  reports.push(trackGA4("function_deploy_group", fnDeployGroupEvent));

  const avgTime = totalTime / (totalSuccesses + totalErrors);
  logger.debug(`Total Function Deployment time: ${summary.totalTime}`);
  logger.debug(`${totalErrors + totalSuccesses + totalAborts} Functions Deployed`);
  logger.debug(`${totalErrors} Functions Errored`);
  logger.debug(`${totalAborts} Function Deployments Aborted`);
  logger.debug(`Average Function Deployment time: ${avgTime}`);

  await utils.allSettled(reports);
}

/** Print error messages for failures in summary. */
export function printErrors(summary: Summary): void {
  const errored = summary.results.filter((r) => r.error) as Array<Required<DeployResult>>;
  if (errored.length === 0) {
    return;
  }

  errored.sort((left, right) => backend.compareFunctions(left.endpoint, right.endpoint));
  logger.info("");
  logger.info(
    "Functions deploy had errors with the following functions:" +
      errored
        .filter((r) => !(r.error instanceof AbortedDeploymentError))
        .map((result) => `\n\t${getFunctionLabel(result.endpoint)}`)
        .join(""),
  );

  printIamErrors(errored);
  printQuotaErrors(errored);
  printAbortedErrors(errored);
}

/** Print errors for failures to set invoker. */
function printIamErrors(results: Array<Required<DeployResult>>): void {
  const iamFailures = results.filter(
    (r) => r.error instanceof DeploymentError && r.error.op === "set invoker",
  );
  if (!iamFailures.length) {
    return;
  }

  logger.info("");
  logger.info(
    "Unable to set the invoker for the IAM policy on the following functions:" +
      iamFailures.map((result) => `\n\t${getFunctionLabel(result.endpoint)}`).join(""),
  );

  logger.info("");
  logger.info("Some common causes of this:");
  logger.info("");
  logger.info(
    "- You may not have the roles/functions.admin IAM role. Note that " +
      "roles/functions.developer does not allow you to change IAM policies.",
  );
  logger.info("");
  logger.info("- An organization policy that restricts Network Access on your project.");

  // We implicitly set IAM permissions to public invoker when creating a function that
  // has no explicit invoker set. If these failures were on an inferred setInvoker command
  // we need to let the customer know that it needs to be explicit next time.
  const hadImplicitMakePublic = iamFailures.find(
    (r) => backend.isHttpsTriggered(r.endpoint) && !r.endpoint.httpsTrigger.invoker,
  );
  if (!hadImplicitMakePublic) {
    return;
  }
  logger.info("");
  logger.info(
    "One or more functions were being implicitly made publicly available on function create.",
  );
  logger.info(
    "Functions are not implicitly made public on updates. To try to make " +
      "these functions public on next deploy, configure these functions with " +
      `${clc.bold("invoker")} set to ${clc.bold(`"public"`)}`,
  );
}

/** Print errors for failures with the GCF API. */
function printQuotaErrors(results: Array<Required<DeployResult>>): void {
  const hadQuotaError = results.find((r) => {
    if (!(r.error instanceof DeploymentError)) {
      return false;
    }
    const original = r.error.original as any;
    const code: number | undefined =
      original?.status ||
      original?.code ||
      original?.context?.response?.statusCode ||
      original?.original?.code ||
      original?.original?.context?.response?.statusCode;
    return code === 429 || code === 409;
  });
  if (!hadQuotaError) {
    return;
  }
  logger.info("");
  logger.info(
    "Exceeded maximum retries while deploying functions. " +
      "If you are deploying a large number of functions, " +
      "please deploy your functions in batches by using the --only flag, " +
      "and wait a few minutes before deploying again. " +
      "Go to https://firebase.google.com/docs/cli/#partial_deploys to learn more.",
  );
}

/** Print errors for aborted deletes. */
export function printAbortedErrors(results: Array<Required<DeployResult>>): void {
  const aborted = results.filter((r) => r.error instanceof AbortedDeploymentError);
  if (!aborted.length) {
    return;
  }
  logger.info("");
  logger.info(
    "Because there were errors creating or updating functions, the following " +
      "functions were not deleted" +
      aborted.map((result) => `\n\t${getFunctionLabel(result.endpoint)}`).join(""),
  );
  logger.info(`To delete these, use ${clc.bold("firebase functions:delete")}`);
}

/** Get a short synopsis of trigger type for analytics */
export function triggerTag(endpoint: backend.Endpoint): string {
  const prefix = endpoint.platform === "gcfv1" ? "v1" : "v2";
  if (backend.isScheduleTriggered(endpoint)) {
    return `${prefix}.scheduled`;
  }

  if (backend.isTaskQueueTriggered(endpoint)) {
    return `${prefix}.taskQueue`;
  }

  if (backend.isCallableTriggered(endpoint)) {
    return `${prefix}.callable`;
  }

  if (backend.isHttpsTriggered(endpoint)) {
    // NOTE: Legacy trigger annotation relies on a special label to differentiate http vs callable triggers.
    if (endpoint.labels?.["deployment-callable"]) {
      return `${prefix}.callable`;
    }
    return `${prefix}.https`;
  }

  if (backend.isBlockingTriggered(endpoint)) {
    return `${prefix}.blocking`;
  }

  return endpoint.eventTrigger.eventType;
}
