import * as backend from "./backend";
import * as proto from "../../gcp/proto";
import { FirebaseError } from "../../error";

/* The union of a customer-controlled deployment and potentially deploy-time defined parameters */
export interface Build {
  requiredAPIs: RequiredApi[];
  endpoints: Record<string, Endpoint>;
  params: Param[];
}

interface RequiredApi {
  // The API that should be enabled. For Google APIs, this should be a googleapis.com subdomain
  // (e.g. vision.googleapis.com)
  apiName: string;

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
type Expression<T extends string | number | boolean> = string;

function resolveInt(from: number | Expression<number> | null): number {
  if (from == null) {
    return 0;
  } else if (typeof from === "string") {
    throw new FirebaseError("CEL evaluation of expression '" + from + "' not yet supported");
  }
  return from;
}

function resolveString(from: string | Expression<string> | null): string {
  if (from == null) {
    return "";
  }
  return from;
}

function resolveBoolean(from: boolean | Expression<boolean> | null): boolean {
  if (from == null) {
    return false;
  } else if (typeof from === "string") {
    throw new FirebaseError("CEL evaluation of expression '" + from + "' not yet supported");
  }
  return from;
}

// A service account must either:
// 1. Be a project-relative email that ends with "@" (e.g. database-users@)
// 2. Be a well-known shorthand (e..g "public" and "private")
type ServiceAccount = string;

// Trigger definition for arbitrary HTTPS endpoints
interface HttpsTrigger {
  // Which service account should be able to trigger this function. No value means "make public
  // on create and don't do anything on update." For more, see go/cf3-http-access-control
  invoker?: ServiceAccount | null;
}

// Trigger definitions for RPCs servers using the HTTP protocol defined at
// https://firebase.google.com/docs/functions/callable-reference
// eslint-disable-next-line
interface CallableTrigger { }

// Trigger definitions for endpoints that should be called as a delegate for other operations.
// For example, before user login.
interface BlockingTrigger {
  eventType: string;
}

// Trigger definitions for endpoints that listen to CloudEvents emitted by other systems (or legacy
// Google events for GCF gen 1)
interface EventTrigger {
  eventType: string;
  eventFilters: Record<string, Expression<string>>;

  // whether failed function executions should retry the event execution.
  // Retries are indefinite, so developers should be sure to add some end condition (e.g. event
  // age)
  retry: boolean | Expression<boolean> | null;

  // Region of the EventArc trigger. Must be the same region or multi-region as the event
  // trigger or be us-central1. All first party triggers (all triggers as of Jan 2022) need not
  // specify this field because tooling determines the correct value automatically.
  region?: string | Expression<string>;

  // The service account that EventArc should use to invoke this function. Setting this field
  // requires the EventArc P4SA to be granted the "ActAs" permission to this service account and
  // will cause the "invoker" role to be granted to this service account on the endpoint
  // (Function or Route)
  serviceAccount?: ServiceAccount | null;
}

interface TaskQueueRateLimits {
  maxConcurrentDispatches?: number | Expression<number> | null;
  maxDispatchesPerSecond?: number | Expression<number> | null;
}

interface TaskQueueRetryConfig {
  maxAttempts?: number | Expression<number> | null;
  maxRetryDurationSeconds: number | Expression<number> | null;
  minBackoffSeconds?: number | Expression<number> | null;
  maxBackoffSeconds?: number | Expression<number> | null;
  maxDoublings?: number | Expression<number> | null;
}

interface TaskQueueTrigger {
  rateLimits?: TaskQueueRateLimits | null;
  retryConfig?: TaskQueueRetryConfig | null;

  // empty array means private
  invoker?: Array<ServiceAccount | Expression<string>> | null;
}

interface ScheduleRetryConfig {
  retryCount?: number | Expression<number> | null;
  maxRetrySeconds?: number | Expression<number> | null;
  minBackoffSeconds?: number | Expression<number> | null;
  maxBackoffSeconds?: number | Expression<number> | null;
  maxDoublings?: number | Expression<number> | null;
}

interface ScheduleTrigger {
  schedule: string | Expression<string>;
  timeZone: string;
  retryConfig: ScheduleRetryConfig;
}

type Triggered =
  | { httpsTrigger: HttpsTrigger }
  | { callableTrigger: CallableTrigger }
  | { blockingTrigger: BlockingTrigger }
  | { eventTrigger: EventTrigger }
  | { scheduleTrigger: ScheduleTrigger }
  | { taskQueueTrigger: TaskQueueTrigger };

interface VpcSettings {
  connector: string | Expression<string>;
  egressSettings?: "PRIVATE_RANGES_ONLY" | "ALL_TRAFFIC";
}

type Endpoint = Triggered & {
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

  // Firebase default of 80. Cloud default of 1
  concurrency?: number | Expression<number> | null;

  // Default of 256
  availableMemoryMb?: number | Expression<number> | null;

  // Default of 60
  timeoutSeconds?: number | Expression<number> | null;

  // Default of 1000
  maxInstances?: number | Expression<number> | null;

  // Default of 0
  minInstances?: number | Expression<number> | null;

  vpc?: VpcSettings | null;
  ingressSettings?: "ALLOW_ALL" | "ALLOW_INTERNAL_ONLY" | "ALLOW_INTERNAL_AND_GCLB" | null;

  environmentVariables?: Record<string, string | Expression<string>>;
  labels?: Record<string, string | Expression<string>>;
};

interface ParamBase<T extends string | number | boolean> {
  // name of the param. Will be exposed as an environment variable with this name
  param: string;

  // A human friendly name for the param. Will be used in install/configure flows to describe
  // what param is being updated. If omitted, UX will use the value of "param" instead.
  label?: string;

  // A long description of the parameter's purpose and allowed values. If omitted, UX will not
  // provide a description of the parameter
  description?: string;

  // Default value. If not provided, a param must be supplied.
  default?: T | Expression<T>;

  // default: false
  immutable?: boolean;
}

interface StringParam extends ParamBase<string> {
  type?: "string";
}

type Param = StringParam;

function isMemoryOption(value: backend.MemoryOptions | any): value is backend.MemoryOptions {
  return value == null || [128, 256, 512, 1024, 2048, 4096, 8192].includes(value);
}

/** Converts a build specification into a Backend representation, with all Params resolved and interpolated */
// TODO(vsfan): resolve build.Params
// TODO(vsfan): handle Expression<T> types
export function discoverParams(build: Build): backend.Backend {
  const bkEndpoints: Array<backend.Endpoint> = [];
  for (const endpointId of Object.keys(build.endpoints)) {
    const endpoint = build.endpoints[endpointId];

    let regions = endpoint.region;
    if (typeof regions === "undefined") {
      regions = ["functionsDefaultRegion"];
    }
    for (const region of regions) {
      const trigger = discoverTrigger(endpoint);

      if (typeof endpoint.platform === "undefined") {
        throw new FirebaseError("platform can't be undefined");
      }
      if (!isMemoryOption(endpoint.availableMemoryMb)) {
        throw new FirebaseError("available memory must be a supported value, if present");
      }
      let timeout: number;
      if (endpoint.timeoutSeconds) {
        timeout = resolveInt(endpoint.timeoutSeconds);
      } else {
        timeout = 60;
      }

      const bkEndpoint: backend.Endpoint = {
        id: endpointId,
        project: "",
        region: region,
        entryPoint: endpoint.entryPoint,
        platform: endpoint.platform,
        runtime: "",
        labels: endpoint.labels,
        environmentVariables: endpoint.environmentVariables,
        secretEnvironmentVariables: undefined,
        availableMemoryMb: endpoint.availableMemoryMb,
        timeout: proto.durationFromSeconds(timeout),
        ...trigger,
      };
      proto.renameIfPresent(bkEndpoint, endpoint, "maxInstances", "maxInstances", resolveInt);
      proto.renameIfPresent(bkEndpoint, endpoint, "minInstances", "minInstances", resolveInt);
      proto.renameIfPresent(bkEndpoint, endpoint, "concurrency", "concurrency", resolveInt);
      proto.renameIfPresent(
        bkEndpoint,
        endpoint,
        "timeout",
        "timeoutSeconds",
        (from: number | Expression<number> | null): string => {
          return proto.durationFromSeconds(resolveInt(from));
        }
      );
      if (endpoint.vpc) {
        bkEndpoint.vpc = {
          connector: endpoint.vpc.connector,
          egressSettings: endpoint.vpc.egressSettings,
        };
      }
      if (endpoint.ingressSettings) {
        bkEndpoint.ingressSettings = endpoint.ingressSettings;
      }
      if (endpoint.serviceAccount) {
        bkEndpoint.serviceAccountEmail = endpoint.serviceAccount;
      } else {
        bkEndpoint.serviceAccountEmail = "default";
      }

      bkEndpoints.push(bkEndpoint);
    }
  }

  const bkend = backend.of(...bkEndpoints);
  for (const requiredAPI of build.requiredAPIs) {
    bkend.requiredAPIs.push({
      reason: requiredAPI.reason,
      api: requiredAPI.apiName,
    });
  }
  return bkend;
}

function discoverTrigger(endpoint: Endpoint): backend.Triggered {
  let trigger: backend.Triggered;
  if ("httpsTrigger" in endpoint) {
    const bkHttps: backend.HttpsTrigger = {};
    if (endpoint.httpsTrigger.invoker) {
      bkHttps.invoker = [endpoint.httpsTrigger.invoker];
    }
    trigger = { httpsTrigger: bkHttps };
  } else if ("callableTrigger" in endpoint) {
    trigger = { callableTrigger: {} };
  } else if ("blockingTrigger" in endpoint) {
    throw new FirebaseError("blocking triggers not supported");
  } else if ("eventTrigger" in endpoint) {
    const bkEvent: backend.EventTrigger = {
      eventType: endpoint.eventTrigger.eventType,
      eventFilters: [],
      retry: resolveBoolean(endpoint.eventTrigger.retry),
    };
    for (const filterAttr in endpoint.eventTrigger.eventFilters) {
      if ({}.hasOwnProperty.call(endpoint.eventTrigger.eventFilters, filterAttr)) {
        const filterValue = resolveString(endpoint.eventTrigger.eventFilters[filterAttr]);
        bkEvent.eventFilters.push({ attribute: filterAttr, value: filterValue });
      }
    }
    if (endpoint.eventTrigger.serviceAccount) {
      bkEvent.serviceAccountEmail = endpoint.eventTrigger.serviceAccount;
    }
    if (endpoint.eventTrigger.region) {
      bkEvent.region = resolveString(endpoint.eventTrigger.region);
    }
    trigger = { eventTrigger: bkEvent };
  } else if ("scheduleTrigger" in endpoint) {
    const bkSchedule: backend.ScheduleTrigger = {
      schedule: endpoint.scheduleTrigger.schedule,
      timeZone: endpoint.scheduleTrigger.timeZone,
    };
    proto.renameIfPresent(
      bkSchedule,
      endpoint.scheduleTrigger,
      "retryConfig",
      "retryConfig",
      resolveInt
    );
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
        "maxBackoff",
        "maxBackoffSeconds",
        (from: number | Expression<number> | null): string => {
          return proto.durationFromSeconds(resolveInt(from));
        }
      );
      proto.renameIfPresent(
        bkRetryConfig,
        endpoint.taskQueueTrigger.retryConfig,
        "minBackoff",
        "minBackoffSeconds",
        (from: number | Expression<number> | null): string => {
          return proto.durationFromSeconds(resolveInt(from));
        }
      );
      proto.renameIfPresent(
        bkRetryConfig,
        endpoint.taskQueueTrigger.retryConfig,
        "maxRetryDuration",
        "maxRetryDurationSeconds",
        (from: number | Expression<number> | null): string => {
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
    throw new FirebaseError("unknown trigger type");
  }
  return trigger;
}
