import * as _ from "lodash";
import * as clc from "cli-color";

import { FirebaseError } from "./error";
import { logger } from "./logger";
import * as track from "./track";
import * as utils from "./utils";
import * as cloudfunctions from "./gcp/cloudfunctions";
import { Job } from "./gcp/cloudscheduler";
import { CloudFunctionTrigger } from "./deploy/functions/deploymentPlanner";
import Queue from "./throttler/queue";
import { ErrorHandler } from "./deploy/functions/errorHandler";
import * as args from "./deploy/functions/args";

export function functionMatchesAnyGroup(fnName: string, filterGroups: string[][]) {
  if (!filterGroups.length) {
    return true;
  }
  for (const groupChunks of filterGroups) {
    if (functionMatchesGroup(fnName, groupChunks)) {
      return true;
    }
  }
  return false;
}

export function functionMatchesGroup(functionName: string, groupChunks: string[]): boolean {
  const last = _.last(functionName.split("/"));
  if (!last) {
    return false;
  }
  const functionNameChunks = last.split("-").slice(0, groupChunks.length);
  return _.isEqual(groupChunks, functionNameChunks);
}

export function getFilterGroups(options: args.Options): string[][] {
  if (!options.only) {
    return [];
  }

  let opts;
  return options.only
    .split(",")
    .filter((filter) => {
      opts = filter.split(":");
      return opts[0] === "functions" && opts[1];
    })
    .map((filter) => {
      return filter.split(":")[1].split(/[.-]/);
    });
}

export function getReleaseNames(
  uploadNames: string[],
  existingNames: string[],
  functionFilterGroups: string[][]
): string[] {
  if (functionFilterGroups.length === 0) {
    return uploadNames;
  }

  const allFunctions = _.union(uploadNames, existingNames);
  return _.filter(allFunctions, (functionName) => {
    return _.some(
      _.map(functionFilterGroups, (groupChunks) => {
        return functionMatchesGroup(functionName, groupChunks);
      })
    );
  });
}

export function logFilters(
  existingNames: string[],
  releaseNames: string[],
  functionFilterGroups: string[][]
): void {
  if (functionFilterGroups.length === 0) {
    return;
  }

  logger.debug("> [functions] filtering triggers to: " + JSON.stringify(releaseNames, null, 2));
  track("Functions Deploy with Filter", "", releaseNames.length);

  let list;
  if (existingNames.length > 0) {
    list = _.map(existingNames, (name) => {
      return getFunctionId(name) + "(" + getRegion(name) + ")";
    }).join(", ");
    utils.logBullet(clc.bold.cyan("functions: ") + "current functions in project: " + list);
  }
  if (releaseNames.length > 0) {
    list = _.map(releaseNames, (name) => {
      return getFunctionId(name) + "(" + getRegion(name) + ")";
    }).join(", ");
    utils.logBullet(clc.bold.cyan("functions: ") + "uploading functions in project: " + list);
  }

  const allFunctions = _.union(releaseNames, existingNames);
  const unmatchedFilters = _.chain(functionFilterGroups)
    .filter((filterGroup) => {
      return !_.some(
        _.map(allFunctions, (functionName) => {
          return functionMatchesGroup(functionName, filterGroup);
        })
      );
    })
    .map((group) => {
      return group.join("-");
    })
    .value();
  if (unmatchedFilters.length > 0) {
    utils.logWarning(
      clc.bold.yellow("functions: ") +
        "the following filters were specified but do not match any functions in the project: " +
        unmatchedFilters.join(", ")
    );
  }
}

export function getFunctionTrigger(functionInfo: CloudFunctionTrigger) {
  if (functionInfo.httpsTrigger) {
    return { httpsTrigger: functionInfo.httpsTrigger };
  } else if (functionInfo.eventTrigger) {
    const trigger = functionInfo.eventTrigger;
    trigger.failurePolicy = functionInfo.failurePolicy;
    return { eventTrigger: trigger };
  }

  logger.debug("Unknown trigger type found in:", functionInfo);
  throw new FirebaseError("Could not parse function trigger, unknown trigger type.");
}

export function getFunctionId(fullName: string): string {
  return fullName.split("/")[5];
}

/*
 ** getScheduleName transforms a full function name (projects/blah/locations/blah/functions/blah)
 ** into a job name for cloud scheduler
 ** DANGER: We use the pattern defined here to deploy and delete schedules,
 ** and to display scheduled functions in the Firebase console
 ** If you change this pattern, Firebase console will stop displaying schedule descriptions
 ** and schedules created under the old pattern will no longer be cleaned up correctly
 */
export function getScheduleName(fullName: string, appEngineLocation: string): string {
  const [projectsPrefix, project, regionsPrefix, region, , functionName] = fullName.split("/");
  return `${projectsPrefix}/${project}/${regionsPrefix}/${appEngineLocation}/jobs/firebase-schedule-${functionName}-${region}`;
}

/*
 ** getTopicName transforms a full function name (projects/blah/locations/blah/functions/blah)
 ** into a topic name for pubsub
 ** DANGER: We use the pattern defined here to deploy and delete topics
 ** If you change this pattern, topics created under the old pattern will no longer be cleaned up correctly
 */
export function getTopicName(fullName: string): string {
  const [projectsPrefix, project, , region, , functionName] = fullName.split("/");
  return `${projectsPrefix}/${project}/topics/firebase-schedule-${functionName}-${region}`;
}

export function getRegion(fullName: string): string {
  return fullName.split("/")[3];
}

export function getFunctionLabel(fullName: string): string {
  return getFunctionId(fullName) + "(" + getRegion(fullName) + ")";
}

export function toJob(fn: CloudFunctionTrigger, appEngineLocation: string, projectId: string): Job {
  return Object.assign(fn.schedule as { schedule: string }, {
    name: getScheduleName(fn.name, appEngineLocation),
    pubsubTarget: {
      topicName: getTopicName(fn.name),
      attributes: {
        scheduled: "true",
      },
    },
  });
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
}

export function printSuccess(funcName: string, type: string) {
  utils.logSuccess(
    clc.bold.green("functions[" + getFunctionLabel(funcName) + "]: ") +
      "Successful " +
      type +
      " operation. "
  );
}

export async function printTriggerUrls(projectId: string, sourceUrl: string) {
  const res = await cloudfunctions.listAllFunctions(projectId);
  const httpsFunctions = res.functions.filter((fn) => {
    return fn.sourceUploadUrl === sourceUrl && fn.httpsTrigger;
  });
  if (httpsFunctions.length === 0) {
    return;
  }

  httpsFunctions.forEach((httpsFunc) => {
    logger.info(
      clc.bold("Function URL"),
      `(${getFunctionId(httpsFunc.name)}):`,
      httpsFunc.httpsTrigger?.url
    );
  });
  return;
}
