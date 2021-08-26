import { functionMatchesAnyGroup } from "./functionsDeployHelper";
import { checkForInvalidChangeOfTrigger } from "./validate";
import { isFirebaseManaged } from "../../deploymentTool";
import { logLabeledBullet } from "../../utils";
import * as backend from "./backend";
import * as gcfv2 from "../../gcp/cloudfunctionsv2";

export interface RegionalFunctionChanges {
  functionsToCreate: backend.FunctionSpec[];
  functionsToUpdate: {
    func: backend.FunctionSpec;
    deleteAndRecreate: boolean;
  }[];
  functionsToDelete: backend.FunctionSpec[];
}

export interface DeploymentPlan {
  regionalDeployments: Record<string, RegionalFunctionChanges>;
  schedulesToUpsert: backend.ScheduleSpec[];
  schedulesToDelete: backend.ScheduleSpec[];

  // NOTE(inlined):
  // Topics aren't created yet explicitly because the Functions API creates them
  // automatically. This may change in GCFv2 and would certainly change in Run,
  // so we should be ready to start creating topics before schedules or functions.
  // OTOH, we could just say that schedules targeting Pub/Sub are just a v1 thing
  // and save ourselves the topic management in GCFv2 or Run.
  topicsToDelete: backend.PubSubSpec[];
}

// export for testing
export function functionsByRegion(
  allFunctions: backend.FunctionSpec[]
): Record<string, backend.FunctionSpec[]> {
  const partitioned: Record<string, backend.FunctionSpec[]> = {};
  for (const fn of allFunctions) {
    partitioned[fn.region] = partitioned[fn.region] || [];
    partitioned[fn.region].push(fn);
  }
  return partitioned;
}

export function allRegions(
  spec: Record<string, backend.FunctionSpec[]>,
  existing: Record<string, backend.FunctionSpec[]>
): string[] {
  return Object.keys({ ...spec, ...existing });
}

const matchesId = (hasId: { id: string }) => (test: { id: string }) => {
  return hasId.id === test.id;
};

// export for testing
// Assumes we don't have cross-project functions and that, per function name, functions exist
// in the same region.
export function calculateRegionalFunctionChanges(
  want: backend.FunctionSpec[],
  have: backend.FunctionSpec[],
  options: {
    filters: string[][];
    overwriteEnvs?: boolean;
  }
): RegionalFunctionChanges {
  want = want.filter((fn) => functionMatchesAnyGroup(fn, options.filters));
  have = have.filter((fn) => functionMatchesAnyGroup(fn, options.filters));
  let upgradedToGCFv2WithoutSettingConcurrency = false;

  const functionsToCreate = want.filter((fn) => !have.some(matchesId(fn)));
  const functionsToUpdate = want
    .filter((fn) => {
      const haveFn = have.find(matchesId(fn));
      if (!haveFn) {
        return false;
      }

      checkForInvalidChangeOfTrigger(fn, haveFn);

      if (!options.overwriteEnvs) {
        // Remember old environment variables that might have been set with gcloud or the cloud console.
        fn.environmentVariables = {
          ...haveFn.environmentVariables,
          ...fn.environmentVariables,
        };
      }

      if (haveFn.platform === "gcfv1" && fn.platform === "gcfv2" && !fn.concurrency) {
        upgradedToGCFv2WithoutSettingConcurrency = true;
      }
      return true;
    })
    .map((fn) => {
      const haveFn = have.find(matchesId(fn));
      const deleteAndRecreate = needsDeleteAndRecreate(haveFn!, fn);
      return {
        func: fn,
        deleteAndRecreate,
      };
    });
  const functionsToDelete = have
    .filter((fn) => !want.some(matchesId(fn)))
    .filter((fn) => isFirebaseManaged(fn.labels || {}));

  if (upgradedToGCFv2WithoutSettingConcurrency) {
    logLabeledBullet(
      "functions",
      "You are updating one or more functions to Google Cloud Functions v2, " +
        "which introduces support for concurrent execution. New functions " +
        "default to 80 concurrent executions, but existing functions keep the " +
        "old default of 1. You can change this with the 'concurrency' option."
    );
  }
  return { functionsToCreate, functionsToUpdate, functionsToDelete };
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
  want: backend.Backend,
  have: backend.Backend,
  options: {
    filters: string[][];
    overwriteEnvs?: boolean;
  }
): DeploymentPlan {
  const deployment: DeploymentPlan = {
    regionalDeployments: {},
    schedulesToUpsert: [],
    schedulesToDelete: [],
    topicsToDelete: [],
  };

  const wantRegionalFunctions = functionsByRegion(want.cloudFunctions);
  const haveRegionalFunctions = functionsByRegion(have.cloudFunctions);
  for (const region of allRegions(wantRegionalFunctions, haveRegionalFunctions)) {
    const want = wantRegionalFunctions[region] || [];
    const have = haveRegionalFunctions[region] || [];
    deployment.regionalDeployments[region] = calculateRegionalFunctionChanges(want, have, options);
  }

  deployment.schedulesToUpsert = want.schedules.filter((schedule) =>
    functionMatchesAnyGroup(schedule.targetService, options.filters)
  );
  deployment.schedulesToDelete = have.schedules
    .filter((schedule) => !want.schedules.some(matchesId(schedule)))
    .filter((schedule) => functionMatchesAnyGroup(schedule.targetService, options.filters));
  deployment.topicsToDelete = have.topics
    .filter((topic) => !want.topics.some(matchesId(topic)))
    .filter((topic) => functionMatchesAnyGroup(topic.targetService, options.filters));

  return deployment;
}

function needsDeleteAndRecreate(exFn: backend.FunctionSpec, fn: backend.FunctionSpec): boolean {
  return changedV2PubSubTopic(exFn, fn);
  // TODO: is scheduled function upgrading from v1 to v2
}

function changedV2PubSubTopic(exFn: backend.FunctionSpec, fn: backend.FunctionSpec): boolean {
  if (exFn.platform !== "gcfv2") {
    return false;
  }
  if (fn.platform !== "gcfv2") {
    return false;
  }
  if (!backend.isEventTrigger(exFn.trigger)) {
    return false;
  }
  if (!backend.isEventTrigger(fn.trigger)) {
    return false;
  }
  if (exFn.trigger.eventType !== gcfv2.PUBSUB_PUBLISH_EVENT) {
    return false;
  }
  if (fn.trigger.eventType != gcfv2.PUBSUB_PUBLISH_EVENT) {
    return false;
  }
  return exFn.trigger.eventFilters["resource"] != fn.trigger.eventFilters["resource"];
}
