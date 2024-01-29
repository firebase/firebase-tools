import * as backend from "./backend";
import * as proto from "../../gcp/proto";
import * as api from "../../.../../api";
import * as params from "./params";
import { FirebaseError } from "../../error";
import { assertExhaustive, mapObject, nullsafeVisitor } from "../../functional";
import { UserEnvsOpts, writeUserEnvs } from "../../functions/env";
import { FirebaseConfig } from "./args";
import { Runtime } from "./runtimes";
import { ExprParseError } from "./cel";

/* The union of a customer-controlled deployment and potentially deploy-time defined parameters */
export interface Build {
  requiredAPIs: RequiredApi[];
  endpoints: Record<string, Endpoint>;
  params: params.Param[];
  runtime?: Runtime;
}

/**
 *  A utility function that returns an empty Build.
 */
export function empty(): Build {
  return {
    requiredAPIs: [],
    endpoints: {},
    params: [],
  };
}

/**
 * A utility function that creates a Build containing a map of IDs to Endpoints
 */
export function of(endpoints: Record<string, Endpoint>): Build {
  const build = empty();
  build.endpoints = endpoints;
  return build;
}

export interface RequiredApi {
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
export type Expression<T extends string | number | boolean | string[]> = string; // eslint-disable-line
export type Field<T extends string | number | boolean> = T | Expression<T> | null;
export type ListField = Expression<string[]> | (string | Expression<string>)[] | null;

// A service account must either:
// 1. Be a project-relative email that ends with "@" (e.g. database-users@)
// 2. Be a well-known shorthand (e..g "public" and "private")
type ServiceAccount = string;

// Trigger definition for arbitrary HTTPS endpoints
export interface HttpsTrigger {
  // Which service account should be able to trigger this function. No value means "make public
  // on create and don't do anything on update." For more, see go/cf3-http-access-control
  invoker?: Array<ServiceAccount | Expression<ServiceAccount>> | null;
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
  eventFilters?: Record<string, string | Expression<string>>;
  eventFilterPathPatterns?: Record<string, string | Expression<string>>;

  // whether failed function executions should retry the event execution.
  // Retries are indefinite, so developers should be sure to add some end condition (e.g. event
  // age)
  retry: Field<boolean>;

  // Region of the EventArc trigger. Must be the same region or multi-region as the event
  // trigger or be us-central1. All first party triggers (all triggers as of Jan 2022) need not
  // specify this field because tooling determines the correct value automatically.
  // N.B. This is an Expression<string> not Field<string> because it cannot be reset
  // by setting to null
  region?: string | Expression<string>;

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
  maxRetrySeconds?: Field<number>;
  minBackoffSeconds?: Field<number>;
  maxBackoffSeconds?: Field<number>;
  maxDoublings?: Field<number>;
}

export interface TaskQueueTrigger {
  rateLimits?: TaskQueueRateLimits | null;
  retryConfig?: TaskQueueRetryConfig | null;

  // empty array means private
  invoker?: Array<ServiceAccount | Expression<ServiceAccount>> | null;
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
  timeZone?: Field<string>;
  retryConfig?: ScheduleRetryConfig | null;
}

export type HttpsTriggered = { httpsTrigger: HttpsTrigger };
export type CallableTriggered = { callableTrigger: CallableTrigger };
export type BlockingTriggered = { blockingTrigger: BlockingTrigger };
export type EventTriggered = { eventTrigger: EventTrigger };
export type ScheduleTriggered = { scheduleTrigger: ScheduleTrigger };
export type TaskQueueTriggered = { taskQueueTrigger: TaskQueueTrigger };
export type Triggered =
  | HttpsTriggered
  | CallableTriggered
  | BlockingTriggered
  | EventTriggered
  | ScheduleTriggered
  | TaskQueueTriggered;

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

export interface VpcSettings {
  connector: string | Expression<string>;
  egressSettings?: "PRIVATE_RANGES_ONLY" | "ALL_TRAFFIC" | null;
}

export interface SecretEnvVar {
  key: string; // The environment variable this secret is accessible at
  secret: string; // The id of the SecretVersion - ie for projects/myproject/secrets/mysecret, this is 'mysecret'
  projectId: string; // The project containing the Secret
}

export type MemoryOption = 128 | 256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384 | 32768;
const allMemoryOptions: MemoryOption[] = [128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
/**
 * Is a given number a valid MemoryOption?
 */
export function isValidMemoryOption(mem: unknown): mem is MemoryOption {
  return allMemoryOptions.includes(mem as MemoryOption);
}

export type FunctionsPlatform = backend.FunctionsPlatform;
export const AllFunctionsPlatforms: FunctionsPlatform[] = ["gcfv1", "gcfv2"];
export type VpcEgressSetting = backend.VpcEgressSettings;
export const AllVpcEgressSettings: VpcEgressSetting[] = ["PRIVATE_RANGES_ONLY", "ALL_TRAFFIC"];
export type IngressSetting = backend.IngressSettings;
export const AllIngressSettings: IngressSetting[] = [
  "ALLOW_ALL",
  "ALLOW_INTERNAL_ONLY",
  "ALLOW_INTERNAL_AND_GCLB",
];

export type Endpoint = Triggered & {
  // Defaults to false. If true, the function will be ignored during the deploy process.
  omit?: Field<boolean>;

  // Defaults to "gcfv2". "Run" will be an additional option defined later
  platform?: "gcfv1" | "gcfv2";

  // Necessary for the GCF API to determine what code to load with the Functions Framework.
  // Will become optional once "run" is supported as a platform
  entryPoint: string;

  // The services account that this function should run as.
  // defaults to the GAE service account when a function is first created as a GCF gen 1 function.
  // Defaults to the compute service account when a function is first created as a GCF gen 2 function.
  serviceAccount?: Field<string> | ServiceAccount | null;

  // defaults to ["us-central1"], overridable in firebase-tools with
  //  process.env.FIREBASE_FUNCTIONS_DEFAULT_REGION
  region?: ListField;

  // The Cloud project associated with this endpoint.
  project: string;

  // The runtime being deployed to this endpoint. Currently targeting "nodejs16."
  runtime: string;

  // Firebase default of 80. Cloud default of 1
  concurrency?: Field<number>;

  // Default of 256
  availableMemoryMb?: Field<number>;

  // Default of 1 for GCF 2nd gen;
  cpu?: Field<number>;

  // Default of 60
  timeoutSeconds?: Field<number>;

  // Default of 1000
  maxInstances?: Field<number>;

  // Default of 0
  minInstances?: Field<number>;

  vpc?: VpcSettings | null;
  ingressSettings?: "ALLOW_ALL" | "ALLOW_INTERNAL_ONLY" | "ALLOW_INTERNAL_AND_GCLB" | null;

  environmentVariables?: Record<string, string | Expression<string>> | null;
  secretEnvironmentVariables?: SecretEnvVar[] | null;
  labels?: Record<string, string | Expression<string>> | null;
};

/**
 * Resolves user-defined parameters inside a Build, and generates a Backend.
 * Returns both the Backend and the literal resolved values of any params, since
 * the latter also have to be uploaded so user code can see them in process.env
 */
export async function resolveBackend(
  build: Build,
  firebaseConfig: FirebaseConfig,
  userEnvOpt: UserEnvsOpts,
  userEnvs: Record<string, string>,
  nonInteractive?: boolean,
): Promise<{ backend: backend.Backend; envs: Record<string, params.ParamValue> }> {
  let paramValues: Record<string, params.ParamValue> = {};
  paramValues = await params.resolveParams(
    build.params,
    firebaseConfig,
    envWithTypes(build.params, userEnvs),
    nonInteractive,
  );

  const toWrite: Record<string, string> = {};
  for (const paramName of Object.keys(paramValues)) {
    const paramValue = paramValues[paramName];
    if (Object.prototype.hasOwnProperty.call(userEnvs, paramName) || paramValue.internal) {
      continue;
    }
    toWrite[paramName] = paramValue.toString();
  }
  writeUserEnvs(toWrite, userEnvOpt);

  return { backend: toBackend(build, paramValues), envs: paramValues };
}

function envWithTypes(
  definedParams: params.Param[],
  rawEnvs: Record<string, string>,
): Record<string, params.ParamValue> {
  const out: Record<string, params.ParamValue> = {};
  for (const envName of Object.keys(rawEnvs)) {
    const value = rawEnvs[envName];
    let providedType = {
      string: true,
      boolean: true,
      number: true,
      list: true,
    };
    for (const param of definedParams) {
      if (param.name === envName) {
        if (param.type === "string") {
          providedType = {
            string: true,
            boolean: false,
            number: false,
            list: false,
          };
        } else if (param.type === "int") {
          providedType = {
            string: false,
            boolean: false,
            number: true,
            list: false,
          };
        } else if (param.type === "boolean") {
          providedType = {
            string: false,
            boolean: true,
            number: false,
            list: false,
          };
        } else if (param.type === "list") {
          providedType = {
            string: false,
            boolean: false,
            number: false,
            list: true,
          };
        }
      }
    }
    out[envName] = new params.ParamValue(value, false, providedType);
  }
  return out;
}

// Utility class to make it more fluent to use proto.convertIfPresent
// The class usese const lambdas so it doesn't loose the this context when
// passing Resolver.resolveFoo as a proto.convertIfPresent arg.
// The class also recognizes that if the input is not null the output cannot be
// null.
class Resolver {
  constructor(private readonly paramValues: Record<string, params.ParamValue>) {}

  // NB: The (Extract<T, null> | number) says "If T can be null, the return value"
  // can be null. If we know input is not null, the return type is known to not
  // be null.
  readonly resolveInt = <T extends Field<number>>(i: T): Extract<T, null> | number => {
    if (i === null) {
      return i as Extract<T, null>;
    }
    return params.resolveInt(i, this.paramValues);
  };

  readonly resolveBoolean = <T extends Field<boolean>>(i: T): Extract<T, null> | boolean => {
    if (i === null) {
      return i as Extract<T, null>;
    }
    return params.resolveBoolean(i, this.paramValues);
  };

  readonly resolveString = <T extends Field<string>>(i: T): Extract<T, null> | string => {
    if (i === null) {
      return i as Extract<T, null>;
    }
    return params.resolveString(i, this.paramValues);
  };

  resolveStrings<Key extends string>(
    dest: { [K in Key]?: string | null },
    src: { [K in Key]?: Field<string> },
    ...keys: Key[]
  ): void {
    for (const key of keys) {
      const orig = src[key];
      if (typeof orig === "undefined") {
        continue;
      }
      dest[key] = orig === null ? null : params.resolveString(orig, this.paramValues);
    }
  }

  resolveInts<Key extends string>(
    dest: { [K in Key]?: number | null },
    src: { [K in Key]?: Field<number> },
    ...keys: Key[]
  ): void {
    for (const key of keys) {
      const orig = src[key];
      if (typeof orig === "undefined") {
        continue;
      }
      dest[key] = orig === null ? null : params.resolveInt(orig, this.paramValues);
    }
  }
}

/** Converts a build specification into a Backend representation, with all Params resolved and interpolated */
export function toBackend(
  build: Build,
  paramValues: Record<string, params.ParamValue>,
): backend.Backend {
  const r = new Resolver(paramValues);
  const bkEndpoints: Array<backend.Endpoint> = [];
  for (const endpointId of Object.keys(build.endpoints)) {
    const bdEndpoint = build.endpoints[endpointId];
    if (r.resolveBoolean(bdEndpoint.omit || false)) {
      continue;
    }

    let regions: string[] = [];
    if (!bdEndpoint.region) {
      regions = [api.functionsDefaultRegion];
    } else if (Array.isArray(bdEndpoint.region)) {
      regions = params.resolveList(bdEndpoint.region, paramValues);
    } else {
      // N.B. setting region via GlobalOptions only accepts a String param.
      // Therefore if we raise an exception by attempting to resolve a
      // List param, we try resolving a String param instead.
      try {
        regions = params.resolveList(bdEndpoint.region, paramValues);
      } catch (err: any) {
        if (err instanceof ExprParseError) {
          regions = [params.resolveString(bdEndpoint.region, paramValues)];
        } else {
          throw err;
        }
      }
    }
    for (const region of regions) {
      const trigger = discoverTrigger(bdEndpoint, region, r);

      if (typeof bdEndpoint.platform === "undefined") {
        throw new FirebaseError("platform can't be undefined");
      }
      const bkEndpoint: backend.Endpoint = {
        id: endpointId,
        project: bdEndpoint.project,
        region: region,
        entryPoint: bdEndpoint.entryPoint,
        platform: bdEndpoint.platform,
        runtime: bdEndpoint.runtime,
        ...trigger,
      };
      proto.copyIfPresent(
        bkEndpoint,
        bdEndpoint,
        "environmentVariables",
        "labels",
        "secretEnvironmentVariables",
      );

      proto.convertIfPresent(bkEndpoint, bdEndpoint, "ingressSettings", (from) => {
        if (from !== null && !backend.AllIngressSettings.includes(from)) {
          throw new FirebaseError(`Cannot set ingress settings to invalid value ${from}`);
        }
        return from;
      });
      proto.convertIfPresent(bkEndpoint, bdEndpoint, "availableMemoryMb", (from) => {
        const mem = r.resolveInt(from);
        if (mem !== null && !backend.isValidMemoryOption(mem)) {
          throw new FirebaseError(
            `Function memory (${mem}) must resolve to a supported value, if present: ${JSON.stringify(
              allMemoryOptions,
            )}`,
          );
        }
        return (mem as backend.MemoryOptions) || null;
      });

      r.resolveStrings(bkEndpoint, bdEndpoint, "serviceAccount");
      r.resolveInts(
        bkEndpoint,
        bdEndpoint,
        "timeoutSeconds",
        "maxInstances",
        "minInstances",
        "concurrency",
      );
      proto.convertIfPresent(
        bkEndpoint,
        bdEndpoint,
        "cpu",
        nullsafeVisitor((cpu) => (cpu === "gcf_gen1" ? cpu : r.resolveInt(cpu))),
      );
      if (bdEndpoint.vpc) {
        bdEndpoint.vpc.connector = params.resolveString(bdEndpoint.vpc.connector, paramValues);
        if (bdEndpoint.vpc.connector && !bdEndpoint.vpc.connector.includes("/")) {
          bdEndpoint.vpc.connector = `projects/${bdEndpoint.project}/locations/${region}/connectors/${bdEndpoint.vpc.connector}`;
        }

        bkEndpoint.vpc = { connector: bdEndpoint.vpc.connector };
        proto.copyIfPresent(bkEndpoint.vpc, bdEndpoint.vpc, "egressSettings");
      } else if (bdEndpoint.vpc === null) {
        bkEndpoint.vpc = null;
      }
      bkEndpoints.push(bkEndpoint);
    }
  }

  const bkend = backend.of(...bkEndpoints);
  bkend.requiredAPIs = build.requiredAPIs;
  return bkend;
}

function discoverTrigger(endpoint: Endpoint, region: string, r: Resolver): backend.Triggered {
  if (isHttpsTriggered(endpoint)) {
    const httpsTrigger: backend.HttpsTrigger = {};
    if (endpoint.httpsTrigger.invoker === null) {
      httpsTrigger.invoker = null;
    } else if (typeof endpoint.httpsTrigger.invoker !== "undefined") {
      httpsTrigger.invoker = endpoint.httpsTrigger.invoker.map(r.resolveString);
    }
    return { httpsTrigger };
  } else if (isCallableTriggered(endpoint)) {
    return { callableTrigger: {} };
  } else if (isBlockingTriggered(endpoint)) {
    return { blockingTrigger: endpoint.blockingTrigger };
  } else if (isEventTriggered(endpoint)) {
    const eventTrigger: backend.EventTrigger = {
      eventType: endpoint.eventTrigger.eventType,
      retry: r.resolveBoolean(endpoint.eventTrigger.retry) || false,
    };
    if (endpoint.eventTrigger.eventFilters) {
      eventTrigger.eventFilters = mapObject(endpoint.eventTrigger.eventFilters, r.resolveString);
    }
    if (endpoint.eventTrigger.eventFilterPathPatterns) {
      eventTrigger.eventFilterPathPatterns = mapObject(
        endpoint.eventTrigger.eventFilterPathPatterns,
        r.resolveString,
      );
    }
    r.resolveStrings(eventTrigger, endpoint.eventTrigger, "serviceAccount", "region", "channel");
    return { eventTrigger };
  } else if (isScheduleTriggered(endpoint)) {
    const bkSchedule: backend.ScheduleTrigger = {
      schedule: r.resolveString(endpoint.scheduleTrigger.schedule),
    };
    if (endpoint.scheduleTrigger.timeZone !== undefined) {
      bkSchedule.timeZone = r.resolveString(endpoint.scheduleTrigger.timeZone);
    }
    if (endpoint.scheduleTrigger.retryConfig) {
      const bkRetry: backend.ScheduleRetryConfig = {};
      r.resolveInts(
        bkRetry,
        endpoint.scheduleTrigger.retryConfig,
        "maxBackoffSeconds",
        "minBackoffSeconds",
        "maxRetrySeconds",
        "retryCount",
        "maxDoublings",
      );
      bkSchedule.retryConfig = bkRetry;
    } else if (endpoint.scheduleTrigger.retryConfig === null) {
      bkSchedule.retryConfig = null;
    }
    return { scheduleTrigger: bkSchedule };
  } else if ("taskQueueTrigger" in endpoint) {
    const taskQueueTrigger: backend.TaskQueueTrigger = {};
    if (endpoint.taskQueueTrigger.rateLimits) {
      taskQueueTrigger.rateLimits = {};
      r.resolveInts(
        taskQueueTrigger.rateLimits,
        endpoint.taskQueueTrigger.rateLimits,
        "maxConcurrentDispatches",
        "maxDispatchesPerSecond",
      );
    } else if (endpoint.taskQueueTrigger.rateLimits === null) {
      taskQueueTrigger.rateLimits = null;
    }
    if (endpoint.taskQueueTrigger.retryConfig) {
      taskQueueTrigger.retryConfig = {};
      r.resolveInts(
        taskQueueTrigger.retryConfig,
        endpoint.taskQueueTrigger.retryConfig,
        "maxAttempts",
        "maxBackoffSeconds",
        "minBackoffSeconds",
        "maxRetrySeconds",
        "maxDoublings",
      );
    } else if (endpoint.taskQueueTrigger.retryConfig === null) {
      taskQueueTrigger.retryConfig = null;
    }
    if (endpoint.taskQueueTrigger.invoker) {
      taskQueueTrigger.invoker = endpoint.taskQueueTrigger.invoker.map(r.resolveString);
    } else if (endpoint.taskQueueTrigger.invoker === null) {
      taskQueueTrigger.invoker = null;
    }
    return { taskQueueTrigger };
  }
  assertExhaustive(endpoint);
}
