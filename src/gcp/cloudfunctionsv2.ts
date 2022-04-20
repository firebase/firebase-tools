import * as clc from "cli-color";

import { Client } from "../apiv2";
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

export const API_VERSION = "v2alpha";
export const CODEBASE_LABEL = "firebase-functions-codebase";

const client = new Client({
  urlPrefix: functionsV2Origin,
  auth: true,
  apiVersion: API_VERSION,
});

export const BLOCKING_LABEL = "deployment-blocking";

const BLOCKING_LABEL_KEY_TO_EVENT: Record<string, typeof AUTH_BLOCKING_EVENTS[number]> = {
  "before-create": "providers/cloud.auth/eventTypes/user.beforeCreate",
  "before-sign-in": "providers/cloud.auth/eventTypes/user.beforeSignIn",
};

const BLOCKING_EVENT_TO_LABEL_KEY: Record<typeof AUTH_BLOCKING_EVENTS[number], string> = {
  "providers/cloud.auth/eventTypes/user.beforeCreate": "before-create",
  "providers/cloud.auth/eventTypes/user.beforeSignIn": "before-sign-in",
};

export type VpcConnectorEgressSettings = "PRIVATE_RANGES_ONLY" | "ALL_TRAFFIC";
export type IngressSettings = "ALLOW_ALL" | "ALLOW_INTERNAL_ONLY" | "ALLOW_INTERNAL_AND_GCLB";
export type FunctionState = "ACTIVE" | "FAILED" | "DEPLOYING" | "DELETING" | "UNKONWN";

// The GCFv2 funtion type has many inner types which themselves have output-only fields:
// eventTrigger.trigger
// buildConfig.config
// buildConfig.workerPool
// serviceConfig.service
// serviceConfig.uri
//
// Because Omit<> doesn't work with nested property addresses, we're making those fields optional.
// An alternative would be to name the types OutputCloudFunction/CloudFunction or CloudFunction/InputCloudFunction.
export type OutputOnlyFields = "state" | "updateTime";

/** Settings for building a container out of the customer source. */
export interface BuildConfig {
  runtime: runtimes.Runtime;
  entryPoint: string;
  source: Source;
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
}

/** The Cloud Run service that underlies a Cloud Function. */
export interface ServiceConfig {
  // Output only
  service?: string;
  // Output only. All Cloud Run services are HTTP services. So all Cloud
  // Functions will have a URI. This URI will be different from the
  // cloudfunctions.net URLs.
  uri?: string;

  timeoutSeconds?: number;
  availableMemory?: string;
  environmentVariables?: Record<string, string>;
  maxInstanceCount?: number;
  minInstanceCount?: number;
  vpcConnector?: string;
  vpcConnectorEgressSettings?: VpcConnectorEgressSettings;
  ingressSettings?: IngressSettings;

  // The service account for default credentials. Defaults to the
  // default compute account. This is different from the v1 default
  // of the default GAE account.
  serviceAccountEmail?: string;
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

  // The name of the channel associated with the trigger in
  // `projects/{project}/locations/{location}/channels/{channel}` format.
  channel?: string;
}

export interface CloudFunction {
  name: string;
  description?: string;
  buildConfig: BuildConfig;
  serviceConfig: ServiceConfig;
  eventTrigger?: EventTrigger;
  state: FunctionState;
  updateTime: Date;
  labels?: Record<string, string>;
}

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
  response?: CloudFunction;
}

// Private API interface for ListFunctionsResponse. listFunctions returns
// a CloudFunction[]
interface ListFunctionsResponse {
  functions: CloudFunction[];
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
export function megabytes(memory: string): number {
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
  return bytes / 1e6;
}

/**
 * Logs an error from a failed function deployment.
 * @param funcName Name of the function that was unsuccessfully deployed.
 * @param type Type of deployment - create, update, or delete.
 * @param err The error returned from the operation.
 */
function functionsOpLogReject(funcName: string, type: string, err: any): void {
  if (err?.context?.response?.statusCode === 429) {
    utils.logWarning(
      `${clc.bold.yellow(
        "functions:"
      )} got "Quota Exceeded" error while trying to ${type} ${funcName}. Waiting to retry...`
    );
  } else {
    utils.logWarning(
      clc.bold.yellow("functions:") + " failed to " + type + " function " + funcName
    );
  }
  throw new FirebaseError(`Failed to ${type} function ${funcName}`, {
    original: err,
    context: { function: funcName },
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
export async function createFunction(
  cloudFunction: Omit<CloudFunction, OutputOnlyFields>
): Promise<Operation> {
  // the API is a POST to the collection that owns the function name.
  const components = cloudFunction.name.split("/");
  const functionId = components.splice(-1, 1)[0];

  try {
    const res = await client.post<typeof cloudFunction, Operation>(
      components.join("/"),
      cloudFunction,
      { queryParams: { functionId } }
    );
    return res.body;
  } catch (err: any) {
    throw functionsOpLogReject(cloudFunction.name, "create", err);
  }
}

/**
 * Gets the definition of a Cloud Function
 */
export async function getFunction(
  projectId: string,
  location: string,
  functionId: string
): Promise<CloudFunction> {
  const name = `projects/${projectId}/locations/${location}/functions/${functionId}`;
  const res = await client.get<CloudFunction>(name);
  return res.body;
}

/**
 *  List all functions in a region.
 *  Customers should generally use backend.existingBackend.
 */
export async function listFunctions(projectId: string, region: string): Promise<CloudFunction[]> {
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
  const functions: CloudFunction[] = [];
  const unreacahble = new Set<string>();
  let pageToken = "";
  while (true) {
    const url = `projects/${projectId}/locations/${region}/functions`;
    const opts = pageToken === "" ? {} : { queryParams: { pageToken } };
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
export async function updateFunction(
  cloudFunction: Omit<CloudFunction, OutputOnlyFields>
): Promise<Operation> {
  // Keys in labels and environmentVariables are user defined, so we don't recurse
  // for field masks.
  const fieldMasks = proto.fieldMasks(
    cloudFunction,
    /* doNotRecurseIn...=*/ "labels",
    "serviceConfig.environmentVariables"
  );
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
    throw functionsOpLogReject(cloudFunction.name, "update", err);
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
    throw functionsOpLogReject(cloudFunction, "update", err);
  }
}

export function functionFromEndpoint(endpoint: backend.Endpoint, source: StorageSource) {
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

  const gcfFunction: Omit<CloudFunction, OutputOnlyFields> = {
    name: backend.functionName(endpoint),
    buildConfig: {
      runtime: endpoint.runtime,
      entryPoint: endpoint.entryPoint,
      source: {
        storageSource: source,
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
    "serviceAccountEmail",
    "ingressSettings",
    "timeoutSeconds"
  );
  proto.renameIfPresent(
    gcfFunction.serviceConfig,
    endpoint,
    "availableMemory",
    "availableMemoryMb",
    (mb: string) => `${mb}M`
  );
  proto.renameIfPresent(gcfFunction.serviceConfig, endpoint, "minInstanceCount", "minInstances");
  proto.renameIfPresent(gcfFunction.serviceConfig, endpoint, "maxInstanceCount", "maxInstances");

  if (endpoint.vpc) {
    proto.renameIfPresent(gcfFunction.serviceConfig, endpoint.vpc, "vpcConnector", "connector");
    proto.renameIfPresent(
      gcfFunction.serviceConfig,
      endpoint.vpc,
      "vpcConnectorEgressSettings",
      "egressSettings"
    );
  }

  if (backend.isEventTriggered(endpoint)) {
    gcfFunction.eventTrigger = {
      eventType: endpoint.eventTrigger.eventType,
    };
    if (gcfFunction.eventTrigger.eventType === PUBSUB_PUBLISH_EVENT) {
      gcfFunction.eventTrigger.pubsubTopic = endpoint.eventTrigger.eventFilters.topic;
      gcfFunction.eventTrigger.eventFilters = [];
      for (const [attribute, value] of Object.entries(endpoint.eventTrigger.eventFilters)) {
        if (attribute === "topic") continue;
        gcfFunction.eventTrigger.eventFilters.push({ attribute, value });
      }
    } else {
      gcfFunction.eventTrigger.eventFilters = [];
      for (const [attribute, value] of Object.entries(endpoint.eventTrigger.eventFilters)) {
        gcfFunction.eventTrigger.eventFilters.push({ attribute, value });
      }
    }
    proto.renameIfPresent(
      gcfFunction.eventTrigger,
      endpoint.eventTrigger,
      "triggerRegion",
      "region"
    );
    proto.copyIfPresent(gcfFunction.eventTrigger, endpoint.eventTrigger, "channel");

    if (endpoint.eventTrigger.retry) {
      logger.warn("Cannot set a retry policy on Cloud Function", endpoint.id);
    }
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
          endpoint.blockingTrigger.eventType as typeof AUTH_BLOCKING_EVENTS[number]
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
  return gcfFunction;
}

export function endpointFromFunction(gcfFunction: CloudFunction): backend.Endpoint {
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
    trigger = {
      eventTrigger: {
        eventType: gcfFunction.eventTrigger.eventType,
        eventFilters: {},
        retry: false,
      },
    };
    if (gcfFunction.eventTrigger.pubsubTopic) {
      trigger.eventTrigger.eventFilters.topic = gcfFunction.eventTrigger.pubsubTopic;
    } else {
      for (const { attribute, value } of gcfFunction.eventTrigger.eventFilters || []) {
        trigger.eventTrigger.eventFilters[attribute] = value;
      }
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
    uri: gcfFunction.serviceConfig.uri,
  };
  proto.copyIfPresent(
    endpoint,
    gcfFunction.serviceConfig,
    "serviceAccountEmail",
    "ingressSettings",
    "environmentVariables",
    "timeoutSeconds"
  );
  proto.renameIfPresent(
    endpoint,
    gcfFunction.serviceConfig,
    "availableMemoryMb",
    "availableMemory",
    megabytes
  );
  proto.renameIfPresent(endpoint, gcfFunction.serviceConfig, "minInstances", "minInstanceCount");
  proto.renameIfPresent(endpoint, gcfFunction.serviceConfig, "maxInstances", "maxInstanceCount");
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
  endpoint.codebase = gcfFunction.labels?.[CODEBASE_LABEL] || projectConfig.DEFAULT_CODEBASE;
  return endpoint;
}
