import { functionMatchesAnyGroup } from "./functionsDeployHelper";
import { checkForInvalidChangeOfTrigger } from "./validate";
import { isFirebaseManaged } from "../../deploymentTool";
import * as backend from "./backend";

export interface RegionalFunctionChanges {
  sourceToken?: string;
  functionsToCreate: backend.FunctionSpec[];
  functionsToUpdate: backend.FunctionSpec[];
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
  filters: string[][]
): RegionalFunctionChanges {
  want = want.filter((fn) => functionMatchesAnyGroup(fn, filters));
  have = have.filter((fn) => functionMatchesAnyGroup(fn, filters));

  const functionsToCreate = want.filter((fn) => !have.some(matchesId(fn)));
  const functionsToUpdate = want.filter((fn) => {
    const haveFn = have.find(matchesId(fn));
    if (haveFn) {
      checkForInvalidChangeOfTrigger(fn, haveFn);

      // Remember old environment variables that might have been set with
      // gcloud or the cloud console.
      fn.environmentVariables = {
        ...haveFn.environmentVariables,
        ...fn.environmentVariables,
      };
    }
    return haveFn;
  });
  const functionsToDelete = have
    .filter((fn) => !want.some(matchesId(fn)))
    .filter((fn) => isFirebaseManaged(fn.labels || {}));

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
  filters: string[][]
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
    deployment.regionalDeployments[region] = calculateRegionalFunctionChanges(want, have, filters);
  }

  deployment.schedulesToUpsert = want.schedules.filter((schedule) =>
    functionMatchesAnyGroup(schedule.targetService, filters)
  );
  deployment.schedulesToDelete = have.schedules
    .filter((schedule) => !want.schedules.some(matchesId(schedule)))
    .filter((schedule) => functionMatchesAnyGroup(schedule.targetService, filters));
  deployment.topicsToDelete = have.topics
    .filter((topic) => !want.topics.some(matchesId(topic)))
    .filter((topic) => functionMatchesAnyGroup(topic.targetService, filters));

  return deployment;
}
