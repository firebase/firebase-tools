import * as clc from "cli-color";

import Queue from "../../throttler/queue";
import { ErrorHandler } from "./errorHandler";
import { logger } from "../../logger";
import * as args from "./args";
import * as backend from "./backend";
import * as track from "../../track";
import * as utils from "../../utils";

// Note: it seems like almost all of these matcher methods use IDs under the covers.
// Consider updating methods and call sites to work on ID.

export function functionMatchesAnyGroup(func: backend.TargetIds, filterGroups: string[][]) {
  if (!filterGroups.length) {
    return true;
  }
  return filterGroups.some((groupChunk) => functionMatchesGroup(func, groupChunk));
}

export function functionMatchesGroup(func: backend.TargetIds, groupChunks: string[]): boolean {
  const functionNameChunks = func.id.split("-").slice(0, groupChunks.length);
  // Should never happen. It would mean the user has asked to deploy something that is
  // a sub-function. E.g. function foo-bar and group chunks [foo, bar, baz].
  if (functionNameChunks.length != groupChunks.length) {
    return false;
  }
  for (let i = 0; i < groupChunks.length; i += 1) {
    if (groupChunks[i] !== functionNameChunks[i]) {
      return false;
    }
  }
  return true;
}

export function getFilterGroups(options: { only?: string }): string[][] {
  if (!options.only) {
    return [];
  }

  const only = options.only!.split(",");
  const onlyFunctions = only.filter((filter) => {
    const opts = filter.split(":");
    return opts[0] == "functions" && opts[1];
  });
  return onlyFunctions.map((filter) => {
    return filter.split(":")[1].split(/[.-]/);
  });
}

// TODO(inlined): this should eventually go away as we migrate to backend.FunctionSpec
export function getFunctionId(fullName: string): string {
  return fullName.split("/")[5];
}

// TOOD(inlined): this should eventually go away as we migrate to backend.FunctionSpec
function getRegion(fullName: string): string {
  return fullName.split("/")[3];
}

export function getFunctionLabel(fn: backend.TargetIds): string;

// TODO(inlined) get rid of this version
export function getFunctionLabel(fullName: string): string;

export function getFunctionLabel(fnOrName: string | backend.TargetIds): string {
  if (typeof fnOrName === "string") {
    return getFunctionId(fnOrName) + "(" + getRegion(fnOrName) + ")";
  } else {
    return `${fnOrName.id}(${fnOrName.region})`;
  }
}

export function logAndTrackDeployStats(queue: Queue<any, any>, errorHandler: ErrorHandler) {
  const stats = queue.stats();
  logger.debug(`Total Function Deployment time: ${stats.elapsed}`);
  logger.debug(`${stats.total} Functions Deployed`);
  logger.debug(`${errorHandler.errors.length} Functions Errored`);
  logger.debug(`Average Function Deployment time: ${stats.avg}`);
  if (stats.total > 0) {
    if (errorHandler.errors.length === 0) {
      track("functions_deploy_result", "success", stats.total);
    } else if (errorHandler.errors.length < stats.total) {
      track("functions_deploy_result", "partial_success", stats.total - errorHandler.errors.length);
      track("functions_deploy_result", "partial_failure", errorHandler.errors.length);
      track(
        "functions_deploy_result",
        "partial_error_ratio",
        errorHandler.errors.length / stats.total
      );
    } else {
      track("functions_deploy_result", "failure", stats.total);
    }
  }
  // TODO: Track other stats here - maybe time of full deployment?
  // TODO(inlined): Track functions deploy by API version
}

export function printSuccess(func: backend.TargetIds, type: string) {
  utils.logSuccess(
    clc.bold.green("functions[" + getFunctionLabel(func) + "]: ") +
      "Successful " +
      type +
      " operation. "
  );
}

export async function printTriggerUrls(context: args.Context) {
  // TODO: We can cut an RPC out of our workflow if we record the
  // results of our deploy tasks. This will also be important for scheduled functions
  // that are deployed directly to HTTP endpoints.
  const have = await backend.existingBackend(context, /* forceRefresh= */ true);
  const httpsFunctions = have.cloudFunctions.filter((fn) => {
    return !backend.isEventTrigger(fn.trigger) && functionMatchesAnyGroup(fn, context.filters);
  });
  if (httpsFunctions.length === 0) {
    logger.info("No HTTPS functions");
    return;
  }

  for (const httpsFunc of httpsFunctions) {
    if (!httpsFunc.uri) {
      logger.debug("Missing URI for HTTPS function in printTriggerUrls. This shouldn't happen");
      continue;
    }
    logger.info(clc.bold("Function URL"), `(${getFunctionLabel(httpsFunc)}): ${httpsFunc.uri}`);
  }
}
