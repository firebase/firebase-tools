import * as backend from "./backend";
import * as proto from "../../gcp/proto";
import * as api from "../../.../../api";
import * as params from "./params";
import { previews } from "../../previews";
import { FirebaseError } from "../../error";
import { assertExhaustive } from "../../functional";
import { UserEnvsOpts } from "../../functions/env";

/* The union of a customer-controlled deployment and potentially deploy-time defined parameters */
export interface Build {
  requiredAPIs: RequiredApi[];
  endpoints: Record<string, Endpoint>;
  params: params.Param[];
}

/* A utility function that returns an empty Build. */
/**
 *
 */
export function empty(): Build {
  return {
    requiredAPIs: [],
    endpoints: {},
    params: [],
  };
}

/* A utility function that creates a Build containing a map of IDs to Endpoints. */
/**
 *
 */
export function of(endpoints: Record<string, Endpoint>): Build {
  const build = empty();
  build.endpoints = endpoints;
  return build;
}

interface RequiredApi {
  // The API that should be enabled. For Google APIs, this should be a googleapis.com subdomain
  // (e.g. vision.googleapis.com)
  api: string;

  // A reason why this codebase requires this API.
  // Will be considered required for all Extensions codebases. Considered optional for Functions
  // codebases.
  reason?: string;
}

// Defining a StringParam with { param: "FOO" } declares that "{{ params.FOO }}" is a valid
// Expression<string> elsewhere.
// Expression<number> is always an int. Float Params, list params, and secret params cannot be used in
// expressions.
// `Expression<Foo> == Expression<Foo>` is an Expression<boolean>
// `Expression<boolean> ? Expression<T> : Expression<T>` is an Expression<T>
export type Expression<T extends string | number | boolean> = string; // eslint-disable-line
export type Field<T extends string | number | boolean> = T | Expression<T> | null;

// A service account must either:
// 1. Be a project-relative email that ends with "@" (e.g. database-users@)
// 2. Be a well-known shorthand (e..g "public" and "private")
type ServiceAccount = string;

// Trigger definition for arbitrary HTTPS endpoints
export interface HttpsTrigger {
  // Which service account should be able to trigger this function. No value means "make public
  // on create and don't do anything on update." For more, see go/cf3-http-access-control
  invoker?: ServiceAccount[];
}

// Trigger definitions for RPCs servers using the HTTP protocol defined at
// https://firebase.google.com/docs/functions/callable-reference
// eslint-disable-next-line
interface CallableTrigger { }

// Trigger definitions for endpoints that should be called as a delegate for other operations.
// For example, before user login.
export interface BlockingTrigger {
  eventType: string;
  options?: Record<string, unknown>;
}

// Trigger definitions for endpoints that listen to CloudEvents emitted by other systems (or legacy
// Google events for GCF gen 1)
export interface EventTrigger {
  eventType: string;
  eventFilters: Record<string, Expression<string>>;
  eventFilterPathPatterns?: Record<string, Expression<string>>;

  // whether failed function executions should retry the event execution.
  // Retries are indefinite, so developers should be sure to add some end condition (e.g. event
  // age)
  retry: Field<boolean>;

  // Region of the EventArc trigger. Must be the same region or multi-region as the event
  // trigger or be us-central1. All first party triggers (all triggers as of Jan 2022) need not
  // specify this field because tooling determines the correct value automatically.
  region?: Field<string>;

  // The service account that EventArc should use to invoke this function. Setting this field
  // requires the EventArc P4SA to be granted the "ActAs" permission to this service account and
  // will cause the "invoker" role to be granted to this service account on the endpoint
  // (Function or Route)
  serviceAccount?: ServiceAccount | null;

  // The name of the channel where the function receives events.
  // Must be provided to receive CF3v2 custom events.
  channel?: string;
}

export interface TaskQueueRateLimits {
  maxConcurrentDispatches?: Field<number>;
  maxDispatchesPerSecond?: Field<number>;
}

export interface TaskQueueRetryConfig {
  maxAttempts?: Field<number>;
  maxRetryDurationSeconds?: Field<number>;
  minBackoffSeconds?: Field<number>;
  maxBackoffSeconds?: Field<number>;
  maxDoublings?: Field<number>;
}

export interface TaskQueueTrigger {
  rateLimits?: TaskQueueRateLimits | null;
  retryConfig?: TaskQueueRetryConfig | null;

  // empty array means private
  invoker?: Array<ServiceAccount | Expression<string>> | null;
}

export interface ScheduleRetryConfig {
  retryCount?: Field<number>;
  maxRetrySeconds?: Field<number>;
  minBackoffSeconds?: Field<number>;
  maxBackoffSeconds?: Field<number>;
  maxDoublings?: Field<number>;
}

export interface ScheduleTrigger {
  schedule: string | Expression<string>;
  timeZone: string | Expression<string>;
  retryConfig: ScheduleRetryConfig;
}

export type Triggered =
  | { httpsTrigger: HttpsTrigger }
  | { callableTrigger: CallableTrigger }
  | { blockingTrigger: BlockingTrigger }
  | { eventTrigger: EventTrigger }
  | { scheduleTrigger: ScheduleTrigger }
  | { taskQueueTrigger: TaskQueueTrigger };

export interface VpcSettings {
  connector: string | Expression<string>;
  egressSettings?: "PRIVATE_RANGES_ONLY" | "ALL_TRAFFIC";
}

export interface SecretEnvVar {
  key: string; // The environment variable this secret is accessible at
  secret: string; // The id of the SecretVersion - ie for projects/myproject/secrets/mysecret, this is 'mysecret'
  projectId: string; // The project containing the Secret
}

export type Endpoint = Triggered & {
  // Defaults to "gcfv2". "Run" will be an additional option defined later
  platform?: "gcfv1" | "gcfv2";

  // Necessary for the GCF API to determine what code to load with the Functions Framework.
  // Will become optional once "run" is supported as a platform
  entryPoint: string;

  // The services account that this function should run as. Has no effect for a Run service.
  // defaults to the GAE service account when a function is first created as a GCF gen 1 function.
  // Defaults to the compute service account when a function is first created as a GCF gen 2 function
  // or when using Cloud Run.
  serviceAccount: ServiceAccount | null;

  // defaults to ["us-central1"], overridable in firebase-tools with
  //  process.env.FIREBASE_FUNCTIONS_DEFAULT_REGION
  region?: string[];

  // The Cloud project associated with this endpoint.
  project: string;

  // The runtime being deployed to this endpoint. Currently targeting "nodejs16."
  runtime: string;

  // Firebase default of 80. Cloud default of 1
  concurrency?: Field<number>;

  // Default of 256
  availableMemoryMb?: Field<number>;

  // Default of 60
  timeoutSeconds?: Field<number>;

  // Default of 1000
  maxInstances?: Field<number>;

  // Default of 0
  minInstances?: Field<number>;

  vpc?: VpcSettings | null;
  ingressSettings?: "ALLOW_ALL" | "ALLOW_INTERNAL_ONLY" | "ALLOW_INTERNAL_AND_GCLB" | null;

  environmentVariables?: Record<string, string | Expression<string>>;
  secretEnvironmentVariables?: SecretEnvVar[];
  labels?: Record<string, string | Expression<string>>;
};

function isMemoryOption(value: backend.MemoryOptions | any): value is backend.MemoryOptions {
  return value == null || [128, 256, 512, 1024, 2048, 4096, 8192].includes(value);
}

/**
 *  Resolves user-defined parameters inside a Build, and returns a Backend ready for upload to the API
 */
export async function resolveBackend(
  build: Build,
  userEnvOpt: UserEnvsOpts,
  userEnvs: Record<string, string>
): Promise<backend.Backend> {
  const projectId = userEnvOpt.projectId;
  let paramValues: Record<string, Field<string | number | boolean>> = {};
  if (previews.functionsparams) {
    paramValues = await params.resolveParams(build.params, projectId, userEnvs);
  }

  return toBackend(build, paramValues);
}

/** Converts a build specification into a Backend representation, with all Params resolved and interpolated */
// TODO(vsfan): handle Expression<T> types
export function toBackend(
  build: Build,
  paramValues: Record<string, Field<string | number | boolean>>
): backend.Backend {
  const bkEndpoints: Array<backend.Endpoint> = [];
  for (const endpointId of Object.keys(build.endpoints)) {
    const bdEndpoint = build.endpoints[endpointId];

    let regions = bdEndpoint.region;
    if (typeof regions === "undefined") {
      regions = [api.functionsDefaultRegion];
    }
    for (const region of regions) {
      const trigger = discoverTrigger(bdEndpoint, paramValues);

      if (typeof bdEndpoint.platform === "undefined") {
        throw new FirebaseError("platform can't be undefined");
      }
      if (!isMemoryOption(bdEndpoint.availableMemoryMb)) {
        throw new FirebaseError("available memory must be a supported value, if present");
      }
      let timeout: number;
      if (bdEndpoint.timeoutSeconds) {
        timeout = params.resolveInt(bdEndpoint.timeoutSeconds, paramValues);
      } else {
        timeout = 60;
      }

      const bkEndpoint: backend.Endpoint = {
        id: endpointId,
        project: bdEndpoint.project,
        region: region,
        entryPoint: bdEndpoint.entryPoint,
        platform: bdEndpoint.platform,
        runtime: bdEndpoint.runtime,
        timeoutSeconds: timeout,
        ...trigger,
      };
      proto.renameIfPresent(
        bkEndpoint,
        bdEndpoint,
        "maxInstances",
        "maxInstances",
        (from: number | Expression<number>): number => {
          return params.resolveInt(from, paramValues);
        }
      );
      proto.renameIfPresent(
        bkEndpoint,
        bdEndpoint,
        "minInstances",
        "minInstances",
        (from: number | Expression<number>): number => {
          return params.resolveInt(from, paramValues);
        }
      );
      proto.renameIfPresent(
        bkEndpoint,
        bdEndpoint,
        "concurrency",
        "concurrency",
        (from: number | Expression<number>): number => {
          return params.resolveInt(from, paramValues);
        }
      );
      proto.copyIfPresent(
        bkEndpoint,
        bdEndpoint,
        "ingressSettings",
        "availableMemoryMb",
        "environmentVariables",
        "labels"
      );
      proto.copyIfPresent(bkEndpoint, bdEndpoint, "secretEnvironmentVariables");
      if (bdEndpoint.vpc) {
        bkEndpoint.vpc = { connector: params.resolveString(bdEndpoint.vpc.connector, paramValues) };
        proto.copyIfPresent(bkEndpoint.vpc, bdEndpoint.vpc, "egressSettings");
      }
      proto.renameIfPresent(bkEndpoint, bdEndpoint, "serviceAccountEmail", "serviceAccount");
      // TODO: renameIfPresent currently copies over null fields, which will change imminently. Once that change is in, we don't need this cleanup code anymore to make tests pass.
      if ("serviceAccountEmail" in bkEndpoint && !bdEndpoint.serviceAccount) {
        delete bkEndpoint.serviceAccountEmail;
      }

      bkEndpoints.push(bkEndpoint);
    }
  }

  const bkend = backend.of(...bkEndpoints);
  bkend.requiredAPIs = build.requiredAPIs;
  return bkend;
}

function discoverTrigger(
  endpoint: Endpoint,
  paramValues: Record<string, Field<string | number | boolean>>
): backend.Triggered {
  const resolveInt = (from: number | Expression<number>) => params.resolveInt(from, paramValues);
  const resolveString = (from: string | Expression<string>) =>
    params.resolveString(from, paramValues);
  const resolveBoolean = (from: boolean | Expression<boolean>) =>
    params.resolveBoolean(from, paramValues);

  let trigger: backend.Triggered;
  if ("httpsTrigger" in endpoint) {
    const bkHttps: backend.HttpsTrigger = {};
    if (endpoint.httpsTrigger.invoker) {
      bkHttps.invoker = endpoint.httpsTrigger.invoker;
    }
    trigger = { httpsTrigger: bkHttps };
  } else if ("callableTrigger" in endpoint) {
    trigger = { callableTrigger: {} };
  } else if ("blockingTrigger" in endpoint) {
    trigger = { blockingTrigger: endpoint.blockingTrigger };
  } else if ("eventTrigger" in endpoint) {
    const bkEventFilters: Record<string, string> = {};
    for (const [key, value] of Object.entries(endpoint.eventTrigger.eventFilters)) {
      bkEventFilters[key] = params.resolveString(value, paramValues);
    }
    const bkEvent: backend.EventTrigger = {
      eventType: endpoint.eventTrigger.eventType,
      eventFilters: bkEventFilters,
      retry: resolveBoolean(endpoint.eventTrigger.retry || false),
    };
    if (endpoint.eventTrigger.eventFilterPathPatterns) {
      const bkEventFiltersPathPatterns: Record<string, string> = {};
      for (const [key, value] of Object.entries(endpoint.eventTrigger.eventFilterPathPatterns)) {
        bkEventFiltersPathPatterns[key] = params.resolveString(value, paramValues);
      }
      bkEvent.eventFilterPathPatterns = bkEventFiltersPathPatterns;
    }
    if (endpoint.eventTrigger.serviceAccount) {
      bkEvent.serviceAccountEmail = endpoint.eventTrigger.serviceAccount;
    }
    if (endpoint.eventTrigger.region) {
      bkEvent.region = resolveString(endpoint.eventTrigger.region);
    }
    if (endpoint.eventTrigger.channel) {
      bkEvent.channel = endpoint.eventTrigger.channel;
    }
    trigger = { eventTrigger: bkEvent };
  } else if ("scheduleTrigger" in endpoint) {
    const bkSchedule: backend.ScheduleTrigger = {
      schedule: resolveString(endpoint.scheduleTrigger.schedule),
      timeZone: resolveString(endpoint.scheduleTrigger.timeZone),
    };
    const bkRetry: backend.ScheduleRetryConfig = {};
    if (endpoint.scheduleTrigger.retryConfig.maxBackoffSeconds) {
      bkRetry.maxBackoffDuration = proto.durationFromSeconds(
        resolveInt(endpoint.scheduleTrigger.retryConfig.maxBackoffSeconds)
      );
    }
    if (endpoint.scheduleTrigger.retryConfig.minBackoffSeconds) {
      bkRetry.minBackoffDuration = proto.durationFromSeconds(
        resolveInt(endpoint.scheduleTrigger.retryConfig.minBackoffSeconds)
      );
    }
    if (endpoint.scheduleTrigger.retryConfig.maxRetrySeconds) {
      bkRetry.maxRetryDuration = proto.durationFromSeconds(
        resolveInt(endpoint.scheduleTrigger.retryConfig.maxRetrySeconds)
      );
    }
    proto.copyIfPresent(
      bkRetry,
      endpoint.scheduleTrigger.retryConfig,
      "retryCount",
      "maxDoublings"
    );
    bkSchedule.retryConfig = bkRetry;
    trigger = { scheduleTrigger: bkSchedule };
  } else if ("taskQueueTrigger" in endpoint) {
    const bkTaskQueue: backend.TaskQueueTrigger = {};
    if (endpoint.taskQueueTrigger.rateLimits) {
      const bkRateLimits: backend.TaskQueueRateLimits = {};
      proto.renameIfPresent(
        bkRateLimits,
        endpoint.taskQueueTrigger.rateLimits,
        "maxConcurrentDispatches",
        "maxConcurrentDispatches",
        resolveInt
      );
      proto.renameIfPresent(
        bkRateLimits,
        endpoint.taskQueueTrigger.rateLimits,
        "maxDispatchesPerSecond",
        "maxDispatchesPerSecond",
        resolveInt
      );
      bkTaskQueue.rateLimits = bkRateLimits;
    }
    if (endpoint.taskQueueTrigger.retryConfig) {
      const bkRetryConfig: backend.TaskQueueRetryConfig = {};
      proto.renameIfPresent(
        bkRetryConfig,
        endpoint.taskQueueTrigger.retryConfig,
        "maxAttempts",
        "maxAttempts",
        resolveInt
      );
      proto.renameIfPresent(
        bkRetryConfig,
        endpoint.taskQueueTrigger.retryConfig,
        "maxBackoffSeconds",
        "maxBackoffSeconds",
        (from: number | Expression<number>): string => {
          return proto.durationFromSeconds(resolveInt(from));
        }
      );
      proto.renameIfPresent(
        bkRetryConfig,
        endpoint.taskQueueTrigger.retryConfig,
        "minBackoffSeconds",
        "minBackoffSeconds",
        (from: number | Expression<number>): string => {
          return proto.durationFromSeconds(resolveInt(from));
        }
      );
      proto.renameIfPresent(
        bkRetryConfig,
        endpoint.taskQueueTrigger.retryConfig,
        "maxRetrySeconds",
        "maxRetryDurationSeconds",
        (from: number | Expression<number>): string => {
          return proto.durationFromSeconds(resolveInt(from));
        }
      );
      proto.renameIfPresent(
        bkRetryConfig,
        endpoint.taskQueueTrigger.retryConfig,
        "maxDoublings",
        "maxDoublings",
        resolveInt
      );
      bkTaskQueue.retryConfig = bkRetryConfig;
    }
    if (endpoint.taskQueueTrigger.invoker) {
      bkTaskQueue.invoker = endpoint.taskQueueTrigger.invoker.map((sa) => resolveString(sa));
    }
    trigger = { taskQueueTrigger: bkTaskQueue };
  } else {
    assertExhaustive(endpoint);
  }
  return trigger;
}
