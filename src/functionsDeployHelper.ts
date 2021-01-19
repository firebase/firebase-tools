import * as _ from "lodash";
import * as clc from "cli-color";

import { FirebaseError } from "./error";
import * as logger from "./logger";
import * as track from "./track";
import * as utils from "./utils";
import * as cloudfunctions from "./gcp/cloudfunctions";
import * as pollOperations from "./pollOperations";

// TODO: Get rid of this when switching to use poller.
export interface Operation {
  name: string;
  type: string;
  funcName: string;
  eventType: string;
  done: boolean;
  triggerUrl?: string;
  error?: { code: number; message: string };
}

export interface CloudFunction {
  name: string;
  sourceUploadUrl?: string;
  labels: { [key: string]: string };
  environmentVariables: { [key: string]: string };
  entryPoint?: string;
  runtime?: string;
  vpcConnector?: string;
  vpcConnectorEgressSettings?: string;
  availableMemoryMb?: number;
  timeout?: number;
  maxInstances?: number;
  serviceAccountEmail?: string;
  httpsTrigger?: any;
  eventTrigger?: any;
  failurePolicy?: {};
  schedule?: object;
  timeZone?: string;
  regions?: string[];
}
export function functionMatchesGroup(functionName: string, groupChunks: string[]): boolean {
  const last = _.last(functionName.split("/"));
  if (!last) {
    return false;
  }
  const functionNameChunks = last.split("-").slice(0, groupChunks.length);
  return _.isEqual(groupChunks, functionNameChunks);
}

export function getFilterGroups(options: any): string[][] {
  if (!options.only) {
    return [];
  }

  let opts;
  return _.chain(options.only.split(","))
    .filter((filter) => {
      opts = filter.split(":");
      return opts[0] === "functions" && opts[1];
    })
    .map((filter) => {
      return filter.split(":")[1].split(/[.-]/);
    })
    .value();
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
      return getFunctionName(name) + "(" + getRegion(name) + ")";
    }).join(", ");
    utils.logBullet(clc.bold.cyan("functions: ") + "current functions in project: " + list);
  }
  if (releaseNames.length > 0) {
    list = _.map(releaseNames, (name) => {
      return getFunctionName(name) + "(" + getRegion(name) + ")";
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

export function getFunctionsInfo(parsedTriggers: CloudFunction[], projectId: string) {
  const functionsInfo: CloudFunction[] = [];
  _.forEach(parsedTriggers, (trigger) => {
    if (!trigger.regions) {
      trigger.regions = ["us-central1"];
    }
    // SDK exports list of regions for each function to be deployed to, need to add a new entry
    // to functionsInfo for each region.
    _.forEach(trigger.regions, (region) => {
      const triggerDeepCopy = JSON.parse(JSON.stringify(trigger));
      if (triggerDeepCopy.regions) {
        delete triggerDeepCopy.regions;
      }
      triggerDeepCopy.name = [
        "projects",
        projectId,
        "locations",
        region,
        "functions",
        trigger.name,
      ].join("/");
      functionsInfo.push(triggerDeepCopy);
    });
  });
  return functionsInfo;
}

export function getFunctionTrigger(functionInfo: CloudFunction) {
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

export function getFunctionName(fullName: string): string {
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
  return getFunctionName(fullName) + "(" + getRegion(fullName) + ")";
}

export function pollDeploys(
  operations: Operation[],
  printSuccess: (op: Operation) => void,
  printFail: (op: Operation) => void,
  printTooManyOps: (projectId: string) => void,
  projectId: string
) {
  let interval;
  // Poll less frequently when there are many operations to avoid hitting read quota.
  // See "Read requests" quota at https://cloud.google.com/console/apis/api/cloudfunctions/quotas
  if (_.size(operations) > 90) {
    printTooManyOps(projectId);
    return Promise.resolve([]);
  } else if (_.size(operations) > 40) {
    interval = 10 * 1000;
  } else if (_.size(operations) > 15) {
    interval = 5 * 1000;
  } else {
    interval = 2 * 1000;
  }
  const pollFunction = cloudfunctions.checkOperation;

  const retryCondition = function(result: Operation) {
    // The error codes from a Google.LongRunning operation follow google.rpc.Code format.

    const retryableCodes = [
      1, // cancelled by client
      4, // deadline exceeded
      10, // aborted (typically due to concurrency issue)
      14, // unavailable
    ];

    if (_.includes(retryableCodes, result.error?.code)) {
      return true;
    }
    return false;
  };

  try {
    return pollOperations.pollAndRetry(
      operations,
      pollFunction,
      interval,
      printSuccess,
      printFail,
      retryCondition
    );
  } catch (err) {
    utils.logWarning(
      clc.bold.yellow("functions:") + " failed to get status of all the deployments"
    );
    logger.info(
      "You can check on their status at " + utils.consoleUrl(projectId, "/functions/logs")
    );
    throw new FirebaseError("Failed to get status of functions deployments.");
  }
}
