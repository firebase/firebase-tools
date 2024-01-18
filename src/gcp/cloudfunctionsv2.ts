import { Client, ClientVerbOptions } from "../apiv2";
import { FirebaseError } from "../error";
import { functionsV2Origin } from "../api";
import { logger } from "../logger";
import { AUTH_BLOCKING_EVENTS } from "../functions/events/v1";
import { PUBSUB_PUBLISH_EVENT } from "../functions/events/v2";
import * as backend from "../deploy/functions/backend";
import * as runtimes from "../deploy/functions/runtimes";
import * as proto from "./proto";
import * as utils from "../utils";
import * as projectConfig from "../functions/projectConfig";
import {
  BLOCKING_EVENT_TO_LABEL_KEY,
  BLOCKING_LABEL,
  BLOCKING_LABEL_KEY_TO_EVENT,
  CODEBASE_LABEL,
  HASH_LABEL,
} from "../functions/constants";
import { RequireKeys } from "../metaprogramming";

export const API_VERSION = "v2";

// Defined by Cloud Run: https://cloud.google.com/run/docs/configuring/max-instances#setting
const DEFAULT_MAX_INSTANCE_COUNT = 100;

const client = new Client({
  urlPrefix: functionsV2Origin,
  auth: true,
  apiVersion: API_VERSION,
});

export type VpcConnectorEgressSettings = "PRIVATE_RANGES_ONLY" | "ALL_TRAFFIC";
export type IngressSettings = "ALLOW_ALL" | "ALLOW_INTERNAL_ONLY" | "ALLOW_INTERNAL_AND_GCLB";
export type FunctionState = "ACTIVE" | "FAILED" | "DEPLOYING" | "DELETING" | "UNKONWN";

// Values allowed for the operator field in EventFilter
export type EventFilterOperator = "match-path-pattern";

// Values allowed for the event trigger retry policy in case of a function's execution failure.
export type RetryPolicy =
  | "RETRY_POLICY_UNSPECIFIED"
  | "RETRY_POLICY_DO_NOT_RETRY"
  | "RETRY_POLICY_RETRY";

/** Settings for building a container out of the customer source. */
export interface BuildConfig {
  runtime: runtimes.Runtime;
  entryPoint: string;
  source: Source;
  sourceToken?: string;
  environmentVariables: Record<string, string>;

  // Output only
  build?: string;
  workerPool?: string;
}

export interface StorageSource {
  bucket: string;
  object: string;
  generation: number;
}

export interface RepoSource {
  projectId: string;
  repoName: string;

  // oneof revision
  branchName: string;
  tagName: string;
  commitSha: string;
  // end oneof revision

  dir: string;
  invertRegex: boolean;
}

export interface Source {
  // oneof source
  storageSource?: StorageSource;
  repoSource?: RepoSource;
  // end oneof source
}

export interface EventFilter {
  attribute: string;
  value: string;
  operator?: EventFilterOperator;
}

/**
 * Configurations for secret environment variables attached to a cloud functions resource.
 */
export interface SecretEnvVar {
  /* Name of the environment variable. */
  key: string;
  /* Project identifier (or project number) of the project that contains the secret. */
  projectId: string;
  /* Name of the secret in secret manager. e.g. MY_SECRET, NOT projects/abc/secrets/MY_SECRET */
  secret: string;
  /* Version of the secret (version number or the string 'latest') */
  version?: string;
}

/** The Cloud Run service that underlies a Cloud Function. */
export interface ServiceConfig {
  // Output only
  service?: string;
  // Output only. All Cloud Run services are HTTP services. So all Cloud
  // Functions will have a URI. This URI will be different from the
  // cloudfunctions.net URLs.
  uri?: string;

  timeoutSeconds?: number | null;
  availableMemory?: string | null;
  availableCpu?: string | null;
  environmentVariables?: Record<string, string> | null;
  secretEnvironmentVariables?: SecretEnvVar[] | null;
  maxInstanceCount?: number | null;
  minInstanceCount?: number | null;
  maxInstanceRequestConcurrency?: number | null;
  vpcConnector?: string | null;
  vpcConnectorEgressSettings?: VpcConnectorEgressSettings | null;
  ingressSettings?: IngressSettings | null;

  // The service account for default credentials. Defaults to the
  // default compute account. This is different from the v1 default
  // of the default GAE account.
  serviceAccountEmail?: string | null;
}

export interface EventTrigger {
  // Output only. The resource name of the underlying EventArc trigger.
  trigger?: string;

  // When unspecified will default to the region of the Cloud Function.
  // single-region names must match the function name.
  triggerRegion?: string;

  eventType: string;
  eventFilters?: EventFilter[];
  pubsubTopic?: string;

  // The service account that a trigger runs as. Must have the
  // run.routes.invoke permission on the target service. Defaults
  // to the defualt compute service account.
  serviceAccountEmail?: string;

  retryPolicy?: RetryPolicy;

  // The name of the channel associated with the trigger in
  // `projects/{project}/locations/{location}/channels/{channel}` format.
  channel?: string;
}

interface CloudFunctionBase {
  name: string;
  description?: string;
  buildConfig: BuildConfig;
  serviceConfig?: ServiceConfig;
  eventTrigger?: EventTrigger;
  labels?: Record<string, string> | null;
}

export type OutputCloudFunction = CloudFunctionBase & {
  state: FunctionState;
  updateTime: Date;
  serviceConfig?: RequireKeys<ServiceConfig, "service" | "uri">;
};

export type InputCloudFunction = CloudFunctionBase & {
  // serviceConfig is required.
  serviceConfig: ServiceConfig;
};

export interface OperationMetadata {
  createTime: string;
  endTime: string;
  target: string;
  verb: string;
  statusDetail: string;
  cancelRequested: boolean;
  apiVersion: string;
}

export interface Operation {
  name: string;
  // Note: this field is always present, but not used in prod and is a PITA
  // to add in tests.
  metadata?: OperationMetadata;
  done: boolean;
  error?: { code: number; message: string; details: unknown };
  response?: OutputCloudFunction;
}

// Private API interface for ListFunctionsResponse. listFunctions returns
// a CloudFunction[]
interface ListFunctionsResponse {
  functions: OutputCloudFunction[];
  unreachable: string[];
}

interface GenerateUploadUrlResponse {
  uploadUrl: string;
  storageSource: StorageSource;
}

// AvailableMemory suffixes and their byte count.
type MemoryUnit = "" | "k" | "M" | "G" | "T" | "Ki" | "Mi" | "Gi" | "Ti";
const BYTES_PER_UNIT: Record<MemoryUnit, number> = {
  "": 1,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  Ki: 1 << 10,
  Mi: 1 << 20,
  Gi: 1 << 30,
  Ti: 1 << 40,
};

/**
 * Returns the float-precision number of Mega(not Mebi)bytes in a
 * Kubernetes-style quantity
 * Must serve the same results as
 * https://github.com/kubernetes/kubernetes/blob/master/staging/src/k8s.io/apimachinery/pkg/api/resource/quantity.go
 */
export function mebibytes(memory: string): number {
  const re = /^([0-9]+(\.[0-9]*)?)(Ki|Mi|Gi|Ti|k|M|G|T|([eE]([0-9]+)))?$/;
  const matches = re.exec(memory);
  if (!matches) {
    throw new Error(`Invalid memory quantity "${memory}""`);
  }
  const quantity = Number.parseFloat(matches[1]);
  let bytes: number;
  if (matches[5]) {
    bytes = quantity * Math.pow(10, Number.parseFloat(matches[5]));
  } else {
    const suffix = matches[3] || "";
    bytes = quantity * BYTES_PER_UNIT[suffix as MemoryUnit];
  }
  return bytes / (1 << 20);
}

/**
 * Logs an error from a failed function deployment.
 * @param func The function that was unsuccessfully deployed.
 * @param type Type of deployment - create, update, or delete.
 * @param err The error returned from the operation.
 */
function functionsOpLogReject(func: InputCloudFunction, type: string, err: any): void {
  if (err?.message?.includes("maxScale may not exceed")) {
    const maxInstances = func.serviceConfig.maxInstanceCount || DEFAULT_MAX_INSTANCE_COUNT;
    utils.logLabeledWarning(
      "functions",
      `Your current project quotas don't allow for the current max instances setting of ${maxInstances}. ` +
        "Either reduce this function's maximum instances, or request a quota increase on the underlying Cloud Run service " +
        "at https://cloud.google.com/run/quotas."
    );
    const suggestedFix = func.buildConfig.runtime.startsWith("python")
      ? "firebase_functions.options.set_global_options(max_instances=10)"
      : "setGlobalOptions({maxInstances: 10})";
    utils.logLabeledWarning(
      "functions",
      `You can adjust the max instances value in your function's runtime options:\n\t${suggestedFix}`
    );
  } else {
    utils.logLabeledWarning("functions", `${err?.message}`);
    if (err?.context?.response?.statusCode === 429) {
      utils.logLabeledWarning(
        "functions",
        `Got "Quota Exceeded" error while trying to ${type} ${func.name}. Waiting to retry...`
      );
    } else if (
      err?.message?.includes(
        "If you recently started to use Eventarc, it may take a few minutes before all necessary permissions are propagated to the Service Agent"
      )
    ) {
      utils.logLabeledWarning(
        "functions",
        `Since this is your first time using 2nd gen functions, we need a little bit longer to finish setting everything up. Retry the deployment in a few minutes.`
      );
    }
    utils.logLabeledWarning(
      "functions",

      ` failed to ${type} function ${func.name}`
    );
  }
  throw new FirebaseError(`Failed to ${type} function ${func.name}`, {
    original: err,
    status: err?.context?.response?.statusCode,
    context: { function: func.name },
  });
}

/**
 * Creates an upload URL and pre-provisions a StorageSource.
 */
export async function generateUploadUrl(
  projectId: string,
  location: string
): Promise<GenerateUploadUrlResponse> {
  try {
    const res = await client.post<never, GenerateUploadUrlResponse>(
      `projects/${projectId}/locations/${location}/functions:generateUploadUrl`
    );
    return res.body;
  } catch (err: any) {
    logger.info(
      "\n\nThere was an issue deploying your functions. Verify that your project has a Google App Engine instance setup at https://console.cloud.google.com/appengine and try again. If this issue persists, please contact support."
    );
    throw err;
  }
}

/**
 * Creates a new Cloud Function.
 */
export async function createFunction(cloudFunction: InputCloudFunction): Promise<Operation> {
  // the API is a POST to the collection that owns the function name.
  const components = cloudFunction.name.split("/");
  const functionId = components.splice(-1, 1)[0];

  cloudFunction.buildConfig.environmentVariables = {
    ...cloudFunction.buildConfig.environmentVariables,
    // Disable GCF from automatically running npm run build script
    // https://cloud.google.com/functions/docs/release-notes
    GOOGLE_NODE_RUN_SCRIPTS: "",
  };

  cloudFunction.serviceConfig.environmentVariables = {
    ...cloudFunction.serviceConfig.environmentVariables,
    FUNCTION_TARGET: cloudFunction.buildConfig.entryPoint.replaceAll("-", "."),
  };

  try {
    const res = await client.post<typeof cloudFunction, Operation>(
      components.join("/"),
      cloudFunction,
      { queryParams: { functionId } }
    );
    return res.body;
  } catch (err: any) {
    throw functionsOpLogReject(cloudFunction, "create", err);
  }
}

/**
 * Gets the definition of a Cloud Function
 */
export async function getFunction(
  projectId: string,
  location: string,
  functionId: string
): Promise<OutputCloudFunction> {
  const name = `projects/${projectId}/locations/${location}/functions/${functionId}`;
  const res = await client.get<OutputCloudFunction>(name);
  return res.body;
}

/**
 *  List all functions in a region.
 *  Customers should generally use backend.existingBackend.
 */
export async function listFunctions(
  projectId: string,
  region: string
): Promise<OutputCloudFunction[]> {
  const res = await listFunctionsInternal(projectId, region);
  if (res.unreachable.includes(region)) {
    throw new FirebaseError(`Cloud Functions region ${region} is unavailable`);
  }
  return res.functions;
}

/**
 *  List all functions in all regions
 *  Customers should generally use backend.existingBackend and backend.checkAvailability.
 */
export async function listAllFunctions(projectId: string): Promise<ListFunctionsResponse> {
  return await listFunctionsInternal(projectId, /* region=*/ "-");
}

async function listFunctionsInternal(
  projectId: string,
  region: string
): Promise<ListFunctionsResponse> {
  type Response = ListFunctionsResponse & { nextPageToken?: string };
  const functions: OutputCloudFunction[] = [];
  const unreacahble = new Set<string>();
  let pageToken = "";
  while (true) {
    const url = `projects/${projectId}/locations/${region}/functions`;
    // V2 API returns both V1 and V2 Functions. Add filter condition to return only V2 functions.
    const opts: ClientVerbOptions = { queryParams: { filter: `environment="GEN_2"` } };
    if (pageToken !== "") {
      opts.queryParams = { ...opts.queryParams, pageToken };
    }
    const res = await client.get<Response>(url, opts);
    functions.push(...(res.body.functions || []));
    for (const region of res.body.unreachable || []) {
      unreacahble.add(region);
    }

    if (!res.body.nextPageToken) {
      return {
        functions,
        unreachable: Array.from(unreacahble),
      };
    }
    pageToken = res.body.nextPageToken;
  }
}

/**
 * Updates a Cloud Function.
 * Customers can force a field to be deleted by setting that field to `undefined`
 */
export async function updateFunction(cloudFunction: InputCloudFunction): Promise<Operation> {
  // Keys in labels and environmentVariables and secretEnvironmentVariables are user defined, so we don't recurse
  // for field masks.
  const fieldMasks = proto.fieldMasks(
    cloudFunction,
    /* doNotRecurseIn...=*/ "labels",
    "serviceConfig.environmentVariables",
    "serviceConfig.secretEnvironmentVariables"
  );

  cloudFunction.buildConfig.environmentVariables = {
    ...cloudFunction.buildConfig.environmentVariables,
    // Disable GCF from automatically running npm run build script
    // https://cloud.google.com/functions/docs/release-notes
    GOOGLE_NODE_RUN_SCRIPTS: "",
  };
  fieldMasks.push("buildConfig.buildEnvironmentVariables");

  cloudFunction.serviceConfig.environmentVariables = {
    ...cloudFunction.serviceConfig.environmentVariables,
    FUNCTION_TARGET: cloudFunction.buildConfig.entryPoint.replaceAll("-", "."),
  };

  try {
    const queryParams = {
      updateMask: fieldMasks.join(","),
    };
    const res = await client.patch<typeof cloudFunction, Operation>(
      cloudFunction.name,
      cloudFunction,
      { queryParams }
    );
    return res.body;
  } catch (err: any) {
    throw functionsOpLogReject(cloudFunction, "update", err);
  }
}

/**
 * Deletes a Cloud Function.
 * It is safe, but should be unnecessary, to delete a Cloud Function by just its name.
 */
export async function deleteFunction(cloudFunction: string): Promise<Operation> {
  try {
    const res = await client.delete<Operation>(cloudFunction);
    return res.body;
  } catch (err: any) {
    throw functionsOpLogReject({ name: cloudFunction } as InputCloudFunction, "update", err);
  }
}

/**
 * Generate a v2 Cloud Function API object from a versionless Endpoint object.
 */
export function functionFromEndpoint(endpoint: backend.Endpoint): InputCloudFunction {
  if (endpoint.platform !== "gcfv2") {
    throw new FirebaseError(
      "Trying to create a v2 CloudFunction with v1 API. This should never happen"
    );
  }

  if (!runtimes.isValidRuntime(endpoint.runtime)) {
    throw new FirebaseError(
      "Failed internal assertion. Trying to deploy a new function with a deprecated runtime." +
        " This should never happen"
    );
  }

  const gcfFunction: InputCloudFunction = {
    name: backend.functionName(endpoint),
    buildConfig: {
      runtime: endpoint.runtime,
      entryPoint: endpoint.entryPoint,
      source: {
        storageSource: endpoint.source?.storageSource,
      },
      // We don't use build environment variables,
      environmentVariables: {},
    },
    serviceConfig: {},
  };

  proto.copyIfPresent(gcfFunction, endpoint, "labels");
  proto.copyIfPresent(
    gcfFunction.serviceConfig,
    endpoint,
    "environmentVariables",
    "secretEnvironmentVariables",
    "ingressSettings",
    "timeoutSeconds"
  );
  proto.renameIfPresent(
    gcfFunction.serviceConfig,
    endpoint,
    "serviceAccountEmail",
    "serviceAccount"
  );
  // Memory must be set because the default value of GCF gen 2 is Megabytes and
  // we use mebibytes
  const mem = endpoint.availableMemoryMb || backend.DEFAULT_MEMORY;
  gcfFunction.serviceConfig.availableMemory = mem > 1024 ? `${mem / 1024}Gi` : `${mem}Mi`;
  proto.renameIfPresent(gcfFunction.serviceConfig, endpoint, "minInstanceCount", "minInstances");
  proto.renameIfPresent(gcfFunction.serviceConfig, endpoint, "maxInstanceCount", "maxInstances");
  // N.B. only convert CPU and concurrency fields for 2nd gen functions, once we
  // eventually use the v2 API to configure both 1st and 2nd gen functions)
  proto.renameIfPresent(
    gcfFunction.serviceConfig,
    endpoint,
    "maxInstanceRequestConcurrency",
    "concurrency"
  );
  proto.convertIfPresent(gcfFunction.serviceConfig, endpoint, "availableCpu", "cpu", (cpu) => {
    return String(cpu);
  });

  if (endpoint.vpc) {
    proto.renameIfPresent(gcfFunction.serviceConfig, endpoint.vpc, "vpcConnector", "connector");
    proto.renameIfPresent(
      gcfFunction.serviceConfig,
      endpoint.vpc,
      "vpcConnectorEgressSettings",
      "egressSettings"
    );
  } else if (endpoint.vpc === null) {
    gcfFunction.serviceConfig.vpcConnector = null;
    gcfFunction.serviceConfig.vpcConnectorEgressSettings = null;
  }

  if (backend.isEventTriggered(endpoint)) {
    gcfFunction.eventTrigger = {
      eventType: endpoint.eventTrigger.eventType,
      retryPolicy: "RETRY_POLICY_UNSPECIFIED",
    };
    if (gcfFunction.eventTrigger.eventType === PUBSUB_PUBLISH_EVENT) {
      if (!endpoint.eventTrigger.eventFilters?.topic) {
        throw new FirebaseError(
          "Error: Pub/Sub event trigger is missing topic: " +
            JSON.stringify(endpoint.eventTrigger, null, 2)
        );
      }
      gcfFunction.eventTrigger.pubsubTopic = endpoint.eventTrigger.eventFilters.topic;
      gcfFunction.eventTrigger.eventFilters = [];
      for (const [attribute, value] of Object.entries(endpoint.eventTrigger.eventFilters)) {
        if (attribute === "topic") continue;
        gcfFunction.eventTrigger.eventFilters.push({ attribute, value });
      }
    } else {
      gcfFunction.eventTrigger.eventFilters = [];
      for (const [attribute, value] of Object.entries(endpoint.eventTrigger.eventFilters || {})) {
        gcfFunction.eventTrigger.eventFilters.push({ attribute, value });
      }
      for (const [attribute, value] of Object.entries(
        endpoint.eventTrigger.eventFilterPathPatterns || {}
      )) {
        gcfFunction.eventTrigger.eventFilters.push({
          attribute,
          value,
          operator: "match-path-pattern",
        });
      }
    }
    proto.renameIfPresent(
      gcfFunction.eventTrigger,
      endpoint.eventTrigger,
      "triggerRegion",
      "region"
    );
    proto.copyIfPresent(gcfFunction.eventTrigger, endpoint.eventTrigger, "channel");

    endpoint.eventTrigger.retry
      ? (gcfFunction.eventTrigger.retryPolicy = "RETRY_POLICY_RETRY")
      : (gcfFunction.eventTrigger!.retryPolicy = "RETRY_POLICY_DO_NOT_RETRY");

    // By default, Functions Framework in GCFv2 opts to downcast incoming cloudevent messages to legacy formats.
    // Since Firebase Functions SDK expects messages in cloudevent format, we set FUNCTION_SIGNATURE_TYPE to tell
    // Functions Framework to disable downcast before passing the cloudevent message to function handler.
    // See https://github.com/GoogleCloudPlatform/functions-framework-nodejs/blob/master/README.md#configure-the-functions-
    gcfFunction.serviceConfig.environmentVariables = {
      ...gcfFunction.serviceConfig.environmentVariables,
      FUNCTION_SIGNATURE_TYPE: "cloudevent",
    };
  } else if (backend.isScheduleTriggered(endpoint)) {
    // trigger type defaults to HTTPS.
    gcfFunction.labels = { ...gcfFunction.labels, "deployment-scheduled": "true" };
  } else if (backend.isTaskQueueTriggered(endpoint)) {
    gcfFunction.labels = { ...gcfFunction.labels, "deployment-taskqueue": "true" };
  } else if (backend.isCallableTriggered(endpoint)) {
    gcfFunction.labels = { ...gcfFunction.labels, "deployment-callable": "true" };
  } else if (backend.isBlockingTriggered(endpoint)) {
    gcfFunction.labels = {
      ...gcfFunction.labels,
      [BLOCKING_LABEL]:
        BLOCKING_EVENT_TO_LABEL_KEY[
          endpoint.blockingTrigger.eventType as (typeof AUTH_BLOCKING_EVENTS)[number]
        ],
    };
  }
  const codebase = endpoint.codebase || projectConfig.DEFAULT_CODEBASE;
  if (codebase !== projectConfig.DEFAULT_CODEBASE) {
    gcfFunction.labels = {
      ...gcfFunction.labels,
      [CODEBASE_LABEL]: codebase,
    };
  } else {
    delete gcfFunction.labels?.[CODEBASE_LABEL];
  }
  if (endpoint.hash) {
    gcfFunction.labels = {
      ...gcfFunction.labels,
      [HASH_LABEL]: endpoint.hash,
    };
  }
  return gcfFunction;
}

/**
 * Generate a versionless Endpoint object from a v2 Cloud Function API object.
 */
export function endpointFromFunction(gcfFunction: OutputCloudFunction): backend.Endpoint {
  const [, project, , region, , id] = gcfFunction.name.split("/");
  let trigger: backend.Triggered;
  if (gcfFunction.labels?.["deployment-scheduled"] === "true") {
    trigger = {
      scheduleTrigger: {},
    };
  } else if (gcfFunction.labels?.["deployment-taskqueue"] === "true") {
    trigger = {
      taskQueueTrigger: {},
    };
  } else if (gcfFunction.labels?.["deployment-callable"] === "true") {
    trigger = {
      callableTrigger: {},
    };
  } else if (gcfFunction.labels?.[BLOCKING_LABEL]) {
    trigger = {
      blockingTrigger: {
        eventType: BLOCKING_LABEL_KEY_TO_EVENT[gcfFunction.labels[BLOCKING_LABEL]],
      },
    };
  } else if (gcfFunction.eventTrigger) {
    const eventFilters: Record<string, string> = {};
    const eventFilterPathPatterns: Record<string, string> = {};
    if (
      gcfFunction.eventTrigger.pubsubTopic &&
      gcfFunction.eventTrigger.eventType === PUBSUB_PUBLISH_EVENT
    ) {
      eventFilters.topic = gcfFunction.eventTrigger.pubsubTopic;
    } else {
      for (const eventFilter of gcfFunction.eventTrigger.eventFilters || []) {
        if (eventFilter.operator === "match-path-pattern") {
          eventFilterPathPatterns[eventFilter.attribute] = eventFilter.value;
        } else {
          eventFilters[eventFilter.attribute] = eventFilter.value;
        }
      }
    }
    trigger = {
      eventTrigger: {
        eventType: gcfFunction.eventTrigger.eventType,
        retry: gcfFunction.eventTrigger.retryPolicy === "RETRY_POLICY_RETRY" ? true : false,
      },
    };
    if (Object.keys(eventFilters).length) {
      trigger.eventTrigger.eventFilters = eventFilters;
    }
    if (Object.keys(eventFilterPathPatterns).length) {
      trigger.eventTrigger.eventFilterPathPatterns = eventFilterPathPatterns;
    }
    proto.copyIfPresent(trigger.eventTrigger, gcfFunction.eventTrigger, "channel");
    proto.renameIfPresent(
      trigger.eventTrigger,
      gcfFunction.eventTrigger,
      "region",
      "triggerRegion"
    );
  } else {
    trigger = { httpsTrigger: {} };
  }

  if (!runtimes.isValidRuntime(gcfFunction.buildConfig.runtime)) {
    logger.debug("GCFv2 function has a deprecated runtime:", JSON.stringify(gcfFunction, null, 2));
  }

  const endpoint: backend.Endpoint = {
    platform: "gcfv2",
    id,
    project,
    region,
    ...trigger,
    entryPoint: gcfFunction.buildConfig.entryPoint,
    runtime: gcfFunction.buildConfig.runtime,
    source: gcfFunction.buildConfig.source,
  };
  if (gcfFunction.serviceConfig) {
    proto.copyIfPresent(
      endpoint,
      gcfFunction.serviceConfig,
      "ingressSettings",
      "environmentVariables",
      "secretEnvironmentVariables",
      "timeoutSeconds",
      "uri"
    );
    proto.renameIfPresent(
      endpoint,
      gcfFunction.serviceConfig,
      "serviceAccount",
      "serviceAccountEmail"
    );
    proto.convertIfPresent(
      endpoint,
      gcfFunction.serviceConfig,
      "availableMemoryMb",
      "availableMemory",
      (prod) => {
        if (prod === null) {
          logger.debug("Prod should always return a valid memory amount");
          return prod as never;
        }
        const mem = mebibytes(prod);
        if (!backend.isValidMemoryOption(mem)) {
          logger.debug("Converting a function to an endpoint with an invalid memory option", mem);
        }
        return mem as backend.MemoryOptions;
      }
    );
    proto.convertIfPresent(endpoint, gcfFunction.serviceConfig, "cpu", "availableCpu", (cpu) => {
      let cpuVal: number | null = Number(cpu);
      if (Number.isNaN(cpuVal)) {
        cpuVal = null;
      }
      return cpuVal;
    });
    proto.renameIfPresent(endpoint, gcfFunction.serviceConfig, "minInstances", "minInstanceCount");
    proto.renameIfPresent(endpoint, gcfFunction.serviceConfig, "maxInstances", "maxInstanceCount");
    proto.renameIfPresent(
      endpoint,
      gcfFunction.serviceConfig,
      "concurrency",
      "maxInstanceRequestConcurrency"
    );
    proto.copyIfPresent(endpoint, gcfFunction, "labels");
    if (gcfFunction.serviceConfig.vpcConnector) {
      endpoint.vpc = { connector: gcfFunction.serviceConfig.vpcConnector };
      proto.renameIfPresent(
        endpoint.vpc,
        gcfFunction.serviceConfig,
        "egressSettings",
        "vpcConnectorEgressSettings"
      );
    }
    const serviceName = gcfFunction.serviceConfig.service;
    if (!serviceName) {
      logger.debug(
        "Got a v2 function without a service name." +
          "Maybe we've migrated to using the v2 API everywhere and missed this code"
      );
    } else {
      endpoint.runServiceId = utils.last(serviceName.split("/"));
    }
  }
  endpoint.codebase = gcfFunction.labels?.[CODEBASE_LABEL] || projectConfig.DEFAULT_CODEBASE;
  if (gcfFunction.labels?.[HASH_LABEL]) {
    endpoint.hash = gcfFunction.labels[HASH_LABEL];
  }
  return endpoint;
}
