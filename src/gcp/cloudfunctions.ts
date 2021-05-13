import * as _ from "lodash";
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
  funcName: string;
  done: boolean;
  eventType?: string;
  trigger?: {
    eventTrigger?: any;
    httpsTrigger?: any;
  };
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

export type Runtime = "nodejs6" | "nodejs8" | "nodejs10" | "nodejs12" | "nodejs14";
export type CloudFunctionStatus =
  | "ACTIVE"
  | "OFFLINE"
  | "DEPLOY_IN_PROGRESS"
  | "DELETE_IN_PROGRESS"
  | "UNKNOWN";
export type SecurityLevel = "SECURE_ALWAYS" | "SECURE_OPTIONAL";

export interface FailurePolicy {
  // oneof action
  retry?: {};
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
  readonly status: CloudFunctionStatus;
  readonly buildId: string;
  readonly updateTime: Date;
  readonly versionId: number;
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
 * @param options The function to deploy.
 */
export async function createFunction(options: any): Promise<Operation> {
  const location = "projects/" + options.projectId + "/locations/" + options.region;
  const fullFuncName = location + "/functions/" + options.functionName;
  const endpoint = "/" + API_VERSION + "/" + location + "/functions";

  const data: Partial<CloudFunction> = {
    sourceUploadUrl: options.sourceUploadUrl,
    name: fullFuncName,
    entryPoint: options.entryPoint,
    labels: options.labels,
    runtime: options.runtime,
    environmentVariables: options.environmentVariables,
  };

  if (options.vpcConnector) {
    data.vpcConnector = options.vpcConnector;
    // use implied project/location if only given connector id
    if (!data.vpcConnector?.includes("/")) {
      data.vpcConnector = `${location}/connectors/${data.vpcConnector}`;
    }
  }
  if (options.vpcConnectorEgressSettings) {
    data.vpcConnectorEgressSettings = options.vpcConnectorEgressSettings;
  }
  if (options.availableMemoryMb) {
    data.availableMemoryMb = options.availableMemoryMb;
  }
  if (options.timeout) {
    data.timeout = options.timeout;
  }
  if (options.maxInstances) {
    data.maxInstances = Number(options.maxInstances);
  }
  if (options.serviceAccountEmail) {
    data.serviceAccountEmail = options.serviceAccountEmail;
  }
  if (options.sourceToken) {
    data.sourceToken = options.sourceToken;
  }
  if (options.ingressSettings) {
    data.ingressSettings = options.ingressSettings;
  }
  try {
    const res = await api.request("POST", endpoint, {
      auth: true,
      data: _.assign(data, options.trigger),
      origin: api.functionsOrigin,
    });
    return {
      name: res.body.name,
      type: "create",
      funcName: fullFuncName,
      eventType: options.eventType,
      done: false,
    };
  } catch (err) {
    throw functionsOpLogReject(options.functionName, "create", err);
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
export async function setIamPolicy(options: IamOptions) {
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
 * @param options The Cloud Function to update.
 */
export async function updateFunction(options: any): Promise<Operation> {
  const location = "projects/" + options.projectId + "/locations/" + options.region;
  const fullFuncName = location + "/functions/" + options.functionName;
  const endpoint = "/" + API_VERSION + "/" + fullFuncName;

  const data: CloudFunction = _.assign(
    {
      sourceUploadUrl: options.sourceUploadUrl,
      name: fullFuncName,
      labels: options.labels,
    },
    options.trigger
  );
  let masks = ["sourceUploadUrl", "name", "labels"];

  if (options.vpcConnector) {
    data.vpcConnector = options.vpcConnector;
    // use implied project/location if only given connector id
    if (!data.vpcConnector?.includes("/")) {
      data.vpcConnector = `${location}/connectors/${data.vpcConnector}`;
    }
    masks.push("vpcConnector");
  }
  if (options.vpcConnectorEgressSettings) {
    data.vpcConnectorEgressSettings = options.vpcConnectorEgressSettings;
    masks.push("vpcConnectorEgressSettings");
  }
  if (options.runtime) {
    data.runtime = options.runtime;
    masks = _.concat(masks, "runtime");
  }
  if (options.availableMemoryMb) {
    data.availableMemoryMb = options.availableMemoryMb;
    masks.push("availableMemoryMb");
  }
  if (options.timeout) {
    data.timeout = options.timeout;
    masks.push("timeout");
  }
  if (options.maxInstances) {
    data.maxInstances = Number(options.maxInstances);
    masks.push("maxInstances");
  }
  if (options.environmentVariables) {
    data.environmentVariables = options.environmentVariables;
    masks.push("environmentVariables");
  }
  if (options.serviceAccountEmail) {
    data.serviceAccountEmail = options.serviceAccountEmail;
    masks.push("serviceAccountEmail");
  }
  if (options.sourceToken) {
    data.sourceToken = options.sourceToken;
    masks.push("sourceToken");
  }
  if (options.ingressSettings) {
    data.ingressSettings = options.ingressSettings;
    masks.push("ingressSettings");
  }
  if (options.trigger.eventTrigger) {
    masks = _.concat(
      masks,
      _.map(_.keys(options.trigger.eventTrigger), (subkey) => {
        return "eventTrigger." + subkey;
      })
    );
  } else {
    masks = _.concat(masks, "httpsTrigger");
  }

  try {
    const res = await api.request("PATCH", endpoint, {
      qs: {
        updateMask: masks.join(","),
      },
      auth: true,
      data: data,
      origin: api.functionsOrigin,
    });
    return {
      funcName: fullFuncName,
      eventType: options.eventType,
      done: false,
      name: res.body.name,
      type: "update",
    };
  } catch (err) {
    throw functionsOpLogReject(options.functionName, "update", err);
  }
}

/**
 * Delete a Cloud Function.
 * @param options the Cloud Function to delete.
 */
export async function deleteFunction(options: any): Promise<Operation> {
  const endpoint = "/" + API_VERSION + "/" + options.functionName;
  try {
    const res = await api.request("DELETE", endpoint, {
      auth: true,
      origin: api.functionsOrigin,
    });
    return {
      funcName: options.funcName,
      eventType: options.eventType,
      done: false,
      name: res.body.name,
      type: "delete",
    };
  } catch (err) {
    throw functionsOpLogReject(options.functionName, "delete", err);
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

    const functionsList = res.body.functions || [];
    _.forEach(functionsList, (f) => {
      f.functionName = f.name.substring(f.name.lastIndexOf("/") + 1);
    });
    return {
      unreachable: res.body.unreachable,
      functions: functionsList,
    };
  } catch (err) {
    logger.debug("[functions] failed to list functions for " + projectId);
    logger.debug("[functions] " + err.message);
    return Promise.reject(err.message);
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
