import * as path from "path";
import * as fs from "fs";
import { logger } from "../../logger";
import { FirebaseError } from "../../error";
import * as build from "./build";
import * as params from "./params";
import * as api from "../../api";
import * as proto from "../../gcp/proto";
import * as k8s from "../../gcp/k8s";
import { readExtensionYaml } from "../../extensions/emulator/specHelper";
import { getResourceRuntime } from "../../extensions/utils";
import * as supported from "./runtimes/supported";
import {
  Resource,
  Param,
  FUNCTIONS_RESOURCE_TYPE,
  FUNCTIONS_V2_RESOURCE_TYPE,
  FunctionResourceProperties,
  FunctionV2ResourceProperties,
} from "../../extensions/types";

const validFunctionTypes = [
  FUNCTIONS_RESOURCE_TYPE,
  FUNCTIONS_V2_RESOURCE_TYPE,
  "firebaseextensions.v1beta.scheduledFunction",
];

/**
 * Convert extension parameter references to CEL format
 * ${param:NAME} -> {{ params.NAME }}
 * ${NAME} -> {{ params.NAME }} (some extensions use this shorthand)
 */
function convertParamReference(value: string): string {
  return value
    .replace(/\${param:([^}]+)}/g, "{{ params.$1 }}")
    .replace(/\${([^:}]+)}/g, "{{ params.$1 }}");
}

/**
 * Check if a string contains parameter references
 */
function hasParamReference(value: string): boolean {
  return value.includes("${param:") || (value.includes("${") && value.includes("}"));
}

/**
 * Parse memory value from various formats to MB
 * Returns a number for literal values, or a string for CEL expressions
 */
function parseMemoryToMb(mem: string | number | undefined): build.Field<number> {
  if (mem === undefined) {
    return null;
  }
  
  if (typeof mem === "number") {
    return mem;
  }
  
  if (hasParamReference(mem)) {
    return processField(mem);
  }
  
  // Extensions use IEC notation (GiB), k8s.mebibytes expects Kubernetes notation (Gi)
  const k8sFormat = mem.replace(/([0-9.]+)([KMGT])iB$/i, "$1$2i");
  try {
    return Math.round(k8s.mebibytes(k8sFormat));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new FirebaseError(`Failed to parse memory value "${mem}": ${message}`);
  }
}

/**
 * Parse timeout value from various formats to seconds
 */
function parseTimeout(timeout: string | undefined): build.Field<number> {
  if (timeout === undefined) {
    return null;
  }
  
  if (hasParamReference(timeout)) {
    return processField(timeout);
  }
  
  return proto.secondsFromDuration(timeout);
}

/**
 * Process any field that might contain parameter references
 */
function processField<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (value.includes("${param:") || (value.includes("${") && value.includes("}"))) {
      return convertParamReference(value) as T;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(processField) as T;
  }

  if (typeof value === "object") {
    const processed: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      processed[key] = processField(val);
    }
    return processed as T;
  }

  return value;
}

/**
 * Create a v1 function endpoint
 */
function createV1Endpoint(
  resource: Resource & { properties?: FunctionResourceProperties["properties"] },
  projectId: string
): build.Endpoint {
  const runtime = getResourceRuntime(resource) || supported.latest("nodejs");
  const props = resource.properties;
  const location = props?.location || api.functionsDefaultRegion();
  
  // Common fields for all endpoints
  const baseFields = {
    entryPoint: resource.entryPoint || resource.name,
    platform: "gcfv1" as const,
    project: projectId,
    runtime,
    region: [processField(location)],
  };

  // Build the specific trigger type and combine with base fields
  let endpoint: build.Endpoint;
  
  if (props?.eventTrigger) {
    const eventTrigger: build.EventTrigger = {
      eventType: props.eventTrigger.eventType,
      retry: false,
    };

    if (props.eventTrigger.resource || props.eventTrigger.service) {
      eventTrigger.eventFilters = {};
      if (props.eventTrigger.resource) {
        eventTrigger.eventFilters.resource = processField(props.eventTrigger.resource);
      }
      if (props.eventTrigger.service) {
        eventTrigger.eventFilters.service = processField(props.eventTrigger.service);
      }
    }

    endpoint = { ...baseFields, eventTrigger };
  } else if (props?.scheduleTrigger) {
    endpoint = {
      ...baseFields,
      scheduleTrigger: {
        schedule: processField(props.scheduleTrigger.schedule) || "",
        timeZone: processField(props.scheduleTrigger.timeZone) || null,
      },
    };
  } else if (props?.taskQueueTrigger) {
    const taskQueueTrigger: build.TaskQueueTrigger = {};
    if (props.taskQueueTrigger.rateLimits) {
      taskQueueTrigger.rateLimits = processField(props.taskQueueTrigger.rateLimits);
    }
    if (props.taskQueueTrigger.retryConfig) {
      taskQueueTrigger.retryConfig = processField(props.taskQueueTrigger.retryConfig);
    }
    endpoint = { ...baseFields, taskQueueTrigger };
  } else {
    endpoint = { ...baseFields, httpsTrigger: {} };
  }

  // Add optional service config
  proto.convertIfPresent(endpoint, props || {}, "timeoutSeconds", "timeout", (timeout) => {
    if (hasParamReference(timeout)) {
      return processField(timeout);
    }
    return proto.secondsFromDuration(timeout);
  });
  proto.copyIfPresent(endpoint, props || {}, "availableMemoryMb");
  if (endpoint.availableMemoryMb !== undefined) {
    endpoint.availableMemoryMb = processField(endpoint.availableMemoryMb);
  }

  return endpoint;
}

/**
 * Create a v2 function endpoint
 */
function createV2Endpoint(
  resource: Resource & { properties?: FunctionV2ResourceProperties["properties"] },
  projectId: string
): build.Endpoint {
  const runtime = getResourceRuntime(resource) || supported.latest("nodejs");
  const props = resource.properties;
  const location = props?.location || api.functionsDefaultRegion();
  
  // Common fields for all endpoints
  const baseFields = {
    entryPoint: resource.entryPoint || resource.name,
    platform: "gcfv2" as const,
    project: projectId,
    runtime,
    region: [processField(location)],
  };

  // Build the specific trigger type and combine with base fields
  let endpoint: build.Endpoint;
  
  if (props?.eventTrigger) {
    const eventTrigger: build.EventTrigger = {
      eventType: props.eventTrigger.eventType,
      retry: props.eventTrigger.retryPolicy === "RETRY_POLICY_RETRY",
    };

    if (props.eventTrigger.eventFilters) {
      for (const filter of props.eventTrigger.eventFilters) {
        const value = processField(filter.value);
        if (filter.operator === "match-path-pattern") {
          eventTrigger.eventFilterPathPatterns = eventTrigger.eventFilterPathPatterns || {};
          eventTrigger.eventFilterPathPatterns[filter.attribute] = value;
        } else {
          eventTrigger.eventFilters = eventTrigger.eventFilters || {};
          eventTrigger.eventFilters[filter.attribute] = value;
        }
      }
    }
    if (props.eventTrigger.channel) {
      eventTrigger.channel = processField(props.eventTrigger.channel);
    }
    if (props.eventTrigger.triggerRegion) {
      eventTrigger.region = processField(props.eventTrigger.triggerRegion);
    }

    endpoint = { ...baseFields, eventTrigger };
  } else {
    endpoint = { ...baseFields, httpsTrigger: {} };
  }

  // Add optional service config
  if (props?.serviceConfig) {
    const serviceConfig = props.serviceConfig;
    proto.copyIfPresent(endpoint, serviceConfig, "timeoutSeconds");
    if (endpoint.timeoutSeconds !== undefined) {
      endpoint.timeoutSeconds = processField(endpoint.timeoutSeconds);
    }
    proto.convertIfPresent(endpoint, serviceConfig, "availableMemoryMb", "availableMemory", parseMemoryToMb);
    proto.renameIfPresent(endpoint, serviceConfig, "minInstances", "minInstanceCount");
    proto.renameIfPresent(endpoint, serviceConfig, "maxInstances", "maxInstanceCount");
    if (endpoint.minInstances !== undefined) {
      endpoint.minInstances = processField(endpoint.minInstances);
    }
    if (endpoint.maxInstances !== undefined) {
      endpoint.maxInstances = processField(endpoint.maxInstances);
    }
  }

  return endpoint;
}

/**
 * Convert an extension resource to a functions deployment endpoint
 */
function createEndpoint(resource: Resource, projectId: string): build.Endpoint {
  if (resource.type === FUNCTIONS_V2_RESOURCE_TYPE) {
    return createV2Endpoint(resource, projectId);
  } else {
    return createV1Endpoint(resource, projectId);
  }
}

/**
 * Convert extension params to build params
 */
function convertParam(param: Param): params.Param {
  if (param.type === "secret") {
    return {
      type: "secret",
      name: param.param,
    };
  }

  const stringParam: params.StringParam = {
    type: "string",
    name: param.param,
    label: param.label,
  };

  if (param.description !== undefined) stringParam.description = param.description;
  if (param.immutable !== undefined) stringParam.immutable = param.immutable;
  if (param.default !== undefined) stringParam.default = processField(String(param.default));

  // Handle different input types
  switch (param.type) {
    case "select": {
      if (param.options) {
        stringParam.input = {
          select: {
            options: param.options.map((opt) => ({
              label: opt.label || String(opt.value),
              value: String(opt.value),
            })),
          },
        };
      }
      break;
    }
    case "multiSelect": {
      if (param.options) {
        stringParam.input = {
          multiSelect: {
            options: param.options.map((opt) => ({
              label: opt.label || String(opt.value),
              value: String(opt.value),
            })),
          },
        };
      }
      break;
    }
    case "selectResource":
      stringParam.input = {
        resource: {
          type: param.resourceType || "storage.googleapis.com/Bucket",
        },
      };
      break;
    default:
      if (param.validationRegex) {
        const text: params.TextInput<string>["text"] = {
          validationRegex: param.validationRegex,
        };
        if (param.validationErrorMessage !== undefined) {
          text.validationErrorMessage = param.validationErrorMessage;
        }
        if (param.example !== undefined) {
          text.example = param.example;
        }
        stringParam.input = { text };
      }
  }

  return stringParam;
}

/**
 * Detect and convert extension.yaml to functions Build format for deployment
 */
export async function detectAndAdaptExtension(
  projectDir: string,
  projectId: string,
): Promise<build.Build | undefined> {
  const extensionYamlPath = path.join(projectDir, "extension.yaml");

  try {
    await fs.promises.access(extensionYamlPath);
  } catch {
    return undefined;
  }

  const extensionSpec = await readExtensionYaml(projectDir);

  if (!extensionSpec.name || !extensionSpec.version) {
    throw new FirebaseError("extension.yaml is missing required fields: name or version");
  }

  if (!extensionSpec.resources || extensionSpec.resources.length === 0) {
    throw new FirebaseError("extension.yaml must contain at least one resource");
  }

  logger.info(`Detected extension "${extensionSpec.name}" v${extensionSpec.version}`);
  logger.info("Adapting extension.yaml for functions deployment...");

  // TODO: Handle IAM roles - extensions can require specific IAM roles for their service account
  // TODO: Support lifecycle events (onInstall, onUpdate, onConfigure) - these are task queue functions

  const functionsBuild = build.empty();

  functionsBuild.endpoints = {};
  for (const resource of extensionSpec.resources) {
    if (validFunctionTypes.includes(resource.type)) {
      functionsBuild.endpoints[resource.name] = createEndpoint(resource, projectId);
    }
  }

  if (Object.keys(functionsBuild.endpoints).length === 0) {
    throw new FirebaseError("No function resources found in extension.yaml");
  }

  logger.info(`Found ${Object.keys(functionsBuild.endpoints).length} function(s) in extension`);

  functionsBuild.params = (extensionSpec.params || []).map(convertParam);

  if (extensionSpec.apis) {
    functionsBuild.requiredAPIs = extensionSpec.apis.map((api) => ({
      api: api.apiName,
      reason: api.reason,
    }));
  }

  return functionsBuild;
}
