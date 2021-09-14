import { functionMatchesAnyGroup } from "./functionsDeployHelper";
import { checkForIllegalUpdate } from "./validate";
import { isFirebaseManaged } from "../../deploymentTool";
import * as utils from "../../utils";
import * as backend from "./backend";
import * as gcfv2 from "../../gcp/cloudfunctionsv2";

export interface EndpointUpdate {
  endpoint: backend.Endpoint;
  deleteAndRecreate: boolean;
}

export interface RegionalChanges {
  endpointsToCreate: backend.Endpoint[];
  endpointsToUpdate: EndpointUpdate[];
  endpointsToDelete: backend.Endpoint[];
}

export type DeploymentPlan = Record<string, RegionalChanges>;

interface Options {
  filters: string[][];
  overwriteEnvs?: boolean;
}

/** Calculate the changes needed for a given region. */
export function calculateRegionalChanges(
  want: Record<string, backend.Endpoint>,
  have: Record<string, backend.Endpoint>,
  options: Options
): RegionalChanges {
  const endpointsToCreate = Object.keys(want)
    .filter((id) => !have[id])
    .map((id) => want[id]);

  const endpointsToDelete = Object.keys(have)
    .filter((id) => !want[id])
    .filter((id) => isFirebaseManaged(have[id].labels || {}))
    .map((id) => have[id]);

  const endpointsToUpdate = Object.keys(want)
    .filter((id) => have[id])
    .map((id) => calculateUpdate(want[id], have[id], options));
  return { endpointsToCreate, endpointsToUpdate, endpointsToDelete };
}

/**
 * Calculates the update object for a given endpoint.
 * Throws if the update is illegal.
 * Forces a delete & recreate if the underlying API doesn't allow an upgrade but
 * CF3 does.
 */
export function calculateUpdate(
  want: backend.Endpoint,
  have: backend.Endpoint,
  opts: Options
): EndpointUpdate {
  checkForIllegalUpdate(want, have);

  const endpoint: backend.Endpoint = { ...want };
  if (!opts.overwriteEnvs) {
    // Remember old environment variables that might have been set with gcloud or the cloud console.
    endpoint.environmentVariables = {
      ...have.environmentVariables,
      ...want.environmentVariables,
    };
  }

  const deleteAndRecreate =
    changedV2PubSubTopic(have, want) || upgradedScheduleFromV1ToV2(have, want);
  return { endpoint, deleteAndRecreate };
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
  const deployment: DeploymentPlan = {};
  want = backend.matchingBackend(want, (endpoint) => {
    return functionMatchesAnyGroup(endpoint, options.filters);
  });
  have = backend.matchingBackend(have, (endpoint) => {
    return functionMatchesAnyGroup(endpoint, options.filters);
  });

  const regions = new Set([...Object.keys(want.endpoints), ...Object.keys(have.endpoints)]);
  for (const region of regions) {
    deployment[region] = calculateRegionalChanges(
      want.endpoints[region] || {},
      have.endpoints[region] || {},
      options
    );
  }

  if (upgradedToGCFv2WithoutSettingConcurrency(want, have)) {
    utils.logLabeledBullet(
      "functions",
      "You are updating one or more functions to Google Cloud Functions v2, " +
        "which introduces support for concurrent execution. New functions " +
        "default to 80 concurrent executions, but existing functions keep the " +
        "old default of 1. You can change this with the 'concurrency' option."
    );
  }
  return deployment;
}

/** Whether a user upgraded any endpionts to GCFv2 without setting concurrency. */
export function upgradedToGCFv2WithoutSettingConcurrency(
  want: backend.Backend,
  have: backend.Backend
): boolean {
  return backend.someEndpoint(want, (endpoint) => {
    // If there is not an existing v1 funciton
    if (have.endpoints[endpoint.region]?.[endpoint.id]?.platform !== "gcfv1") {
      return false;
    }

    if (endpoint.platform !== "gcfv2") {
      return false;
    }

    if (endpoint.concurrency) {
      return false;
    }

    return true;
  });
}

/** Whether a user changed the Pub/Sub topic of a GCFv2 function (which isn't allowed in the API). */
export function changedV2PubSubTopic(have: backend.Endpoint, want: backend.Endpoint): boolean {
  if (have.platform !== "gcfv2") {
    return false;
  }
  if (want.platform !== "gcfv2") {
    return false;
  }
  if (!backend.isEventTriggered(have)) {
    return false;
  }
  if (!backend.isEventTriggered(want)) {
    return false;
  }
  if (have.eventTrigger.eventType !== gcfv2.PUBSUB_PUBLISH_EVENT) {
    return false;
  }
  if (want.eventTrigger.eventType != gcfv2.PUBSUB_PUBLISH_EVENT) {
    return false;
  }
  return have.eventTrigger.eventFilters["resource"] != want.eventTrigger.eventFilters["resource"];
}

/** Whether a user upgraded a scheduled function (which goes from Pub/Sub to HTTPS). */
export function upgradedScheduleFromV1ToV2(
  have: backend.Endpoint,
  want: backend.Endpoint
): boolean {
  if (have.platform !== "gcfv1") {
    return false;
  }
  if (want.platform !== "gcfv2") {
    return false;
  }
  if (!backend.isScheduleTriggered(have)) {
    return false;
  }
  // should not be possible
  if (!backend.isScheduleTriggered(want)) {
    return false;
  }

  return true;
}
