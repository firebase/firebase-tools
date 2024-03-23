import * as clc from "colorette";

import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as backend from "../deploy/functions/backend";
import * as utils from "../utils";
import * as proto from "./proto";
import * as runtimes from "../deploy/functions/runtimes";
import * as iam from "./iam";
import * as projectConfig from "../functions/projectConfig";
import { Client } from "../apiv2";
import { functionsOrigin } from "../api";
import { AUTH_BLOCKING_EVENTS } from "../functions/events/v1";
import {
  BLOCKING_EVENT_TO_LABEL_KEY,
  BLOCKING_LABEL,
  BLOCKING_LABEL_KEY_TO_EVENT,
  CODEBASE_LABEL,
  HASH_LABEL,
} from "../functions/constants";

export const API_VERSION = "v1";
const client = new Client({ urlPrefix: functionsOrigin, apiVersion: API_VERSION });

interface Operation {
  name: string;
  type: string;
  done: boolean;
  error?: { code: number; message: string };
}

export interface HttpsTrigger {
  // output only
  readonly url?: string;
  securityLevel?: SecurityLevel;
}

export interface EventTrigger {
  eventType: string;
  resource: string;
  service?: string;
  failurePolicy?: FailurePolicy;
}

export interface CorsPolicy {
  allowOrigin: string[];
  allowMethods?: string[];
  allowHeaders?: string[];
  exposeHeaders?: string[];
}

export interface SecretEnvVar {
  key: string;
  projectId: string;
  secret: string;
  version?: string;
}

export interface SecretVolume {
  mountPath: string;
  projectId: string;
  secret: string;
  versions: {
    version: string;
    path: string;
  }[];
}

export type CloudFunctionStatus =
  | "ACTIVE"
  | "OFFLINE"
  | "DEPLOY_IN_PROGRESS"
  | "DELETE_IN_PROGRESS"
  | "UNKNOWN";
export type SecurityLevel = "SECURE_ALWAYS" | "SECURE_OPTIONAL";

export interface FailurePolicy {
  // oneof action
  retry?: Record<string, never>;
  // end oneof action
}

/**
 * API type for Cloud Functions in the v1 API. Fields that are nullable can
 * be set to null in UpdateFunction to reset them to default server-side values.
 */
export interface CloudFunction {
  name: string;
  description?: string;

  // oneof source_code
  sourceArchiveUrl?: string;
  sourceRepository?: {
    url: string;
    deployedUrl: string;
  };
  sourceUploadUrl?: string;
  // end oneof source_code

  // oneof trigger
  httpsTrigger?: HttpsTrigger;
  eventTrigger?: EventTrigger;
  // end oneof trigger;

  entryPoint: string;
  runtime: runtimes.Runtime;
  // Default = 60s
  timeout?: proto.Duration | null;

  // Default 256
  availableMemoryMb?: number | null;

  // Default <projectID>@appspot.gserviceaccount.com
  serviceAccountEmail?: string | null;

  labels?: Record<string, string>;
  environmentVariables?: Record<string, string> | null;
  buildEnvironmentVariables?: Record<string, string>;

  network?: string | null;
  maxInstances?: number | null;
  minInstances?: number | null;

  corsPolicy?: CorsPolicy;
  vpcConnector?: string | null;
  vpcConnectorEgressSettings?: "PRIVATE_RANGES_ONLY" | "ALL_TRAFFIC" | null;
  ingressSettings?: "ALLOW_ALL" | "ALLOW_INTERNAL_ONLY" | "ALLOW_INTERNAL_AND_GCLB" | null;

  kmsKeyName?: string | null;
  buildWorkerPool?: string | null;
  secretEnvironmentVariables?: SecretEnvVar[] | null;
  secretVolumes?: SecretVolume[] | null;
  dockerRegistry?: "CONTAINER_REGISTRY" | "ARTIFACT_REGISTRY";

  // Input-only parameter. Source token originally comes from the Operation
  // of another Create/Update function call.
  sourceToken?: string;

  // Output parameters
  status: CloudFunctionStatus;
  buildId: string;
  updateTime: Date;
  versionId: number;
}

export type OutputOnlyFields = "status" | "buildId" | "updateTime" | "versionId";

/**
 * Logs an error from a failed function deployment.
 * @param funcName Name of the function that was unsuccessfully deployed.
 * @param type Type of deployment - create, update, or delete.
 * @param err The error returned from the operation.
 */
function functionsOpLogReject(funcName: string, type: string, err: any): void {
  if (err?.context?.response?.statusCode === 429) {
    utils.logWarning(
      `${clc.bold(
        clc.yellow("functions:"),
      )} got "Quota Exceeded" error while trying to ${type} ${funcName}. Waiting to retry...`,
    );
  } else {
    utils.logWarning(
      clc.bold(clc.yellow("functions:")) + " failed to " + type + " function " + funcName,
    );
  }
  throw new FirebaseError(`Failed to ${type} function ${funcName}`, {
    original: err,
    status: err?.context?.response?.statusCode,
    context: { function: funcName },
  });
}

/**
 * Calls the GCG API to generate a signed upload URL that
 * function code can be uploaded to.
 * @param projectId The ID of the project being deployed to.
 * @param location The region to used for generating an upload URL.
 */
export async function generateUploadUrl(projectId: string, location: string): Promise<string> {
  const parent = "projects/" + projectId + "/locations/" + location;
  const endpoint = `/${parent}/functions:generateUploadUrl`;

  try {
    const res = await client.post<unknown, { uploadUrl: string }>(
      endpoint,
      {},
      { retryCodes: [503] },
    );
    return res.body.uploadUrl;
  } catch (err: any) {
    logger.info(
      "\n\nThere was an issue deploying your functions. Verify that your project has a Google App Engine instance setup at https://console.cloud.google.com/appengine and try again. If this issue persists, please contact support.",
    );
    throw err;
  }
}

/**
 * Create a Cloud Function.
 * @param cloudFunction The function to delete
 */
export async function createFunction(
  cloudFunction: Omit<CloudFunction, OutputOnlyFields>,
): Promise<Operation> {
  // the API is a POST to the collection that owns the function name.
  const apiPath = cloudFunction.name.substring(0, cloudFunction.name.lastIndexOf("/"));
  const endpoint = `/${apiPath}`;
  cloudFunction.buildEnvironmentVariables = {
    ...cloudFunction.buildEnvironmentVariables,
    // Disable GCF from automatically running npm run build script
    // https://cloud.google.com/functions/docs/release-notes
    GOOGLE_NODE_RUN_SCRIPTS: "",
  };

  try {
    const res = await client.post<Omit<CloudFunction, OutputOnlyFields>, CloudFunction>(
      endpoint,
      cloudFunction,
    );
    return {
      name: res.body.name,
      type: "create",
      done: false,
    };
  } catch (err: any) {
    throw functionsOpLogReject(cloudFunction.name, "create", err);
  }
}

/**
 * @param name Fully qualified name of the Function.
 * @param policy The [policy](https://cloud.google.com/functions/docs/reference/rest/v1/projects.locations.functions/setIamPolicy) to set.
 */
interface IamOptions {
  name: string;
  policy: iam.Policy;
}

/**
 * Sets the IAM policy of a Google Cloud Function.
 * @param options The Iam options to set.
 */
export async function setIamPolicy(options: IamOptions): Promise<void> {
  const endpoint = `/${options.name}:setIamPolicy`;

  try {
    await client.post(endpoint, {
      policy: options.policy,
      updateMask: Object.keys(options.policy).join(","),
    });
  } catch (err: any) {
    throw new FirebaseError(`Failed to set the IAM Policy on the function ${options.name}`, {
      original: err,
      status: err?.context?.response?.statusCode,
    });
  }
}

// Response body policy - https://cloud.google.com/functions/docs/reference/rest/v1/Policy
interface GetIamPolicy {
  bindings?: iam.Binding[];
  version?: number;
  etag?: string;
}

/**
 * Gets the IAM policy of a Google Cloud Function.
 * @param fnName The full name and path of the Cloud Function.
 */
export async function getIamPolicy(fnName: string): Promise<GetIamPolicy> {
  const endpoint = `/${fnName}:getIamPolicy`;

  try {
    const res = await client.get<GetIamPolicy>(endpoint);
    return res.body;
  } catch (err: any) {
    throw new FirebaseError(`Failed to get the IAM Policy on the function ${fnName}`, {
      original: err,
    });
  }
}

/**
 * Sets the invoker IAM policy for the function on function create
 * @param projectId id of the project
 * @param fnName function name
 * @param invoker an array of invoker strings
 * @throws {@link FirebaseError} on an empty invoker, when the IAM Polciy fails to be grabbed or set
 */
export async function setInvokerCreate(
  projectId: string,
  fnName: string,
  invoker: string[],
): Promise<void> {
  if (invoker.length === 0) {
    throw new FirebaseError("Invoker cannot be an empty array");
  }
  const invokerMembers = proto.getInvokerMembers(invoker, projectId);
  const invokerRole = "roles/cloudfunctions.invoker";
  const bindings = [{ role: invokerRole, members: invokerMembers }];

  const policy: iam.Policy = {
    bindings: bindings,
    etag: "",
    version: 3,
  };
  await setIamPolicy({ name: fnName, policy: policy });
}

/**
 * Gets the current IAM policy on function update,
 * overrides the current invoker role with the supplied invoker members
 * @param projectId id of the project
 * @param fnName function name
 * @param invoker an array of invoker strings
 * @throws {@link FirebaseError} on an empty invoker, when the IAM Polciy fails to be grabbed or set
 */
export async function setInvokerUpdate(
  projectId: string,
  fnName: string,
  invoker: string[],
): Promise<void> {
  if (invoker.length === 0) {
    throw new FirebaseError("Invoker cannot be an empty array");
  }
  const invokerMembers = proto.getInvokerMembers(invoker, projectId);
  const invokerRole = "roles/cloudfunctions.invoker";
  const currentPolicy = await getIamPolicy(fnName);
  const currentInvokerBinding = currentPolicy.bindings?.find(
    (binding) => binding.role === invokerRole,
  );
  if (
    currentInvokerBinding &&
    JSON.stringify(currentInvokerBinding.members.sort()) === JSON.stringify(invokerMembers.sort())
  ) {
    return;
  }

  const bindings = (currentPolicy.bindings || []).filter((binding) => binding.role !== invokerRole);
  bindings.push({
    role: invokerRole,
    members: invokerMembers,
  });

  const policy: iam.Policy = {
    bindings: bindings,
    etag: currentPolicy.etag || "",
    version: 3,
  };
  await setIamPolicy({ name: fnName, policy: policy });
}

/**
 * Updates a Cloud Function.
 * @param cloudFunction The Cloud Function to update.
 */
export async function updateFunction(
  cloudFunction: Omit<CloudFunction, OutputOnlyFields>,
): Promise<Operation> {
  const endpoint = `/${cloudFunction.name}`;
  // Keys in labels and environmentVariables and secretEnvironmentVariables are user defined,
  // so we don't recurse for field masks.
  const fieldMasks = proto.fieldMasks(
    cloudFunction,
    /* doNotRecurseIn...=*/ "labels",
    "environmentVariables",
    "secretEnvironmentVariables",
  );

  cloudFunction.buildEnvironmentVariables = {
    ...cloudFunction.buildEnvironmentVariables,
    // Disable GCF from automatically running npm run build script
    // https://cloud.google.com/functions/docs/release-notes
    GOOGLE_NODE_RUN_SCRIPTS: "",
  };
  fieldMasks.push("buildEnvironmentVariables");

  // Failure policy is always an explicit policy and is only signified by the presence or absence of
  // a protobuf.Empty value, so we have to manually add it in the missing case.
  try {
    const res = await client.patch<Omit<CloudFunction, OutputOnlyFields>, CloudFunction>(
      endpoint,
      cloudFunction,
      {
        queryParams: {
          updateMask: fieldMasks.join(","),
        },
      },
    );
    return {
      done: false,
      name: res.body.name,
      type: "update",
    };
  } catch (err: any) {
    throw functionsOpLogReject(cloudFunction.name, "update", err);
  }
}

/**
 * Delete a Cloud Function.
 * @param options the Cloud Function to delete.
 */
export async function deleteFunction(name: string): Promise<Operation> {
  const endpoint = `/${name}`;
  try {
    const res = await client.delete<Operation>(endpoint);
    return {
      done: false,
      name: res.body.name,
      type: "delete",
    };
  } catch (err: any) {
    throw functionsOpLogReject(name, "delete", err);
  }
}

export type ListFunctionsResponse = {
  unreachable: string[];
  functions: CloudFunction[];
};

async function list(projectId: string, region: string): Promise<ListFunctionsResponse> {
  const endpoint = "/projects/" + projectId + "/locations/" + region + "/functions";
  try {
    const res = await client.get<ListFunctionsResponse>(endpoint);
    if (res.body.unreachable && res.body.unreachable.length > 0) {
      logger.debug(
        `[functions] unable to reach the following regions: ${res.body.unreachable.join(", ")}`,
      );
    }

    return {
      functions: res.body.functions || [],
      unreachable: res.body.unreachable || [],
    };
  } catch (err: any) {
    logger.debug(`[functions] failed to list functions for ${projectId}`);
    logger.debug(`[functions] ${err?.message}`);
    throw new FirebaseError(`Failed to list functions for ${projectId}`, {
      original: err,
      status: err instanceof FirebaseError ? err.status : undefined,
    });
  }
}

/**
 * List all existing Cloud Functions in a project and region.
 * @param projectId the Id of the project to check.
 * @param region the region to check in.
 */
export async function listFunctions(projectId: string, region: string): Promise<CloudFunction[]> {
  const res = await list(projectId, region);
  return res.functions;
}

/**
 * List all existing Cloud Functions in a project.
 * @param projectId the Id of the project to check.
 */
export async function listAllFunctions(projectId: string): Promise<ListFunctionsResponse> {
  // "-" instead of a region string lists functions in all regions
  return list(projectId, "-");
}

/**
 * Converts a Cloud Function from the v1 API into a version-agnostic FunctionSpec struct.
 * This API exists outside the GCF namespace because GCF returns an Operation<CloudFunction>
 * and code may have to call this method explicitly.
 */
export function endpointFromFunction(gcfFunction: CloudFunction): backend.Endpoint {
  const [, project, , region, , id] = gcfFunction.name.split("/");
  let trigger: backend.Triggered;
  let uri: string | undefined;
  let securityLevel: SecurityLevel | undefined;
  if (gcfFunction.labels?.["deployment-scheduled"]) {
    trigger = {
      scheduleTrigger: {},
    };
  } else if (gcfFunction.labels?.["deployment-taskqueue"]) {
    trigger = {
      taskQueueTrigger: {},
    };
  } else if (
    gcfFunction.labels?.["deployment-callable"] ||
    // NOTE: "deployment-callabled" is a typo we introduced in https://github.com/firebase/firebase-tools/pull/4124.
    // More than a month passed before we caught this typo, and we expect many callable functions in production
    // to have this typo. It is convenient for users for us to treat the typo-ed label as a valid marker for callable
    // function, so we do that here.
    //
    // The typo will be overwritten as callable functions are re-deployed. Eventually, there may be no callable
    // functions with the typo-ed label, but we can't ever be sure. Sadly, we may have to carry this scar for a very long
    // time.
    gcfFunction.labels?.["deployment-callabled"]
  ) {
    trigger = {
      callableTrigger: {},
    };
  } else if (gcfFunction.labels?.[BLOCKING_LABEL]) {
    trigger = {
      blockingTrigger: {
        eventType: BLOCKING_LABEL_KEY_TO_EVENT[gcfFunction.labels[BLOCKING_LABEL]],
      },
    };
  } else if (gcfFunction.httpsTrigger) {
    trigger = { httpsTrigger: {} };
  } else {
    trigger = {
      eventTrigger: {
        eventType: gcfFunction.eventTrigger!.eventType,
        eventFilters: { resource: gcfFunction.eventTrigger!.resource },
        retry: !!gcfFunction.eventTrigger!.failurePolicy?.retry,
      },
    };
  }

  if (gcfFunction.httpsTrigger) {
    uri = gcfFunction.httpsTrigger.url;
    securityLevel = gcfFunction.httpsTrigger.securityLevel;
  }

  if (!runtimes.isValidRuntime(gcfFunction.runtime)) {
    logger.debug("GCFv1 function has a deprecated runtime:", JSON.stringify(gcfFunction, null, 2));
  }

  const endpoint: backend.Endpoint = {
    platform: "gcfv1",
    id,
    project,
    region,
    ...trigger,
    entryPoint: gcfFunction.entryPoint,
    runtime: gcfFunction.runtime,
  };
  if (uri) {
    endpoint.uri = uri;
  }
  if (securityLevel) {
    endpoint.securityLevel = securityLevel;
  }
  proto.copyIfPresent(
    endpoint,
    gcfFunction,
    "minInstances",
    "maxInstances",
    "ingressSettings",
    "labels",
    "environmentVariables",
    "secretEnvironmentVariables",
    "sourceUploadUrl",
  );
  proto.renameIfPresent(endpoint, gcfFunction, "serviceAccount", "serviceAccountEmail");
  proto.convertIfPresent(
    endpoint,
    gcfFunction,
    "availableMemoryMb",
    (raw) => raw as backend.MemoryOptions,
  );
  proto.convertIfPresent(endpoint, gcfFunction, "timeoutSeconds", "timeout", (dur) =>
    dur === null ? null : proto.secondsFromDuration(dur),
  );
  if (gcfFunction.vpcConnector) {
    endpoint.vpc = { connector: gcfFunction.vpcConnector };
    proto.convertIfPresent(
      endpoint.vpc,
      gcfFunction,
      "egressSettings",
      "vpcConnectorEgressSettings",
      (raw) => raw as backend.VpcEgressSettings,
    );
  }
  endpoint.codebase = gcfFunction.labels?.[CODEBASE_LABEL] || projectConfig.DEFAULT_CODEBASE;
  if (gcfFunction.labels?.[HASH_LABEL]) {
    endpoint.hash = gcfFunction.labels[HASH_LABEL];
  }
  return endpoint;
}

/**
 * Convert the API agnostic FunctionSpec struct to a CloudFunction proto for the v1 API.
 */
export function functionFromEndpoint(
  endpoint: backend.Endpoint,
  sourceUploadUrl: string,
): Omit<CloudFunction, OutputOnlyFields> {
  if (endpoint.platform !== "gcfv1") {
    throw new FirebaseError(
      "Trying to create a v1 CloudFunction with v2 API. This should never happen",
    );
  }

  if (!runtimes.isValidRuntime(endpoint.runtime)) {
    throw new FirebaseError(
      "Failed internal assertion. Trying to deploy a new function with a deprecated runtime." +
        " This should never happen",
    );
  }
  const gcfFunction: Omit<CloudFunction, OutputOnlyFields> = {
    name: backend.functionName(endpoint),
    sourceUploadUrl: sourceUploadUrl,
    entryPoint: endpoint.entryPoint,
    runtime: endpoint.runtime,
    dockerRegistry: "ARTIFACT_REGISTRY",
  };

  // N.B. It has the same effect to set labels to the empty object as it does to
  // set it to null, except the former is more effective for adding automatic
  // lables for things like deployment-callable
  if (typeof endpoint.labels !== "undefined") {
    gcfFunction.labels = { ...endpoint.labels };
  }
  if (backend.isEventTriggered(endpoint)) {
    if (!endpoint.eventTrigger.eventFilters?.resource) {
      throw new FirebaseError("Cannot create v1 function from an eventTrigger without a resource");
    }
    gcfFunction.eventTrigger = {
      eventType: endpoint.eventTrigger.eventType,
      resource: endpoint.eventTrigger.eventFilters.resource,
      // Service is unnecessary and deprecated
    };

    // For field masks to pick up a deleted failure policy we must inject an undefined
    // when retry is false
    gcfFunction.eventTrigger.failurePolicy = endpoint.eventTrigger.retry
      ? { retry: {} }
      : undefined;
  } else if (backend.isScheduleTriggered(endpoint)) {
    const id = backend.scheduleIdForFunction(endpoint);
    gcfFunction.eventTrigger = {
      eventType: "google.pubsub.topic.publish",
      resource: `projects/${endpoint.project}/topics/${id}`,
    };
    gcfFunction.labels = { ...gcfFunction.labels, "deployment-scheduled": "true" };
  } else if (backend.isTaskQueueTriggered(endpoint)) {
    gcfFunction.httpsTrigger = {};
    gcfFunction.labels = { ...gcfFunction.labels, "deployment-taskqueue": "true" };
  } else if (backend.isBlockingTriggered(endpoint)) {
    gcfFunction.httpsTrigger = {};
    gcfFunction.labels = {
      ...gcfFunction.labels,
      [BLOCKING_LABEL]:
        BLOCKING_EVENT_TO_LABEL_KEY[
          endpoint.blockingTrigger.eventType as (typeof AUTH_BLOCKING_EVENTS)[number]
        ],
    };
  } else {
    gcfFunction.httpsTrigger = {};
    if (backend.isCallableTriggered(endpoint)) {
      gcfFunction.labels = { ...gcfFunction.labels, "deployment-callable": "true" };
    }
    if (endpoint.securityLevel) {
      gcfFunction.httpsTrigger.securityLevel = endpoint.securityLevel;
    }
  }

  proto.copyIfPresent(
    gcfFunction,
    endpoint,
    "minInstances",
    "maxInstances",
    "ingressSettings",
    "environmentVariables",
    "secretEnvironmentVariables",
  );
  proto.renameIfPresent(gcfFunction, endpoint, "serviceAccountEmail", "serviceAccount");
  proto.convertIfPresent(
    gcfFunction,
    endpoint,
    "availableMemoryMb",
    (mem) => mem as backend.MemoryOptions,
  );
  proto.convertIfPresent(gcfFunction, endpoint, "timeout", "timeoutSeconds", (sec) =>
    sec ? proto.durationFromSeconds(sec) : null,
  );
  if (endpoint.vpc) {
    proto.renameIfPresent(gcfFunction, endpoint.vpc, "vpcConnector", "connector");
    proto.renameIfPresent(
      gcfFunction,
      endpoint.vpc,
      "vpcConnectorEgressSettings",
      "egressSettings",
    );
  } else if (endpoint.vpc === null) {
    gcfFunction.vpcConnector = null;
    gcfFunction.vpcConnectorEgressSettings = null;
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
