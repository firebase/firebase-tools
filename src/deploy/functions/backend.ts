import * as proto from "../../gcp/proto";
import * as gcf from "../../gcp/cloudfunctions";
import * as gcfV2 from "../../gcp/cloudfunctionsv2";
import * as utils from "../../utils";
import * as runtimes from "./runtimes";
import { FirebaseError } from "../../error";
import { Context } from "./args";
import { previews } from "../../previews";
import { backendFromV1Alpha1 } from "./runtimes/discovery/v1alpha1";

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
  labels?: Record<string, string>;

  // What we're actually planning to invoke with this topic
  targetService: TargetIds;
}

export interface ScheduleTrigger {
  // Note: schedule is missing in the existingBackend because we
  // don't actually spend the API call looking up the schedule;
  // we just infer identifiers from function labels.
  schedule?: string;
  timeZone?: string;
  retryConfig?: ScheduleRetryConfig;
}

/** API agnostic version of a CloudScheduler Job */
export interface ScheduleSpec extends ScheduleTrigger {
  id: string;
  project: string;
  transport: "pubsub" | "https";

  // What we're actually planning to invoke with this schedule
  targetService: TargetIds;
}

/** Something that has a ScheduleTrigger */
export interface ScheduleTriggered {
  scheduleTrigger: ScheduleTrigger;
}

/** API agnostic version of a Cloud Function's HTTPs trigger. */
export interface HttpsTrigger {
  invoker?: string[];
}

/** Something that has an HTTPS trigger */
export interface HttpsTriggered {
  httpsTrigger: HttpsTrigger;
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

/** Something that has an EventTrigger */
export interface EventTriggered {
  eventTrigger: EventTrigger;
}

/** Type deduction helper for a function trigger. */
export function isEventTrigger(trigger: HttpsTrigger | EventTrigger): trigger is EventTrigger {
  return "eventType" in trigger;
}

/** Friendly name to label a function in stats */
export function triggerTag(fn: FunctionSpec): string {
  if (fn.labels?.["deployment-scheduled"]) {
    if (fn.platform === "gcfv1") {
      return "v1.scheduled";
    }
    return "v2.scheduled";
  }
  if (fn.labels?.["deployment-callable"]) {
    if (fn.platform === "gcfv1") {
      return "v1.callable";
    }
    return "v2.callable";
  }
  if (!isEventTrigger(fn.trigger)) {
    if (fn.platform === "gcfv1") {
      return "v1.https";
    }
    return "v2.https";
  }
  return fn.trigger.eventType;
}

// TODO(inlined): Enum types should be singularly named
export type VpcEgressSettings = "PRIVATE_RANGES_ONLY" | "ALL_TRAFFIC";
export type IngressSettings = "ALLOW_ALL" | "ALLOW_INTERNAL_ONLY" | "ALLOW_INTERNAL_AND_GCLB";
export type MemoryOptions = 128 | 256 | 512 | 1024 | 2048 | 4096 | 8192;

/** Returns a human-readable name with MB or GB suffix for a MemoryOption (MB). */
export function memoryOptionDisplayName(option: MemoryOptions): string {
  return {
    128: "128MB",
    256: "256MB",
    512: "512MB",
    1024: "1GB",
    2048: "2GB",
    4096: "4GB",
    8192: "8GB",
  }[option];
}

export const SCHEDULED_FUNCTION_LABEL = Object.freeze({ deployment: "firebase-schedule" });

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

export interface ServiceConfiguration {
  concurrency?: number;
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
}

/** An API agnostic definition of a Cloud Function. */
export type FunctionSpec = TargetIds &
  ServiceConfiguration & {
    entryPoint: string;
    platform: FunctionsPlatform;
    runtime: runtimes.Runtime | runtimes.DeprecatedRuntime;
    trigger: EventTrigger | HttpsTrigger;

    // Output only

    // URI is available on GCFv1 for HTTPS triggers and
    // on GCFv2 always
    uri?: string;
    sourceUploadUrl?: string;
  };

export type FunctionsPlatform = "gcfv1" | "gcfv2";

export type Triggered = HttpsTriggered | EventTriggered | ScheduleTriggered;

/** Whether something has an HttpsTrigger */
export function isHttpsTriggered(triggered: Triggered): triggered is HttpsTriggered {
  return {}.hasOwnProperty.call(triggered, "httpsTrigger");
}

/** Whether something has an EventTrigger */
export function isEventTriggered(triggered: Triggered): triggered is EventTriggered {
  return {}.hasOwnProperty.call(triggered, "eventTrigger");
}

/** Whether something has a ScheduleTrigger */
export function isScheduleTriggered(triggered: Triggered): triggered is ScheduleTriggered {
  return {}.hasOwnProperty.call(triggered, "scheduleTrigger");
}

/**
 * An endpoint that serves traffic to a stack of services.
 * For now, this is always a Cloud Function. Future iterations may use complex
 * type unions to enforce that _either_ the Stack is all Functions or the
 * stack is all Services.
 */
export type Endpoint = TargetIds &
  ServiceConfiguration &
  Triggered & {
    entryPoint: string;
    platform: FunctionsPlatform;
    runtime: runtimes.Runtime | runtimes.DeprecatedRuntime;

    // Output only

    // URI is available on GCFv1 for HTTPS triggers and
    // on GCFv2 always
    uri?: string;
    sourceUploadUrl?: string;
  };

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
  environmentVariables: EnvironmentVariables;
  endpoints: Endpoint[];
}

/**
 * A helper utility to create an empty backend.
 * Tests that verify the behavior of one possible resource in a Backend can use
 * this method to avoid compiler errors when new fields are added to Backend.
 */
export function empty(): Backend {
  return {
    requiredAPIs: {},
    endpoints: [],
    cloudFunctions: [],
    schedules: [],
    topics: [],
    environmentVariables: {},
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
 * Environment variables to be applied to backend instances.
 * Applies to both GCFv1 and GCFv2 backends.
 */
export type EnvironmentVariables = Record<string, string>;

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
export function scheduleName(schedule: ScheduleSpec, appEngineLocation: string): string {
  return `projects/${schedule.project}/locations/${appEngineLocation}/jobs/${schedule.id}`;
}

/**
 * Gets the formal resource name for a Pub/Sub topic.
 * @param topic Something that implements project/id. This is intentionally vauge so
 *              that a schedule can be passed and the topic name generated.
 */
export function topicName(topic: { project: string; id: string }): string {
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
export function scheduleIdForFunction(cloudFunction: TargetIds): string {
  return `firebase-schedule-${cloudFunction.id}-${cloudFunction.region}`;
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
    ...empty(),
  };
  ctx.unreachableRegions = {
    gcfV1: [],
    gcfV2: [],
  };
  const gcfV1Results = await gcf.listAllFunctions(ctx.projectId);
  for (const apiFunction of gcfV1Results.functions) {
    const specFunction = gcf.specFromFunction(apiFunction);
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
        labels: SCHEDULED_FUNCTION_LABEL,
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
    const specFunction = gcfV2.specFromFunction(apiFunction);
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
        labels: SCHEDULED_FUNCTION_LABEL,
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
    if (fn.platform == "gcfv1") {
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
        neededUnreachableV2.join("\n\t") +
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

// To be a bit more deterministic, print function lists in a prescribed order.
// Future versions might want to compare regions by GCF/Run pricing tier before
// location.
export function compareFunctions(left: FunctionSpec, right: FunctionSpec): number {
  if (left.platform != right.platform) {
    return right.platform < left.platform ? -1 : 1;
  }
  if (left.region < right.region) {
    return -1;
  }
  if (left.region > right.region) {
    return 1;
  }
  if (left.id < right.id) {
    return -1;
  }
  if (left.id > right.id) {
    return 1;
  }
  return 0;
}
