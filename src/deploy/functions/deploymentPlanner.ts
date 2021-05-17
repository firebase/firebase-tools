import * as deploymentTool from "../../deploymentTool";
import { functionMatchesAnyGroup, getTopicName } from "../../functionsDeployHelper";
import { checkForInvalidChangeOfTrigger } from "./validate";

// TODO: Better name for this?
// It's really a CloudFuntion, not just a trigger,
// but CloudFunction is a different exported type from firebase-functions
export interface CloudFunctionTrigger {
  name: string;
  sourceUploadUrl?: string;
  sourceToken?: string;
  labels: { [key: string]: string };
  environmentVariables: { [key: string]: string };
  entryPoint: string;
  runtime?: string;
  vpcConnector?: string;
  vpcConnectorEgressSettings?: string;
  ingressSettings?: string;
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

export interface RegionMap {
  [region: string]: CloudFunctionTrigger[];
}

export interface RegionalDeployment {
  region: string;
  sourceToken?: string;
  functionsToCreate: CloudFunctionTrigger[];
  functionsToUpdate: CloudFunctionTrigger[];
  schedulesToUpsert: CloudFunctionTrigger[];
}

export interface DeploymentPlan {
  regionalDeployments: RegionalDeployment[];
  functionsToDelete: string[];
  schedulesToDelete: string[];
}

/**
 * Creates a map of regions to all the CloudFunctions being deployed
 * to that region.
 * @param projectId The project in use.
 * @param localFunctions A list of all CloudFunctions in the deployment.
 */
export function functionsByRegion(
  projectId: string,
  localFunctions: CloudFunctionTrigger[]
): RegionMap {
  const regionMap: RegionMap = {};
  for (const trigger of localFunctions) {
    if (!trigger.regions) {
      trigger.regions = ["us-central1"];
    }
    // Create a separate CloudFunction for
    // each region we deploy a function to
    for (const region of trigger.regions) {
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
      regionMap[region] = regionMap[region] || [];
      regionMap[region].push(triggerDeepCopy);
    }
  }
  return regionMap;
}

/**
 * Helper method to turn a RegionMap into a flat list of all functions in a deployment.
 * @param regionMap A RegionMap for the deployment.
 */
export function allFunctions(regionMap: RegionMap): CloudFunctionTrigger[] {
  const triggers: CloudFunctionTrigger[] = [];
  for (const [k, v] of Object.entries(regionMap)) {
    triggers.push(...v);
  }
  return triggers;
}

/**
 * Create a plan for deploying all functions in one region.
 * @param region The region of this deployment
 * @param loclFunctionsByRegion The functions present in the code currently being deployed.
 * @param existingFunctionNames The names of all functions that already exist.
 * @param existingScheduledFunctionNames The names of all schedules functions that already exist.
 * @param filters The filters, passed in by the user via  `--only functions:`
 */
export function createDeploymentPlan(
  localFunctionsByRegion: RegionMap,
  existingFunctions: CloudFunctionTrigger[],
  filters: string[][]
): DeploymentPlan {
  let existingFnsCopy: CloudFunctionTrigger[] = [...existingFunctions];
  const deployment: DeploymentPlan = {
    regionalDeployments: [],
    functionsToDelete: [],
    schedulesToDelete: [],
  };
  // eslint-disable-next-line guard-for-in
  for (const region in localFunctionsByRegion) {
    const regionalDeployment: RegionalDeployment = {
      region,
      functionsToCreate: [],
      functionsToUpdate: [],
      schedulesToUpsert: [],
    };
    const localFunctionsInRegion = localFunctionsByRegion[region];
    for (const fn of localFunctionsInRegion) {
      // Check if this function matches the --only filters
      if (!functionMatchesAnyGroup(fn.name, filters)) {
        continue;
      }
      // Check if this local function has the same name as an exisiting one.
      const matchingExistingFunction = existingFnsCopy.find((exFn) => exFn.name === fn.name);
      // Check if the matching exisitng function is scheduled
      const isMatchingExisitingFnScheduled =
        matchingExistingFunction?.labels?.["deployment-scheduled"] === "true";
      // Check if the local function is a scheduled function
      if (fn.schedule) {
        // If the local function is scheduled, set its trigger to the correct pubsub topic
        fn.eventTrigger.resource = getTopicName(fn.name);
        // and create or update a schedule.
        regionalDeployment.schedulesToUpsert.push(fn);
      } else if (isMatchingExisitingFnScheduled) {
        // If the local function isn't scheduled but the existing one is, delete the schedule.
        deployment.schedulesToDelete.push(matchingExistingFunction!.name);
      }

      if (matchingExistingFunction) {
        // Check if this is an invalid change of trigger type.
        checkForInvalidChangeOfTrigger(fn, matchingExistingFunction);
        // Preserve existing environment variables.
        fn.environmentVariables = {
          ...matchingExistingFunction.environmentVariables,
          ...fn.environmentVariables,
        };
        regionalDeployment.functionsToUpdate.push(fn);
        existingFnsCopy = existingFnsCopy.filter((exFn: CloudFunctionTrigger) => {
          return exFn.name !== fn.name;
        });
      } else {
        regionalDeployment.functionsToCreate.push(fn);
      }
    }
    deployment.regionalDeployments.push(regionalDeployment);
  }

  // Delete any remaining existing functions that:
  // 1 - Have the deployment-tool: 'firebase-cli' label and
  // 2 - Match the --only filters, if any are provided.
  const functionsToDelete = existingFnsCopy
    .filter((fn) => {
      return deploymentTool.isFirebaseManaged(fn.labels);
    })
    .filter((fn) => {
      return functionMatchesAnyGroup(fn.name, filters);
    });
  deployment.functionsToDelete = functionsToDelete.map((fn) => {
    return fn.name;
  });
  // Also delete any schedules for functions that we are deleting.
  for (const fn of functionsToDelete) {
    if (fn.labels?.["deployment-scheduled"] === "true") {
      deployment.schedulesToDelete.push(fn.name);
    }
  }
  return deployment;
}
