import * as proto from "../../gcp/proto";
import * as gcf from "../../gcp/cloudfunctions";
import * as gcfV2 from "../../gcp/cloudfunctionsv2";
import * as cloudscheduler from "../../gcp/cloudscheduler";
import * as utils from "../../utils";
import { FirebaseError } from "../../error";
import { Context } from "./args";
import { logger } from "../../logger";
import { previews } from "../../previews";

/** Retry settings for a ScheduleSpec. */
export interface ScheduleRetryConfig {
  retryCount?: number;
  maxRetryDuration?: proto.Duration;
  minBackoffDuration?: proto.Duration;
  maxBackoffDuration?: proto.Duration;
  maxDoublings?: number;
}

/** API agnostic version of a Pub/Sub topic. */
export interface PubSubSpec {
  id: string;
  project: string;

  // What we're actually planning to invoke with this topic
  targetService: TargetIds;
}

/** API agnostic version of a CloudScheduler Job */
export interface ScheduleSpec {
  id: string;
  project: string;
  // Note: schedule is missing in the existingBackend because we
  // don't actually spend the API call looking up the schedule;
  // we just infer identifiers from function labels.
  schedule?: string;
  timeZone?: string;
  retryConfig?: ScheduleRetryConfig;
  transport: "pubsub" | "https";

  // What we're actually planning to invoke with this schedule
  targetService: TargetIds;
}

/** API agnostic version of a Cloud Function's HTTPs trigger. */
export interface HttpsTrigger {
  allowInsecure: boolean;
}

/** Well known keys in the eventFilter attribute of an event trigger */
export type EventFilterKey = "resource";

/** API agnostic version of a Cloud Function's event trigger. */
export interface EventTrigger {
  /**
   * Primary filter for events. Must be specified for all triggers.
   * Event sources introduced during the GCFv1 alpha will have a
   * eventType that looks like providers/firebase.database/eventTypes/ref.create
   * Event sources from GCF beta+ have event types that look like
   * google.firebase.database.ref.create.
   * Event sources from EventArc are versioned and have names that
   * look like google.cloud.pubsub.topic.v1.messagePublished
   */
  eventType: string;

  /**
   * Additional filters for narrowing down which events to receive.
   * While not required by the GCF API, this is always provided in
   * the Cloud Console, and we are likely to always require it as well.
   * V1 functions will always (and only) have the "resource" filter.
   * V2 will have arbitrary filters and some EventArc filters will be
   * top-level keys in the GCF API (e.g. "pubsubTopic").
   */
  eventFilters: Record<EventFilterKey | string, string>;

  /** Should failures in a function execution cause an event to be retried. */
  retry: boolean;

  /**
   * The region of a trigger, which may not be the same region as the function.
   * Cross-regional triggers are not permitted, i.e. triggers that are in a
   * single-region location that is different from the function's region.
   * When omitted, the region defults to the function's region.
   */
  region?: string;

  /**
   * Which service account EventArc should use to emit a function.
   * This field is ignored for v1 and defaults to the
   */
  serviceAccountEmail?: string;
}

/** Type deduction helper for a function trigger. */
export function isEventTrigger(trigger: HttpsTrigger | EventTrigger): trigger is EventTrigger {
  return "eventType" in trigger;
}

export type VpcEgressSettings = "PRIVATE_RANGES_ONLY" | "ALL_TRAFFIC";
export type IngressSettings = "ALLOW_ALL" | "ALLOW_INTERNAL_ONLY" | "ALLOW_INTERNAL_AND_GCLB";
export type MemoryOptions = 128 | 256 | 512 | 1024 | 2048 | 4096;

/** Supported runtimes for new Cloud Functions. */
export type Runtime = "nodejs10" | "nodejs12" | "nodejs14";

/** Runtimes that can be found in existing backends but not used for new functions. */
export type DeprecatedRuntime = "nodejs6" | "nodejs8";
const RUNTIMES: string[] = ["nodejs10", "nodejs12", "nodejs14"];

/** Type deduction helper for a runtime string. */
export function isValidRuntime(runtime: string): runtime is Runtime {
  return RUNTIMES.includes(runtime);
}

/**
 * IDs used to identify a regional resource.
 * This type exists so we can have lightweight references from a Pub/Sub topic
 * or Cloud Scheduler job to a function it invokes. Methods that operate on
 * a function name should take a TargetIds instead of a FunctionSpec
 * (e.g. functionName or functionLabel)
 *
 * It's possible that this type will need to become more complex when we support
 * a Cloud Run revision. We'll cross that bridge when we get to it.
 */
export interface TargetIds {
  id: string;
  region: string;
  project: string;
}

/** An API agnostic definition of a Cloud Function. */
export interface FunctionSpec extends TargetIds {
  apiVersion: 1 | 2;
  entryPoint: string;
  trigger: HttpsTrigger | EventTrigger;
  runtime: Runtime | DeprecatedRuntime;

  labels?: Record<string, string>;
  environmentVariables?: Record<string, string>;
  availableMemoryMb?: MemoryOptions;
  timeout?: proto.Duration;
  maxInstances?: number;
  minInstances?: number;
  vpcConnector?: string;
  vpcConnectorEgressSettings?: VpcEgressSettings;
  ingressSettings?: IngressSettings;
  serviceAccountEmail?: "default" | string;

  // Output only:

  // present for v1 functions with HTTP triggers and v2 functions always.
  uri?: string;
}

/** An API agnostic definition of an entire deployment a customer has or wants. */
export interface Backend {
  /**
   * requiredAPIs will be enabled when a Backend is deployed.
   * Their format is friendly name -> API name.
   * E.g. "scheduler" => "cloudscheduler.googleapis.com"
   */
  requiredAPIs: Record<string, string>;
  cloudFunctions: FunctionSpec[];
  schedules: ScheduleSpec[];
  topics: PubSubSpec[];
}

/**
 * A helper utility to create an empty backend.
 * Tests that verify the behavior of one possible resource in a Backend can use
 * this method to avoid compiler errors when new fields are added to Backend.
 */
export function empty(): Backend {
  return {
    requiredAPIs: {},
    cloudFunctions: [],
    schedules: [],
    topics: [],
  };
}

/**
 * A helper utility to test whether a backend is empty.
 * Consumers should use this before assuming a backend is empty (e.g. nooping
 * deploy processes) because it's possible that fields have been added.
 */
export function isEmptyBackend(backend: Backend): boolean {
  return (
    Object.keys(backend.requiredAPIs).length == 0 &&
    backend.cloudFunctions.length === 0 &&
    backend.schedules.length === 0 &&
    backend.topics.length === 0
  );
}

/**
 * Deprecated fields for Runtime Config.
 * RuntimeConfig will not be available in production for GCFv2 functions.
 * Future refactors of this code should move this type deeper into the codebase.
 */
export type RuntimeConfigValues = Record<string, unknown>;

/**
 * Gets the formal resource name for a Cloud Function.
 */
export function functionName(cloudFunction: TargetIds): string {
  return `projects/${cloudFunction.project}/locations/${cloudFunction.region}/functions/${cloudFunction.id}`;
}

/**
 * Creates a matcher function that detects whether two functions match.
 * This is useful for list comprehensions, e.g.
 * const newFunctions = wantFunctions.filter(fn => !haveFunctions.some(sameFunctionName(fn)));
 */
export const sameFunctionName = (func: TargetIds) => (test: TargetIds): boolean => {
  return func.id === test.id && func.region === test.region && func.project == test.project;
};

/**
 * Gets the formal resource name for a Cloud Scheduler job.
 * @param appEngineLocation Must be the region where the customer has enabled App Engine.
 */
export function scheduleName(schedule: ScheduleSpec, appEngineLocation: string) {
  return `projects/${schedule.project}/locations/${appEngineLocation}/jobs/${schedule.id}`;
}

/**
 * Gets the formal resource name for a Pub/Sub topic.
 * @param topic Something that implements project/id. This is intentionally vauge so
 *              that a schedule can be passed and the topic name generated.
 */
export function topicName(topic: { project: string; id: string }) {
  return `projects/${topic.project}/topics/${topic.id}`;
}

/**
 * The naming pattern used to create a Pub/Sub Topic or Scheduler Job ID for a given scheduled function.
 * This pattern is hard-coded and assumed throughout tooling, both in the Firebase Console and in the CLI.
 * For e.g., we automatically assume a schedule and topic with this name exists when we list funcitons and
 * see a label that it has an attached schedule. This saves us from making extra API calls.
 * DANGER: We use the pattern defined here to deploy and delete schedules,
 * and to display scheduled functions in the Firebase console
 * If you change this pattern, Firebase console will stop displaying schedule descriptions
 * and schedules created under the old pattern will no longer be cleaned up correctly
 */
export function scheduleIdForFunction(cloudFunction: TargetIds) {
  return `firebase-schedule-${cloudFunction.id}-${cloudFunction.region}`;
}

/**
 * Convert the API agnostic FunctionSpec struct to a CloudFunction proto for the v1 API.
 */
export function toGCFv1Function(
  cloudFunction: FunctionSpec,
  sourceUploadUrl: string
): Omit<gcf.CloudFunction, gcf.OutputOnlyFields> {
  if (cloudFunction.apiVersion != 1) {
    throw new FirebaseError(
      "Trying to create a v1 CloudFunction with v2 API. This should never happen"
    );
  }

  if (!isValidRuntime(cloudFunction.runtime)) {
    throw new FirebaseError(
      "Failed internal assertion. Trying to deploy a new function with a deprecated runtime." +
        " This should never happen"
    );
  }
  const gcfFunction: Omit<gcf.CloudFunction, gcf.OutputOnlyFields> = {
    name: functionName(cloudFunction),
    sourceUploadUrl: sourceUploadUrl,
    entryPoint: cloudFunction.entryPoint,
    runtime: cloudFunction.runtime,
  };

  if (isEventTrigger(cloudFunction.trigger)) {
    gcfFunction.eventTrigger = {
      eventType: cloudFunction.trigger.eventType,
      resource: cloudFunction.trigger.eventFilters.resource,
      // Service is unnecessary and deprecated
    };

    // For field masks to pick up a deleted failure policy we must inject an undefined
    // when retry is false
    gcfFunction.eventTrigger.failurePolicy = cloudFunction.trigger.retry
      ? { retry: {} }
      : undefined;
  } else {
    gcfFunction.httpsTrigger = {
      securityLevel: cloudFunction.trigger.allowInsecure ? "SECURE_OPTIONAL" : "SECURE_ALWAYS",
    };
  }

  proto.copyIfPresent(
    gcfFunction,
    cloudFunction,
    "serviceAccountEmail",
    "timeout",
    "availableMemoryMb",
    "minInstances",
    "maxInstances",
    "vpcConnector",
    "vpcConnectorEgressSettings",
    "ingressSettings",
    "labels",
    "environmentVariables"
  );

  return gcfFunction;
}

/**
 * Converts a Cloud Function from the v1 API into a version-agnostic FunctionSpec struct.
 * This API exists outside the GCF namespace because GCF returns an Operation<CloudFunction>
 * and code may have to call this method explicitly.
 */
export function fromGCFv1Function(gcfFunction: gcf.CloudFunction): FunctionSpec {
  const [, project, , region, , id] = gcfFunction.name.split("/");
  let trigger: EventTrigger | HttpsTrigger;
  let uri: string | undefined;
  if (gcfFunction.httpsTrigger) {
    trigger = {
      // Note: default (empty) value intentionally means true
      allowInsecure: gcfFunction.httpsTrigger.securityLevel !== "SECURE_ALWAYS",
    };
    uri = gcfFunction.httpsTrigger.url;
  } else {
    trigger = {
      eventType: gcfFunction.eventTrigger!.eventType,
      eventFilters: {
        resource: gcfFunction.eventTrigger!.resource,
      },
      retry: !!gcfFunction.eventTrigger!.failurePolicy?.retry,
    };
  }

  if (!isValidRuntime(gcfFunction.runtime)) {
    logger.debug("GCFv1 function has a deprecated runtime:", JSON.stringify(gcfFunction, null, 2));
  }

  const cloudFunction: FunctionSpec = {
    apiVersion: 1,
    id,
    project,
    region,
    trigger,
    entryPoint: gcfFunction.entryPoint,
    runtime: gcfFunction.runtime,
  };
  if (uri) {
    cloudFunction.uri = uri;
  }
  proto.copyIfPresent(
    cloudFunction,
    gcfFunction,
    "serviceAccountEmail",
    "availableMemoryMb",
    "timeout",
    "minInstances",
    "maxInstances",
    "vpcConnector",
    "vpcConnectorEgressSettings",
    "ingressSettings",
    "labels",
    "environmentVariables"
  );

  return cloudFunction;
}

export function toGCFv2Function(cloudFunction: FunctionSpec, source: gcfV2.StorageSource) {
  if (cloudFunction.apiVersion != 2) {
    throw new FirebaseError(
      "Trying to create a v2 CloudFunction with v1 API. This should never happen"
    );
  }

  if (!isValidRuntime(cloudFunction.runtime)) {
    throw new FirebaseError(
      "Failed internal assertion. Trying to deploy a new function with a deprecated runtime." +
        " This should never happen"
    );
  }

  const gcfFunction: Omit<gcfV2.CloudFunction, gcfV2.OutputOnlyFields> = {
    name: functionName(cloudFunction),
    buildConfig: {
      runtime: cloudFunction.runtime,
      entryPoint: cloudFunction.entryPoint,
      source: {
        storageSource: source,
      },
      // We don't use build environment variables,
      environmentVariables: {},
    },
    serviceConfig: {},
  };

  proto.copyIfPresent(
    gcfFunction.serviceConfig,
    cloudFunction,
    "availableMemoryMb",
    "environmentVariables",
    "vpcConnector",
    "vpcConnectorEgressSettings",
    "serviceAccountEmail",
    "ingressSettings"
  );
  proto.renameIfPresent(
    gcfFunction.serviceConfig,
    cloudFunction,
    "timeoutSeconds",
    "timeout",
    proto.secondsFromDuration
  );
  proto.renameIfPresent(
    gcfFunction.serviceConfig,
    cloudFunction,
    "minInstanceCount",
    "minInstances"
  );
  proto.renameIfPresent(
    gcfFunction.serviceConfig,
    cloudFunction,
    "maxInstanceCount",
    "maxInstances"
  );

  if (isEventTrigger(cloudFunction.trigger)) {
    gcfFunction.eventTrigger = {
      eventType: cloudFunction.trigger.eventType,
    };
    if (gcfFunction.eventTrigger.eventType === gcfV2.PUBSUB_PUBLISH_EVENT) {
      gcfFunction.eventTrigger.pubsubTopic = cloudFunction.trigger.eventFilters.resource;
    } else {
      gcfFunction.eventTrigger.eventFilters = [];
      for (const [attribute, value] of Object.entries(cloudFunction.trigger.eventFilters)) {
        gcfFunction.eventTrigger.eventFilters.push({ attribute, value });
      }
    }

    if (cloudFunction.trigger.retry) {
      logger.warn("Cannot set a retry policy on Cloud Function", cloudFunction.id);
    }
  } else if (cloudFunction.trigger.allowInsecure) {
    logger.warn("Cannot enable insecure traffic for Cloud Function", cloudFunction.id);
  }
  proto.copyIfPresent(gcfFunction, cloudFunction, "labels");

  console.error("GCFv2 Function is:", JSON.stringify(gcfFunction, null, 2));
  return gcfFunction;
}

export function fromGCFv2Function(gcfFunction: gcfV2.CloudFunction): FunctionSpec {
  const [, project, , region, , id] = gcfFunction.name.split("/");
  let trigger: EventTrigger | HttpsTrigger;
  if (gcfFunction.eventTrigger) {
    trigger = {
      eventType: gcfFunction.eventTrigger!.eventType,
      eventFilters: {},
      retry: false,
    };
    if (gcfFunction.eventTrigger.pubsubTopic) {
      trigger.eventFilters.resource = gcfFunction.eventTrigger.pubsubTopic;
    } else {
      for (const { attribute, value } of gcfFunction.eventTrigger.eventFilters || []) {
        trigger.eventFilters[attribute] = value;
      }
    }
  } else {
    trigger = {
      allowInsecure: false,
    };
  }

  if (!isValidRuntime(gcfFunction.buildConfig.runtime)) {
    logger.debug("GCFv1 function has a deprecated runtime:", JSON.stringify(gcfFunction, null, 2));
  }

  const cloudFunction: FunctionSpec = {
    apiVersion: 2,
    id,
    project,
    region,
    trigger,
    entryPoint: gcfFunction.buildConfig.entryPoint,
    runtime: gcfFunction.buildConfig.runtime,
    uri: gcfFunction.serviceConfig.uri,
  };
  proto.copyIfPresent(
    cloudFunction,
    gcfFunction.serviceConfig,
    "serviceAccountEmail",
    "availableMemoryMb",
    "vpcConnector",
    "vpcConnectorEgressSettings",
    "ingressSettings",
    "environmentVariables"
  );
  proto.renameIfPresent(
    cloudFunction,
    gcfFunction.serviceConfig,
    "timeout",
    "timeoutSeconds",
    proto.durationFromSeconds
  );
  proto.renameIfPresent(
    cloudFunction,
    gcfFunction.serviceConfig,
    "minInstances",
    "minInstanceCount"
  );
  proto.renameIfPresent(
    cloudFunction,
    gcfFunction.serviceConfig,
    "maxInstances",
    "maxInstanceCount"
  );
  proto.copyIfPresent(cloudFunction, gcfFunction, "labels");

  return cloudFunction;
}

/** Converts a version agnostic ScheduleSpec to a CloudScheduler v1 Job. */
export function toJob(schedule: ScheduleSpec, appEngineLocation: string): cloudscheduler.Job {
  const job: cloudscheduler.Job = {
    name: scheduleName(schedule, appEngineLocation),
    schedule: schedule.schedule!,
  };
  proto.copyIfPresent(job, schedule, "retryConfig");
  if (schedule.transport === "https") {
    throw new FirebaseError("HTTPS transport for scheduled functions is not yet supported");
  }
  job.pubsubTarget = {
    topicName: topicName(schedule),
    attributes: {
      scheduled: "true",
    },
  };
  return job;
}

interface PrivateContextFields {
  existingBackend: Backend;
  loadedExistingBackend?: boolean;

  // NOTE(inlined): Will this need to become a more nuanced data structure
  // if we support GCFv1, v2, and Run?
  unreachableRegions: {
    gcfV1: string[];
    gcfV2: string[];
  };
}

/**
 * A caching accessor of the existing backend.
 * The method explicitly loads Cloud Functions from their API but implicitly deduces
 * functions' schedules and topics based on function labels. Functions that are not
 * deployed with the Firebase CLI are included so that we can support customers moving
 * a function that was managed with GCloud to managed by Firebase as an update operation.
 * To determine whether a function was already managed by firebase-tools use
 * deploymentTool.isFirebaseManaged(function.labels)
 * @param context A context object, passed from the Command library and used for caching.
 * @param forceRefresh If true, ignores and overwrites the cache. These cases should eventually go away.
 * @return The backend
 */
export async function existingBackend(context: Context, forceRefresh?: boolean): Promise<Backend> {
  const ctx = context as Context & PrivateContextFields;
  if (!ctx.loadedExistingBackend || forceRefresh) {
    await loadExistingBackend(ctx);
  }
  return ctx.existingBackend;
}

async function loadExistingBackend(ctx: Context & PrivateContextFields): Promise<void> {
  ctx.loadedExistingBackend = true;
  // Note: is it worth deducing the APIs that must have been enabled for this backend to work?
  // it could reduce redundant API calls for enabling the APIs.
  ctx.existingBackend = {
    requiredAPIs: {},
    cloudFunctions: [],
    schedules: [],
    topics: [],
  };
  ctx.unreachableRegions = {
    gcfV1: [],
    gcfV2: [],
  };
  const gcfV1Results = await gcf.listAllFunctions(ctx.projectId);
  for (const apiFunction of gcfV1Results.functions) {
    const specFunction = fromGCFv1Function(apiFunction);
    ctx.existingBackend.cloudFunctions.push(specFunction);
    const isScheduled = apiFunction.labels?.["deployment-scheduled"] === "true";
    if (isScheduled) {
      const id = scheduleIdForFunction(specFunction);
      ctx.existingBackend.schedules.push({
        id,
        project: specFunction.project,
        transport: "pubsub",
        targetService: {
          id: specFunction.id,
          region: specFunction.region,
          project: specFunction.project,
        },
      });
      ctx.existingBackend.topics.push({
        id,
        project: specFunction.project,
        targetService: {
          id: specFunction.id,
          region: specFunction.region,
          project: specFunction.project,
        },
      });
    }
  }
  ctx.unreachableRegions.gcfV1 = gcfV1Results.unreachable;

  if (!previews.functionsv2) {
    return;
  }

  const gcfV2Results = await gcfV2.listAllFunctions(ctx.projectId);
  for (const apiFunction of gcfV2Results.functions) {
    const specFunction = fromGCFv2Function(apiFunction);
    ctx.existingBackend.cloudFunctions.push(specFunction);
    const pubsubScheduled = apiFunction.labels?.["deployment-scheduled"] === "true";
    const httpsScheduled = apiFunction.labels?.["deployment-scheduled"] === "https";
    if (pubsubScheduled) {
      const id = scheduleIdForFunction(specFunction);
      ctx.existingBackend.schedules.push({
        id,
        project: specFunction.project,
        transport: "pubsub",
        targetService: {
          id: specFunction.id,
          region: specFunction.region,
          project: specFunction.project,
        },
      });
      ctx.existingBackend.topics.push({
        id,
        project: specFunction.project,
        targetService: {
          id: specFunction.id,
          region: specFunction.region,
          project: specFunction.project,
        },
      });
    }
    if (httpsScheduled) {
      const id = scheduleIdForFunction(specFunction);
      ctx.existingBackend.schedules.push({
        id,
        project: specFunction.project,
        transport: "https",
        targetService: {
          id: specFunction.id,
          region: specFunction.region,
          project: specFunction.project,
        },
      });
    }
  }
  ctx.unreachableRegions.gcfV2 = gcfV2Results.unreachable;
}

/**
 * A helper function that guards against unavailable regions affecting a backend deployment.
 * If the desired backend uses a region that is unavailable, a FirebaseError is thrown.
 * If a region is unavailable but the desired backend does not use it, a warning is logged
 * that the standard cleanup process won't happen in that region.
 * @param context A context object from the Command library. Used for caching.
 * @param want The desired backend. Can be backend.empty() to only warn about unavailability.
 */
export async function checkAvailability(context: Context, want: Backend): Promise<void> {
  const ctx = context as Context & PrivateContextFields;
  if (!ctx.loadedExistingBackend) {
    await loadExistingBackend(ctx);
  }
  const gcfV1Regions = new Set();
  const gcfV2Regions = new Set();
  for (const fn of want.cloudFunctions) {
    if (fn.apiVersion === 1) {
      gcfV1Regions.add(fn.region);
    } else {
      gcfV2Regions.add(fn.region);
    }
  }

  const neededUnreachableV1 = ctx.unreachableRegions.gcfV1.filter((region) =>
    gcfV1Regions.has(region)
  );
  const neededUnreachableV2 = ctx.unreachableRegions.gcfV2.filter((region) =>
    gcfV2Regions.has(region)
  );
  if (neededUnreachableV1.length) {
    throw new FirebaseError(
      "The following Cloud Functions regions are currently unreachable:\n\t" +
        neededUnreachableV1.join("\n\t") +
        "\nThis deployment contains functions in those regions. Please try again in a few minutes, or exclude these regions from your deployment."
    );
  }

  if (neededUnreachableV2.length) {
    throw new FirebaseError(
      "The following Cloud Functions V2 regions are currently unreachable:\n\t" +
        neededUnreachableV1.join("\n\t") +
        "\nThis deployment contains functions in those regions. Please try again in a few minutes, or exclude these regions from your deployment."
    );
  }

  if (ctx.unreachableRegions.gcfV1.length) {
    utils.logLabeledWarning(
      "functions",
      "The following Cloud Functions regions are currently unreachable:\n" +
        ctx.unreachableRegions.gcfV1.join("\n") +
        "\nCloud Functions in these regions won't be deleted."
    );
  }

  if (ctx.unreachableRegions.gcfV2.length) {
    utils.logLabeledWarning(
      "functions",
      "The following Cloud Functions V2 regions are currently unreachable:\n" +
        ctx.unreachableRegions.gcfV2.join("\n") +
        "\nCloud Functions in these regions won't be deleted."
    );
  }
}
