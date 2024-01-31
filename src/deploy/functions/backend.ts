import * as gcf from "../../gcp/cloudfunctions";
import * as gcfV2 from "../../gcp/cloudfunctionsv2";
import * as utils from "../../utils";
import * as runtimes from "./runtimes";
import { FirebaseError } from "../../error";
import { Context } from "./args";
import { flattenArray } from "../../functional";

/** Retry settings for a ScheduleSpec. */
export interface ScheduleRetryConfig {
  retryCount?: number | null;
  maxRetrySeconds?: number | null;
  minBackoffSeconds?: number | null;
  maxBackoffSeconds?: number | null;
  maxDoublings?: number | null;
}

export interface ScheduleTrigger {
  // Note: schedule is missing in the existingBackend because we
  // don't actually spend the API call looking up the schedule;
  // we just infer identifiers from function labels. OTOH, schedule cannot
  // be null, because there is no default to set it to.
  schedule?: string;
  timeZone?: string | null;
  retryConfig?: ScheduleRetryConfig | null;
}

/** Something that has a ScheduleTrigger */
export interface ScheduleTriggered {
  scheduleTrigger: ScheduleTrigger;
}

/** API agnostic version of a Cloud Function's HTTPs trigger. */
export interface HttpsTrigger {
  invoker?: string[] | null;
}

/** Something that has an HTTPS trigger */
export interface HttpsTriggered {
  httpsTrigger: HttpsTrigger;
}

/** API agnostic version of a Firebase callable function. */
export type CallableTrigger = Record<string, never>;

/** Something that has a callable trigger */
export interface CallableTriggered {
  callableTrigger: CallableTrigger;
}

type EventFilterKey = "resource" | "topic" | "bucket" | "alerttype" | "appid" | string;

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
   * Additional exact-match filters for narrowing down which events to receive.
   *
   * While not required by the GCF API, this is always provided in
   * the Cloud Console, and we are likely to always require it as well.
   * V1 functions will always (and only) have the "resource" filter.
   * V2 will have arbitrary filters and some EventArc filters will be
   * top-level keys in the GCF API (e.g. "pubsubTopic").
   */
  eventFilters?: Record<EventFilterKey, string>;

  /**
   * Additional path-pattern filters for narrowing down which events to receive.
   */
  eventFilterPathPatterns?: Record<string, string>;

  /** Should failures in a function execution cause an event to be retried. */
  retry: boolean;

  /**
   * The region of a trigger, which may not be the same region as the function.
   * Cross-regional triggers are not permitted, i.e. triggers that are in a
   * single-region location that is different from the function's region.
   * When omitted, the region defaults to the function's region.
   */
  region?: string;

  /**
   * Which service account EventArc should use to emit a function.
   * This field is ignored for v1 and defaults to the
   */
  serviceAccount?: string | null;

  /**
   * The name of the channel where the function receive events.
   * Must be provided to receive custom events.
   */
  channel?: string;
}

/** Something that has an EventTrigger */
export interface EventTriggered {
  eventTrigger: EventTrigger;
}

export interface TaskQueueRateLimits {
  maxConcurrentDispatches?: number | null;
  maxDispatchesPerSecond?: number | null;
}

export interface TaskQueueRetryConfig {
  maxAttempts?: number | null;
  maxRetrySeconds?: number | null;
  maxBackoffSeconds?: number | null;
  maxDoublings?: number | null;
  minBackoffSeconds?: number | null;
}

export interface TaskQueueTrigger {
  rateLimits?: TaskQueueRateLimits | null;
  retryConfig?: TaskQueueRetryConfig | null;
  invoker?: string[] | null;
}

export interface TaskQueueTriggered {
  taskQueueTrigger: TaskQueueTrigger;
}

export interface BlockingTrigger {
  eventType: string;
  options?: Record<string, unknown>;
}
export interface BlockingTriggered {
  blockingTrigger: BlockingTrigger;
}

/** A user-friendly string for the kind of trigger of an endpoint. */
export function endpointTriggerType(endpoint: Endpoint): string {
  if (isScheduleTriggered(endpoint)) {
    return "scheduled";
  } else if (isHttpsTriggered(endpoint)) {
    return "https";
  } else if (isCallableTriggered(endpoint)) {
    return "callable";
  } else if (isEventTriggered(endpoint)) {
    return endpoint.eventTrigger.eventType;
  } else if (isTaskQueueTriggered(endpoint)) {
    return "taskQueue";
  } else if (isBlockingTriggered(endpoint)) {
    return endpoint.blockingTrigger.eventType;
  } else {
    throw new Error("Unexpected trigger type for endpoint " + JSON.stringify(endpoint));
  }
}

// TODO(inlined): Enum types should be singularly named
export type VpcEgressSettings = "PRIVATE_RANGES_ONLY" | "ALL_TRAFFIC";
export const AllVpcEgressSettings: VpcEgressSettings[] = ["PRIVATE_RANGES_ONLY", "ALL_TRAFFIC"];
export type IngressSettings = "ALLOW_ALL" | "ALLOW_INTERNAL_ONLY" | "ALLOW_INTERNAL_AND_GCLB";
export const AllIngressSettings: IngressSettings[] = [
  "ALLOW_ALL",
  "ALLOW_INTERNAL_ONLY",
  "ALLOW_INTERNAL_AND_GCLB",
];
export type MemoryOptions = 128 | 256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384 | 32768;
const allMemoryOptions: MemoryOptions[] = [128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];

/**
 * Is a given number a valid MemoryOption?
 */
export function isValidMemoryOption(mem: unknown): mem is MemoryOptions {
  return allMemoryOptions.includes(mem as MemoryOptions);
}

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
    16384: "16GB",
    32768: "32GB",
  }[option];
}

/**
 * Returns the gen 1 mapping of CPU for RAM. Used whenever a customer sets cpu to "gcf_gen1".
 * Note that these values must be the right number of decimal places and include
 * rounding errors (e.g. 0.1666 instead of 0.1667) so that we match GCF's
 * behavior and don't unnecessarily create a new Run revision because our target
 * CPU doesn't exactly match their CPU.
 */
export function memoryToGen1Cpu(memory: MemoryOptions): number {
  return {
    128: 0.0833, // ~1/12
    256: 0.1666, // ~1/6
    512: 0.3333, // ~1/3
    1024: 0.5833, // ~5/7
    2048: 1,
    4096: 2,
    8192: 2,
    16384: 4,
    32768: 8,
  }[memory];
}

/**
 * The amount of CPU we allocate in V2.
 * Where these don't match with memoryToGen1Cpu we must manually configure these
 * at the run service.
 */
export function memoryToGen2Cpu(memory: MemoryOptions): number {
  return {
    128: 1,
    256: 1,
    512: 1,
    1024: 1,
    2048: 1,
    4096: 2,
    8192: 2,
    16384: 4,
    32768: 8,
  }[memory];
}

export const DEFAULT_CONCURRENCY = 80;
export const DEFAULT_MEMORY: MemoryOptions = 256;
export const MIN_CPU_FOR_CONCURRENCY = 1;
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

/**
 * Represents a Secret or Secret Version resource.
 * Based on https://cloud.google.com/functions/docs/reference/rest/v1/projects.locations.functions#secretenvvar
 */
export interface SecretEnvVar {
  key: string; // The environment variable this secret is accessible at
  secret: string; // The id of the SecretVersion - ie for projects/myproject/secrets/mysecret, this is 'mysecret'
  projectId: string; // The project containing the Secret

  // Internal use only. Users cannot pin secret to a specific version.
  version?: string;
}

/**
 * Returns full resource name of a secret version.
 */
export function secretVersionName(s: SecretEnvVar): string {
  return `projects/${s.projectId}/secrets/${s.secret}/versions/${s.version ?? "latest"}`;
}

export interface ServiceConfiguration {
  concurrency?: number | null;
  labels?: Record<string, string> | null;
  environmentVariables?: Record<string, string> | null;
  secretEnvironmentVariables?: SecretEnvVar[] | null;
  availableMemoryMb?: MemoryOptions | null;
  cpu?: number | "gcf_gen1" | null;
  timeoutSeconds?: number | null;
  maxInstances?: number | null;
  minInstances?: number | null;
  vpc?: {
    connector: string;
    egressSettings?: VpcEgressSettings | null;
  } | null;
  ingressSettings?: IngressSettings | null;
  serviceAccount?: string | null;
}

export type FunctionsPlatform = "gcfv1" | "gcfv2";
export const AllFunctionsPlatforms: FunctionsPlatform[] = ["gcfv1", "gcfv2"];

export type Triggered =
  | HttpsTriggered
  | CallableTriggered
  | EventTriggered
  | ScheduleTriggered
  | TaskQueueTriggered
  | BlockingTriggered;

/** Whether something has an HttpsTrigger */
export function isHttpsTriggered(triggered: Triggered): triggered is HttpsTriggered {
  return {}.hasOwnProperty.call(triggered, "httpsTrigger");
}

/** Whether something has a CallableTrigger */
export function isCallableTriggered(triggered: Triggered): triggered is CallableTriggered {
  return {}.hasOwnProperty.call(triggered, "callableTrigger");
}

/** Whether something has an EventTrigger */
export function isEventTriggered(triggered: Triggered): triggered is EventTriggered {
  return {}.hasOwnProperty.call(triggered, "eventTrigger");
}

/** Whether something has a ScheduleTrigger */
export function isScheduleTriggered(triggered: Triggered): triggered is ScheduleTriggered {
  return {}.hasOwnProperty.call(triggered, "scheduleTrigger");
}

/** Whether something has a TaskQueueTrigger */
export function isTaskQueueTriggered(triggered: Triggered): triggered is TaskQueueTriggered {
  return {}.hasOwnProperty.call(triggered, "taskQueueTrigger");
}

/** Whether something has a BlockingTrigger */
export function isBlockingTriggered(triggered: Triggered): triggered is BlockingTriggered {
  return {}.hasOwnProperty.call(triggered, "blockingTrigger");
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
    // "Codebase" is not part of the container contract. Instead, it's value is provided by firebase.json or derived
    // from function labels.
    codebase?: string;
    // URI is available on GCFv1 for HTTPS triggers and on GCFv2 always
    uri?: string;
    // sourceUploadUrl is available on GCFv1 only
    sourceUploadUrl?: string;
    // source is available on GCFv2 only
    source?: gcfV2.Source;
    // TODO(colerogers): yank this field and set securityLevel to SECURE_ALWAYS
    // in functionFromEndpoint during a breaking change release.
    // This is a temporary fix to address https://github.com/firebase/firebase-tools/issues/4171
    // GCFv1 can be http or https and GCFv2 is always https
    securityLevel?: gcf.SecurityLevel;

    // "Hash" is a value derived from function labels that is used to check if there are any changes
    // between the serverside and local copies of the function.
    hash?: string;

    // Marked as true if a user specifically called this function or codebase with the --only flag.
    targetedByOnly?: boolean;

    // Output only. For v2 functions, this is the run service ID.
    // This may eventually be different than id because GCF is going to start
    // doing name translations
    runServiceId?: string;
  };

export interface RequiredAPI {
  reason?: string;
  api: string;
}

/** An API agnostic definition of an entire deployment a customer has or wants. */
export interface Backend {
  /**
   * requiredAPIs will be enabled when a Backend is deployed.
   */
  requiredAPIs: RequiredAPI[];
  environmentVariables: EnvironmentVariables;
  // region -> id -> Endpoint
  endpoints: Record<string, Record<string, Endpoint>>;
}

/**
 * A helper utility to create an empty backend.
 * Tests that verify the behavior of one possible resource in a Backend can use
 * this method to avoid compiler errors when new fields are added to Backend.
 */
export function empty(): Backend {
  return {
    requiredAPIs: [],
    endpoints: {},
    environmentVariables: {},
  };
}

/**
 * A helper utility to create a backend from a list of endpoints.
 * Useful in unit tests.
 */
export function of(...endpoints: Endpoint[]): Backend {
  const bkend = { ...empty() };
  for (const endpoint of endpoints) {
    bkend.endpoints[endpoint.region] = bkend.endpoints[endpoint.region] || {};
    if (bkend.endpoints[endpoint.region][endpoint.id]) {
      throw new Error("Trying to create a backend with the same endpoint twice");
    }
    bkend.endpoints[endpoint.region][endpoint.id] = endpoint;
  }
  return bkend;
}

/**
 * A helper utility to merge backends.
 */
export function merge(...backends: Backend[]): Backend {
  // Merge all endpoints
  const merged = of(...flattenArray(backends.map((b) => allEndpoints(b))));

  // Merge all APIs
  const apiToReasons: Record<string, Set<string>> = {};
  for (const b of backends) {
    for (const { api, reason } of b.requiredAPIs) {
      const reasons = apiToReasons[api] || new Set();
      if (reason) {
        reasons.add(reason);
      }
      apiToReasons[api] = reasons;
    }
    // Mere all environment variables.
    merged.environmentVariables = { ...merged.environmentVariables, ...b.environmentVariables };
  }
  for (const [api, reasons] of Object.entries(apiToReasons)) {
    merged.requiredAPIs.push({ api, reason: Array.from(reasons).join(" ") });
  }
  return merged;
}

/**
 * A helper utility to test whether a backend is empty.
 * Consumers should use this before assuming a backend is empty (e.g. nooping
 * deploy processes) because it's possible that fields have been added.
 */
export function isEmptyBackend(backend: Backend): boolean {
  return (
    Object.keys(backend.requiredAPIs).length === 0 && Object.keys(backend.endpoints).length === 0
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
 * The naming pattern used to create a Pub/Sub Topic or Scheduler Job ID for a given scheduled function.
 * This pattern is hard-coded and assumed throughout tooling, both in the Firebase Console and in the CLI.
 * For e.g., we automatically assume a schedule and topic with this name exists when we list functions and
 * see a label that it has an attached schedule. This saves us from making extra API calls.
 * DANGER: We use the pattern defined here to deploy and delete schedules,
 * and to display scheduled functions in the Firebase console
 * If you change this pattern, Firebase console will stop displaying schedule descriptions
 * and schedules created under the old pattern will no longer be cleaned up correctly
 */
export function scheduleIdForFunction(cloudFunction: TargetIds): string {
  return `firebase-schedule-${cloudFunction.id}-${cloudFunction.region}`;
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
  if (!context.loadedExistingBackend || forceRefresh) {
    await loadExistingBackend(context);
  }
  // loadExisting guarantees the validity of existingBackend and unreachableRegions
  return context.existingBackend!;
}

async function loadExistingBackend(ctx: Context): Promise<void> {
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
    const endpoint = gcf.endpointFromFunction(apiFunction);
    ctx.existingBackend.endpoints[endpoint.region] =
      ctx.existingBackend.endpoints[endpoint.region] || {};
    ctx.existingBackend.endpoints[endpoint.region][endpoint.id] = endpoint;
  }
  ctx.unreachableRegions.gcfV1 = gcfV1Results.unreachable;

  let gcfV2Results;
  try {
    gcfV2Results = await gcfV2.listAllFunctions(ctx.projectId);
    for (const apiFunction of gcfV2Results.functions) {
      const endpoint = gcfV2.endpointFromFunction(apiFunction);
      ctx.existingBackend.endpoints[endpoint.region] =
        ctx.existingBackend.endpoints[endpoint.region] || {};
      ctx.existingBackend.endpoints[endpoint.region][endpoint.id] = endpoint;
    }
    ctx.unreachableRegions.gcfV2 = gcfV2Results.unreachable;
  } catch (err: any) {
    if (err.status === 404 && err.message?.toLowerCase().includes("method not found")) {
      return; // customer has preview enabled without allowlist set
    }
    throw err;
  }
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
  if (!context.loadedExistingBackend) {
    await loadExistingBackend(context);
  }
  const gcfV1Regions = new Set();
  const gcfV2Regions = new Set();
  for (const ep of allEndpoints(want)) {
    if (ep.platform === "gcfv1") {
      gcfV1Regions.add(ep.region);
    } else {
      gcfV2Regions.add(ep.region);
    }
  }

  const neededUnreachableV1 = context.unreachableRegions?.gcfV1.filter((region) =>
    gcfV1Regions.has(region),
  );
  const neededUnreachableV2 = context.unreachableRegions?.gcfV2.filter((region) =>
    gcfV2Regions.has(region),
  );
  if (neededUnreachableV1?.length) {
    throw new FirebaseError(
      "The following Cloud Functions regions are currently unreachable:\n\t" +
        neededUnreachableV1.join("\n\t") +
        "\nThis deployment contains functions in those regions. Please try again in a few minutes, or exclude these regions from your deployment.",
    );
  }

  if (neededUnreachableV2?.length) {
    throw new FirebaseError(
      "The following Cloud Functions V2 regions are currently unreachable:\n\t" +
        neededUnreachableV2.join("\n\t") +
        "\nThis deployment contains functions in those regions. Please try again in a few minutes, or exclude these regions from your deployment.",
    );
  }

  if (context.unreachableRegions?.gcfV1.length) {
    utils.logLabeledWarning(
      "functions",
      "The following Cloud Functions regions are currently unreachable:\n" +
        context.unreachableRegions.gcfV1.join("\n") +
        "\nCloud Functions in these regions won't be deleted.",
    );
  }

  if (context.unreachableRegions?.gcfV2.length) {
    utils.logLabeledWarning(
      "functions",
      "The following Cloud Functions V2 regions are currently unreachable:\n" +
        context.unreachableRegions.gcfV2.join("\n") +
        "\nCloud Functions in these regions won't be deleted.",
    );
  }
}

/** A helper utility for flattening all endpoints in a backend since typing is a bit wonky. */
export function allEndpoints(backend: Backend): Endpoint[] {
  return Object.values(backend.endpoints).reduce((accum, perRegion) => {
    return [...accum, ...Object.values(perRegion)];
  }, [] as Endpoint[]);
}

/** A helper utility for checking whether an endpoint matches a predicate. */
export function someEndpoint(
  backend: Backend,
  predicate: (endpoint: Endpoint) => boolean,
): boolean {
  for (const endpoints of Object.values(backend.endpoints)) {
    if (Object.values<Endpoint>(endpoints).some(predicate)) {
      return true;
    }
  }
  return false;
}

/** A helper utility for finding an endpoint that matches the predicate. */
export function findEndpoint(
  backend: Backend,
  predicate: (endpoint: Endpoint) => boolean,
): Endpoint | undefined {
  for (const endpoints of Object.values(backend.endpoints)) {
    const endpoint = Object.values<Endpoint>(endpoints).find(predicate);
    if (endpoint) return endpoint;
  }
}

/** A helper utility function that returns a subset of the backend that includes only matching endpoints */
export function matchingBackend(
  backend: Backend,
  predicate: (endpoint: Endpoint) => boolean,
): Backend {
  const filtered: Backend = {
    ...backend,
    endpoints: {},
  };
  for (const endpoint of allEndpoints(backend)) {
    if (!predicate(endpoint)) {
      continue;
    }
    filtered.endpoints[endpoint.region] = filtered.endpoints[endpoint.region] || {};
    filtered.endpoints[endpoint.region][endpoint.id] = endpoint;
  }
  return filtered;
}

/** A helper utility for flattening all endpoints in a region since typing is a bit wonky. */
export function regionalEndpoints(backend: Backend, region: string): Endpoint[] {
  return backend.endpoints[region] ? Object.values<Endpoint>(backend.endpoints[region]) : [];
}

/** A curried function used for filters, returns a matcher for functions in a backend. */
export const hasEndpoint =
  (backend: Backend) =>
  (endpoint: Endpoint): boolean => {
    return (
      !!backend.endpoints[endpoint.region] && !!backend.endpoints[endpoint.region][endpoint.id]
    );
  };

/** A curried function that is the opposite of hasEndpoint */
export const missingEndpoint =
  (backend: Backend) =>
  (endpoint: Endpoint): boolean => {
    return !hasEndpoint(backend)(endpoint);
  };

/**
 * A standard method for sorting endpoints for display.
 * Future versions might consider sorting region by pricing tier before
 * alphabetically
 */
export function compareFunctions(
  left: TargetIds & { platform: FunctionsPlatform },
  right: TargetIds & { platform: FunctionsPlatform },
): number {
  if (left.platform !== right.platform) {
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
