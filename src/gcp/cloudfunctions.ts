import * as clc from "cli-color";

import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as api from "../api";
import * as backend from "../deploy/functions/backend";
import * as utils from "../utils";
import * as proto from "./proto";
import * as runtimes from "../deploy/functions/runtimes";
import * as iam from "./iam";
import * as _ from "lodash";

export const API_VERSION = "v1";

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
  version: string;
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
  // Seconds. Default = 60
  timeout?: proto.Duration;

  // Default 256
  availableMemoryMb?: number;

  // Default <projectID>@appspot.gserviceaccount.com
  serviceAccountEmail?: string;

  labels?: Record<string, string>;
  environmentVariables?: Record<string, string>;
  buildEnvironmentVariables?: Record<string, string>;

  network?: string;
  maxInstances?: number;
  minInstances?: number;

  corsPolicy?: CorsPolicy;
  vpcConnector?: string;
  vpcConnectorEgressSettings?: "PRIVATE_RANGES_ONLY" | "ALL_TRAFFIC";
  ingressSettings?: "ALLOW_ALL" | "ALLOW_INTERNAL_ONLY" | "ALLOW_INTERNAL_AND_GCLB";

  kmsKeyName?: string;
  buildWorkerPool?: string;
  secretEnvironmentVariables?: SecretEnvVar[];
  secretVolumes?: SecretVolume[];

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

function validateFunction(func: CloudFunction) {
  proto.assertOneOf(
    "Cloud Function",
    func,
    "sourceCode",
    "sourceArchiveUrl",
    "sourceRepository",
    "sourceUploadUrl"
  );
  proto.assertOneOf("Cloud Function", func, "trigger", "httpsTrigger", "eventTrigger");
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
 * Calls the GCG API to generate a signed upload URL that
 * function code can be uploaded to.
 * @param projectId The ID of the project being deployed to.
 * @param location The region to used for generating an upload URL.
 */
export async function generateUploadUrl(projectId: string, location: string): Promise<string> {
  const parent = "projects/" + projectId + "/locations/" + location;
  const endpoint = "/" + API_VERSION + "/" + parent + "/functions:generateUploadUrl";

  try {
    const res = await api.request("POST", endpoint, {
      auth: true,
      json: false,
      origin: api.functionsOrigin,
      retryCodes: [503],
    });
    const responseBody = JSON.parse(res.body);
    return responseBody.uploadUrl;
  } catch (err) {
    logger.info(
      "\n\nThere was an issue deploying your functions. Verify that your project has a Google App Engine instance setup at https://console.cloud.google.com/appengine and try again. If this issue persists, please contact support."
    );
    throw err;
  }
}

/**
 * Create a Cloud Function.
 * @param cloudFunction The function to delete
 */
export async function createFunction(
  cloudFunction: Omit<CloudFunction, OutputOnlyFields>
): Promise<Operation> {
  // the API is a POST to the collection that owns the function name.
  const apiPath = cloudFunction.name.substring(0, cloudFunction.name.lastIndexOf("/"));
  const endpoint = `/${API_VERSION}/${apiPath}`;

  try {
    const res = await api.request("POST", endpoint, {
      auth: true,
      data: cloudFunction,
      origin: api.functionsOrigin,
    });
    return {
      name: res.body.name,
      type: "create",
      done: false,
    };
  } catch (err) {
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
  const endpoint = `/${API_VERSION}/${options.name}:setIamPolicy`;

  try {
    await api.request("POST", endpoint, {
      auth: true,
      data: {
        policy: options.policy,
        updateMask: Object.keys(options.policy).join(","),
      },
      origin: api.functionsOrigin,
    });
  } catch (err) {
    throw new FirebaseError(`Failed to set the IAM Policy on the function ${options.name}`, {
      original: err,
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
  const endpoint = `/${API_VERSION}/${fnName}:getIamPolicy`;

  try {
    return await api.request("GET", endpoint, {
      auth: true,
      origin: api.functionsOrigin,
    });
  } catch (err) {
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
 *
 * @throws {@link FirebaseError} on an empty invoker, when the IAM Polciy fails to be grabbed or set
 */
export async function setInvokerCreate(
  projectId: string,
  fnName: string,
  invoker: string[]
): Promise<void> {
  if (invoker.length == 0) {
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
 *
 * @throws {@link FirebaseError} on an empty invoker, when the IAM Polciy fails to be grabbed or set
 */
export async function setInvokerUpdate(
  projectId: string,
  fnName: string,
  invoker: string[]
): Promise<void> {
  if (invoker.length == 0) {
    throw new FirebaseError("Invoker cannot be an empty array");
  }
  const invokerMembers = proto.getInvokerMembers(invoker, projectId);
  const invokerRole = "roles/cloudfunctions.invoker";
  const currentPolicy = await getIamPolicy(fnName);
  const currentInvokerBinding = currentPolicy.bindings?.find(
    (binding) => binding.role === invokerRole
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
  cloudFunction: Omit<CloudFunction, OutputOnlyFields>
): Promise<Operation> {
  const endpoint = `/${API_VERSION}/${cloudFunction.name}`;
  // Keys in labels and environmentVariables are user defined, so we don't recurse
  // for field masks.
  const fieldMasks = proto.fieldMasks(
    cloudFunction,
    /* doNotRecurseIn...=*/ "labels",
    "environmentVariables"
  );

  // Failure policy is always an explicit policy and is only signified by the presence or absence of
  // a protobuf.Empty value, so we have to manually add it in the missing case.
  try {
    const res = await api.request("PATCH", endpoint, {
      qs: {
        updateMask: fieldMasks.join(","),
      },
      auth: true,
      data: cloudFunction,
      origin: api.functionsOrigin,
    });
    return {
      done: false,
      name: res.body.name,
      type: "update",
    };
  } catch (err) {
    throw functionsOpLogReject(cloudFunction.name, "update", err);
  }
}

/**
 * Delete a Cloud Function.
 * @param options the Cloud Function to delete.
 */
export async function deleteFunction(name: string): Promise<Operation> {
  const endpoint = `/${API_VERSION}/${name}`;
  try {
    const res = await api.request("DELETE", endpoint, {
      auth: true,
      origin: api.functionsOrigin,
    });
    return {
      done: false,
      name: res.body.name,
      type: "delete",
    };
  } catch (err) {
    throw functionsOpLogReject(name, "delete", err);
  }
}

export type ListFunctionsResponse = {
  unreachable: string[];
  functions: CloudFunction[];
};

async function list(projectId: string, region: string): Promise<ListFunctionsResponse> {
  const endpoint =
    "/" + API_VERSION + "/projects/" + projectId + "/locations/" + region + "/functions";
  try {
    const res = await api.request("GET", endpoint, {
      auth: true,
      origin: api.functionsOrigin,
    });
    if (res.body.unreachable && res.body.unreachable.length > 0) {
      logger.debug(
        `[functions] unable to reach the following regions: ${res.body.unreachable.join(", ")}`
      );
    }

    return {
      functions: res.body.functions || [],
      unreachable: res.body.unreachable || [],
    };
  } catch (err) {
    logger.debug("[functions] failed to list functions for " + projectId);
    logger.debug(`[functions] ${err?.message}`);
    return Promise.reject(err?.message);
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
export function specFromFunction(gcfFunction: CloudFunction): backend.FunctionSpec {
  const [, project, , region, , id] = gcfFunction.name.split("/");
  let trigger: backend.EventTrigger | backend.HttpsTrigger;
  let uri: string | undefined;
  if (gcfFunction.httpsTrigger) {
    trigger = {};
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

  if (!runtimes.isValidRuntime(gcfFunction.runtime)) {
    logger.debug("GCFv1 function has a deprecated runtime:", JSON.stringify(gcfFunction, null, 2));
  }

  const cloudFunction: backend.FunctionSpec = {
    platform: "gcfv1",
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
    "environmentVariables",
    "sourceUploadUrl"
  );

  return cloudFunction;
}

/**
 * Convert the API agnostic FunctionSpec struct to a CloudFunction proto for the v1 API.
 */
export function functionFromSpec(
  cloudFunction: backend.FunctionSpec,
  sourceUploadUrl: string
): Omit<CloudFunction, OutputOnlyFields> {
  if (cloudFunction.platform != "gcfv1") {
    throw new FirebaseError(
      "Trying to create a v1 CloudFunction with v2 API. This should never happen"
    );
  }

  if (!runtimes.isValidRuntime(cloudFunction.runtime)) {
    throw new FirebaseError(
      "Failed internal assertion. Trying to deploy a new function with a deprecated runtime." +
        " This should never happen"
    );
  }
  const gcfFunction: Omit<CloudFunction, OutputOnlyFields> = {
    name: backend.functionName(cloudFunction),
    sourceUploadUrl: sourceUploadUrl,
    entryPoint: cloudFunction.entryPoint,
    runtime: cloudFunction.runtime,
  };

  if (backend.isEventTrigger(cloudFunction.trigger)) {
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
    gcfFunction.httpsTrigger = {};
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
export function endpointFromFunction(gcfFunction: CloudFunction): backend.Endpoint {
  const [, project, , region, , id] = gcfFunction.name.split("/");
  let trigger: backend.Triggered;
  let uri: string | undefined;
  if (gcfFunction.httpsTrigger) {
    trigger = { httpsTrigger: {} };
    uri = gcfFunction.httpsTrigger.url;
  } else if (gcfFunction.labels?.["deployment-scheduled"]) {
    trigger = {
      scheduleTrigger: {},
    };
  } else {
    trigger = {
      eventTrigger: {
        eventType: gcfFunction.eventTrigger!.eventType,
        eventFilters: {
          resource: gcfFunction.eventTrigger!.resource,
        },
        retry: !!gcfFunction.eventTrigger!.failurePolicy?.retry,
      },
    };
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
  proto.copyIfPresent(
    endpoint,
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
    "environmentVariables",
    "sourceUploadUrl"
  );

  return endpoint;
}

/**
 * Convert the API agnostic FunctionSpec struct to a CloudFunction proto for the v1 API.
 */
export function functionFromEndpoint(
  endpoint: backend.Endpoint,
  sourceUploadUrl: string
): Omit<CloudFunction, OutputOnlyFields> {
  if (endpoint.platform != "gcfv1") {
    throw new FirebaseError(
      "Trying to create a v1 CloudFunction with v2 API. This should never happen"
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
    sourceUploadUrl: sourceUploadUrl,
    entryPoint: endpoint.entryPoint,
    runtime: endpoint.runtime,
  };

  proto.copyIfPresent(gcfFunction, endpoint, "labels");
  if (backend.isEventTriggered(endpoint)) {
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
  } else {
    gcfFunction.httpsTrigger = {};
  }

  proto.copyIfPresent(
    gcfFunction,
    endpoint,
    "serviceAccountEmail",
    "timeout",
    "availableMemoryMb",
    "minInstances",
    "maxInstances",
    "vpcConnector",
    "vpcConnectorEgressSettings",
    "ingressSettings",
    "environmentVariables"
  );

  return gcfFunction;
}
