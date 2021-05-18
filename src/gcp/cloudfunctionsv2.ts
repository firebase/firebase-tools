import * as clc from "cli-color";

import { Client } from "../apiv2";
import { FirebaseError } from "../error";
import { functionsV2Origin } from "../api";
import { logger } from "../logger";
import * as proto from "./proto";
import * as utils from "../utils";

const API_VERSION = "v2alpha";

const client = new Client({
  urlPrefix: functionsV2Origin,
  auth: true,
  apiVersion: "v2alpha",
});

export const PUBSUB_PUBLISH_EVENT = "google.cloud.pubsub.topic.v1.messagePublished";

export type VpcConnectorEgressSettings = "PRIVATE_RANGES_ONLY" | "ALL_TRAFFIC";
export type IngressSettings = "ALLOW_ALL" | "ALLOW_INTERNAL_ONLY" | "ALLOW_INTERNAL_AND_GCLB";
export type FunctionState = "ACTIVE" | "FAILED" | "DEPLOYING" | "DELETING" | "UNKONWN";
export type Runtime = "nodejs10" | "nodejs12" | "nodejs14";

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
  runtime: Runtime;
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
  availableMemoryMb?: number;
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
  metadata: OperationMetadata;
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
      `projects/${projectId}/locations/${location}:generateUploadUrl`
    );
    return res.body;
  } catch (err) {
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
  cloudFunction: Omit<CloudFunction, "serviceConfig.service">
): Promise<Operation> {
  // the API is a POST to the collection that owns the function name.
  const path = cloudFunction.name.substring(0, cloudFunction.name.lastIndexOf("/"));
  try {
    const res = await client.post<typeof cloudFunction, Operation>(path, cloudFunction);
    return res.body;
  } catch (err) {
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
  if (res.unreachable!.includes(region)) {
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
  const functions: CloudFunction[] = [];
  const unreacahble = new Set<string>();
  let pageToken = "";
  while (true) {
    const res = await client.get<ListFunctionsResponse & { nextPageToken?: string }>(
      `projects/${projectId}/locations/us-central1/functions`,
      { queryParams: { pageToken } }
    );
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
  try {
    const queryParams = {
      updateMask: proto.fieldMasks(cloudFunction).join(","),
    };
    const res = await client.patch<typeof cloudFunction, Operation>(
      cloudFunction.name,
      cloudFunction,
      { queryParams }
    );
    return res.body;
  } catch (err) {
    throw functionsOpLogReject(cloudFunction.name, "update", err);
  }
}

export async function deleteFunction(
  cloudFunction: Omit<CloudFunction, OutputOnlyFields>
): Promise<Operation> {
  try {
    const res = await client.delete<Operation>(cloudFunction.name);
    return res.body;
  } catch (err) {
    throw functionsOpLogReject(cloudFunction.name, "update", err);
  }
}
