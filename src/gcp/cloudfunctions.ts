import * as clc from "cli-color";

import * as api from "../api";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as utils from "../utils";
import * as proto from "./proto";

export const API_VERSION = "v1";

export const DEFAULT_PUBLIC_POLICY = {
  version: 3,
  bindings: [
    {
      role: "roles/cloudfunctions.invoker",
      members: ["allUsers"],
    },
  ],
};

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

export type Runtime = "nodejs10" | "nodejs12" | "nodejs14";
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
  runtime: Runtime;
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
  policy: any; // TODO: Type this?
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
