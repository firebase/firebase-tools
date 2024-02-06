import * as clc from "colorette";

import {
  EndpointFilter,
  endpointMatchesAnyFilter,
  getFunctionLabel,
} from "../functionsDeployHelper";
import { isFirebaseManaged } from "../../../deploymentTool";
import { FirebaseError } from "../../../error";
import * as utils from "../../../utils";
import * as backend from "../backend";
import * as v2events from "../../../functions/events/v2";
import {
  FIRESTORE_EVENT_REGEX,
  FIRESTORE_EVENT_WITH_AUTH_CONTEXT_REGEX,
} from "../../../functions/events/v2";

export interface EndpointUpdate {
  endpoint: backend.Endpoint;
  deleteAndRecreate?: backend.Endpoint;
  unsafe?: boolean;
}

export interface Changeset {
  endpointsToCreate: backend.Endpoint[];
  endpointsToUpdate: EndpointUpdate[];
  endpointsToDelete: backend.Endpoint[];
  endpointsToSkip: backend.Endpoint[];
}

export type DeploymentPlan = Record<string, Changeset>;

export interface PlanArgs {
  wantBackend: backend.Backend; // the desired state
  haveBackend: backend.Backend; // the current state
  codebase: string; // target codebase of the deployment
  filters?: EndpointFilter[]; // filters to apply to backend, passed from users by --only flag
  deleteAll?: boolean; // deletes all functions if set
}

/** Calculate the changesets of given endpoints by grouping endpoints with keyFn. */
export function calculateChangesets(
  want: Record<string, backend.Endpoint>,
  have: Record<string, backend.Endpoint>,
  keyFn: (e: backend.Endpoint) => string,
  deleteAll?: boolean,
): Record<string, Changeset> {
  const toCreate = utils.groupBy(
    Object.keys(want)
      .filter((id) => !have[id])
      .map((id) => want[id]),
    keyFn,
  );

  const toDelete = utils.groupBy(
    Object.keys(have)
      .filter((id) => !want[id])
      .filter((id) => deleteAll || isFirebaseManaged(have[id].labels || {}))
      .map((id) => have[id]),
    keyFn,
  );

  // If the hashes are matching, that means the local function is the same as the server copy.
  const toSkipPredicate = (id: string): boolean =>
    !!(
      !want[id].targetedByOnly && // Don't skip the function if its --only targeted.
      have[id].hash &&
      want[id].hash &&
      want[id].hash === have[id].hash
    );

  const toSkipEndpointsMap = Object.keys(want)
    .filter((id) => have[id])
    .filter((id) => toSkipPredicate(id))
    .reduce((memo: Record<string, backend.Endpoint>, id) => {
      memo[id] = want[id];
      return memo;
    }, {});

  const toSkip = utils.groupBy(Object.values(toSkipEndpointsMap), keyFn);
  if (Object.keys(toSkip).length) {
    utils.logLabeledBullet(
      "functions",
      `Skipping the deploy of unchanged functions with ${clc.bold(
        "experimental",
      )} support for skipdeployingnoopfunctions`,
    );
  }

  const toUpdate = utils.groupBy(
    Object.keys(want)
      .filter((id) => have[id])
      .filter((id) => !toSkipEndpointsMap[id])
      .map((id) => calculateUpdate(want[id], have[id])),
    (eu: EndpointUpdate) => keyFn(eu.endpoint),
  );

  const result: Record<string, Changeset> = {};
  const keys = new Set([
    ...Object.keys(toCreate),
    ...Object.keys(toDelete),
    ...Object.keys(toUpdate),
    ...Object.keys(toSkip),
  ]);
  for (const key of keys) {
    result[key] = {
      endpointsToCreate: toCreate[key] || [],
      endpointsToUpdate: toUpdate[key] || [],
      endpointsToDelete: toDelete[key] || [],
      endpointsToSkip: toSkip[key] || [],
    };
  }
  return result;
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
    unsafe: checkForUnsafeUpdate(want, have),
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
 */
export function createDeploymentPlan(args: PlanArgs): DeploymentPlan {
  let { wantBackend, haveBackend, codebase, filters, deleteAll } = args;
  let deployment: DeploymentPlan = {};
  wantBackend = backend.matchingBackend(wantBackend, (endpoint) => {
    return endpointMatchesAnyFilter(endpoint, filters);
  });
  const wantedEndpoint = backend.hasEndpoint(wantBackend);
  haveBackend = backend.matchingBackend(haveBackend, (endpoint) => {
    return wantedEndpoint(endpoint) || endpointMatchesAnyFilter(endpoint, filters);
  });

  const regions = new Set([
    ...Object.keys(wantBackend.endpoints),
    ...Object.keys(haveBackend.endpoints),
  ]);
  for (const region of regions) {
    const changesets = calculateChangesets(
      wantBackend.endpoints[region] || {},
      haveBackend.endpoints[region] || {},
      (e) => `${codebase}-${e.region}-${e.availableMemoryMb || "default"}`,
      deleteAll,
    );
    deployment = { ...deployment, ...changesets };
  }

  if (upgradedToGCFv2WithoutSettingConcurrency(wantBackend, haveBackend)) {
    utils.logLabeledBullet(
      "functions",
      "You are updating one or more functions to Google Cloud Functions v2, " +
        "which introduces support for concurrent execution. New functions " +
        "default to 80 concurrent executions, but existing functions keep the " +
        "old default of 1. You can change this with the 'concurrency' option.",
    );
  }
  return deployment;
}

/** Whether a user upgraded any endpoints to GCFv2 without setting concurrency. */
export function upgradedToGCFv2WithoutSettingConcurrency(
  want: backend.Backend,
  have: backend.Backend,
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

/**
 * Whether a trigger changed regions. This can happen if, for example,
 *  a user listens to a different bucket, which happens to have a different region.
 */
export function changedTriggerRegion(want: backend.Endpoint, have: backend.Endpoint): boolean {
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
  return want.eventTrigger.region !== have.eventTrigger.region;
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
  if (want.eventTrigger.eventType !== v2events.PUBSUB_PUBLISH_EVENT) {
    return false;
  }
  if (have.eventTrigger.eventType !== v2events.PUBSUB_PUBLISH_EVENT) {
    return false;
  }
  return have.eventTrigger.eventFilters!.topic !== want.eventTrigger.eventFilters!.topic;
}

/** Whether a user upgraded a scheduled function (which goes from Pub/Sub to HTTPS). */
export function upgradedScheduleFromV1ToV2(
  want: backend.Endpoint,
  have: backend.Endpoint,
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

/** Whether a function update is considered unsafe to perform automatically by the CLI */
export function checkForUnsafeUpdate(want: backend.Endpoint, have: backend.Endpoint): boolean {
  return (
    backend.isEventTriggered(want) &&
    FIRESTORE_EVENT_WITH_AUTH_CONTEXT_REGEX.test(want.eventTrigger.eventType) &&
    backend.isEventTriggered(have) &&
    FIRESTORE_EVENT_REGEX.test(have.eventTrigger.eventType)
  );
}

/** Throws if there is an illegal update to a function. */
export function checkForIllegalUpdate(want: backend.Endpoint, have: backend.Endpoint): void {
  const triggerType = (e: backend.Endpoint): string => {
    if (backend.isHttpsTriggered(e)) {
      return "an HTTPS";
    } else if (backend.isCallableTriggered(e)) {
      return "a callable";
    } else if (backend.isEventTriggered(e)) {
      return "a background triggered";
    } else if (backend.isScheduleTriggered(e)) {
      return "a scheduled";
    } else if (backend.isTaskQueueTriggered(e)) {
      return "a task queue";
    } else if (backend.isBlockingTriggered(e)) {
      return e.blockingTrigger.eventType;
    }
    // Unfortunately TypeScript isn't like Scala and I can't prove to it
    // that all cases have been handled
    throw Error("Functions release planner is not able to handle an unknown trigger type");
  };
  const wantType = triggerType(want);
  const haveType = triggerType(have);
  if (wantType !== haveType) {
    throw new FirebaseError(
      `[${getFunctionLabel(
        want,
      )}] Changing from ${haveType} function to ${wantType} function is not allowed. Please delete your function and create a new one instead.`,
    );
  }
  if (want.platform === "gcfv1" && have.platform === "gcfv2") {
    throw new FirebaseError(
      `[${getFunctionLabel(want)}] Functions cannot be downgraded from GCFv2 to GCFv1`,
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
  if (want.platform === "gcfv2" && have.platform === "gcfv1") {
    throw new FirebaseError(
      `[${getFunctionLabel(
        have,
      )}] Upgrading from GCFv1 to GCFv2 is not yet supported. Please delete your old function or wait for this feature to be ready.`,
    );
  }
}
