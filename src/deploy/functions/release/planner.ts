import { functionMatchesAnyGroup } from "../functionsDeployHelper";
import { getFunctionLabel } from "../functionsDeployHelper";
import { isFirebaseManaged } from "../../../deploymentTool";
import { FirebaseError } from "../../../error";
import * as utils from "../../../utils";
import * as backend from "../backend";
import * as gcfv2 from "../../../gcp/cloudfunctionsv2";

export interface EndpointUpdate {
  endpoint: backend.Endpoint;
  deleteAndRecreate?: backend.Endpoint;
}

export interface RegionalChanges {
  endpointsToCreate: backend.Endpoint[];
  endpointsToUpdate: EndpointUpdate[];
  endpointsToDelete: backend.Endpoint[];
}

export type DeploymentPlan = Record<string, RegionalChanges>;

export interface Options {
  filters?: string[][];
  // If set to false, will delete only functions that are managed by firebase
  deleteAll?: boolean;
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
    .filter((id) => options.deleteAll || isFirebaseManaged(have[id].labels || {}))
    .map((id) => have[id]);

  const endpointsToUpdate = Object.keys(want)
    .filter((id) => have[id])
    .map((id) => calculateUpdate(want[id], have[id]));
  return { endpointsToCreate, endpointsToUpdate, endpointsToDelete };
}

/**
 * Calculates the update object for a given endpoint.
 * Throws if the update is illegal.
 * Forces a delete & recreate if the underlying API doesn't allow an upgrade but
 * CF3 does.
 */
export function calculateUpdate(want: backend.Endpoint, have: backend.Endpoint): EndpointUpdate {
  checkForIllegalUpdate(want, have);

  const update: EndpointUpdate = {
    endpoint: want,
  };
  const needsDelete =
    changedTriggerRegion(want, have) ||
    changedV2PubSubTopic(want, have) ||
    upgradedScheduleFromV1ToV2(want, have);
  if (needsDelete) {
    update.deleteAndRecreate = have;
  }
  return update;
}

/**
 * Create a plan for deploying all functions in one region.
 * @param want the desired state
 * @param have the current state
 * @param filters The filters, passed in by the user via  `--only functions:`
 */
export function createDeploymentPlan(
  want: backend.Backend,
  have: backend.Backend,
  options: Options = {}
): DeploymentPlan {
  const deployment: DeploymentPlan = {};
  want = backend.matchingBackend(want, (endpoint) => {
    return functionMatchesAnyGroup(endpoint, options.filters || []);
  });
  have = backend.matchingBackend(have, (endpoint) => {
    return functionMatchesAnyGroup(endpoint, options.filters || []);
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
    // If there is not an existing v1 function
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

/** Whether a trigger chagned regions. This can happen if, for example,
 *  a user listens to a different bucket, which happens to have a different region.
 */
export function changedTriggerRegion(want: backend.Endpoint, have: backend.Endpoint): boolean {
  if (want.platform != "gcfv2") {
    return false;
  }
  if (have.platform != "gcfv2") {
    return false;
  }
  if (!backend.isEventTriggered(want)) {
    return false;
  }
  if (!backend.isEventTriggered(have)) {
    return false;
  }
  return want.eventTrigger.region != have.eventTrigger.region;
}

/** Whether a user changed the Pub/Sub topic of a GCFv2 function (which isn't allowed in the API). */
export function changedV2PubSubTopic(want: backend.Endpoint, have: backend.Endpoint): boolean {
  if (want.platform !== "gcfv2") {
    return false;
  }
  if (have.platform !== "gcfv2") {
    return false;
  }
  if (!backend.isEventTriggered(want)) {
    return false;
  }
  if (!backend.isEventTriggered(have)) {
    return false;
  }
  if (want.eventTrigger.eventType != gcfv2.PUBSUB_PUBLISH_EVENT) {
    return false;
  }
  if (have.eventTrigger.eventType !== gcfv2.PUBSUB_PUBLISH_EVENT) {
    return false;
  }
  return have.eventTrigger.eventFilters["resource"] != want.eventTrigger.eventFilters["resource"];
}

/** Whether a user upgraded a scheduled function (which goes from Pub/Sub to HTTPS). */
export function upgradedScheduleFromV1ToV2(
  want: backend.Endpoint,
  have: backend.Endpoint
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

/** Throws if there is an illegal update to a function. */
export function checkForIllegalUpdate(want: backend.Endpoint, have: backend.Endpoint): void {
  const triggerType = (e: backend.Endpoint): string => {
    if (backend.isHttpsTriggered(e)) {
      return "an HTTPS";
    } else if (backend.isEventTriggered(e)) {
      return "a background triggered";
    } else if (backend.isScheduleTriggered(e)) {
      return "a scheduled";
    } else if (backend.isTaskQueueTriggered(e)) {
      return "a task queue";
    }
    // Unfortunately TypeScript isn't like Scala and I can't prove to it
    // that all cases have been handled
    throw Error("Functions release planner is not able to handle an unknown trigger type");
  };
  const wantType = triggerType(want);
  const haveType = triggerType(have);
  if (wantType != haveType) {
    throw new FirebaseError(
      `[${getFunctionLabel(
        want
      )}] Changing from ${haveType} function to ${wantType} function is not allowed. Please delete your function and create a new one instead.`
    );
  }
  if (want.platform == "gcfv1" && have.platform == "gcfv2") {
    throw new FirebaseError(
      `[${getFunctionLabel(want)}] Functions cannot be downgraded from GCFv2 to GCFv1`
    );
  }

  // We need to call from module exports so tests can stub this behavior, but that
  // breaks the type system.
  // eslint-disable-next-line
  exports.checkForV2Upgrade(want, have);
}

/**
 * Throws an error when upgrading/downgrading GCF versions.
 * This is a separate function that is designed to be stubbed in tests to allow
 * upgrading to v2 in tests before production is ready
 */
export function checkForV2Upgrade(want: backend.Endpoint, have: backend.Endpoint): void {
  if (want.platform == "gcfv2" && have.platform == "gcfv1") {
    throw new FirebaseError(
      `[${getFunctionLabel(
        have
      )}] Upgrading from GCFv1 to GCFv2 is not yet supported. Please delete your old function or wait for this feature to be ready.`
    );
  }
}
