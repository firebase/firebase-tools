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
  ExtensionSpec,
  isExtensionSpec,
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
  return /\${param:[^}]+}|\${[^:}]+}/.test(value);
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
    if (hasParamReference(value)) {
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
  projectId: string,
): build.Endpoint {
  const runtime = getResourceRuntime(resource) || supported.latest("nodejs");
  const props = resource.properties;
  const location = props?.location || api.functionsDefaultRegion();

  const baseFields = {
    entryPoint: resource.entryPoint || resource.name,
    platform: "gcfv1" as const,
    project: projectId,
    runtime,
    region: [processField(location)],
  };

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

  proto.convertIfPresent(endpoint, props || {}, "timeoutSeconds", "timeout", parseTimeout);
  proto.convertIfPresent(
    endpoint,
    props || {},
    "availableMemoryMb",
    "availableMemoryMb",
    processField,
  );

  return endpoint;
}

/**
 * Create a v2 function endpoint
 */
function createV2Endpoint(
  resource: Resource & { properties?: FunctionV2ResourceProperties["properties"] },
  projectId: string,
): build.Endpoint {
  const runtime = getResourceRuntime(resource) || supported.latest("nodejs");
  const props = resource.properties;
  const location = props?.location || api.functionsDefaultRegion();

  const baseFields = {
    entryPoint: resource.entryPoint || resource.name,
    platform: "gcfv2" as const,
    project: projectId,
    runtime,
    region: [processField(location)],
  };

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

    if (props.eventTrigger.eventType.includes("google.cloud.firestore")) {
      eventTrigger.eventFilters = eventTrigger.eventFilters || {};
      eventTrigger.eventFilters["database"] = eventTrigger.eventFilters["database"] ?? "(default)";
      eventTrigger.eventFilters["namespace"] =
        eventTrigger.eventFilters["namespace"] ?? "(default)";
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

  if (props?.serviceConfig) {
    const serviceConfig = props.serviceConfig;
    proto.copyIfPresent(endpoint, serviceConfig, "timeoutSeconds");
    if (endpoint.timeoutSeconds !== undefined) {
      endpoint.timeoutSeconds = processField(endpoint.timeoutSeconds);
    }
    proto.convertIfPresent(
      endpoint,
      serviceConfig,
      "availableMemoryMb",
      "availableMemory",
      parseMemoryToMb,
    );
    proto.convertIfPresent(
      endpoint,
      serviceConfig,
      "minInstances",
      "minInstanceCount",
      processField,
    );
    proto.convertIfPresent(
      endpoint,
      serviceConfig,
      "maxInstances",
      "maxInstanceCount",
      processField,
    );
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
 * Check if all select options are numeric values
 */
function hasAllNumericOptions(param: Param): boolean {
  if (!param.options || param.type !== "select") {
    return false;
  }
  return param.options.every(opt => {
    const val = String(opt.value);
    return !isNaN(Number(val)) && val.trim() !== '';
  });
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

  // Legacy support: Some extensions (e.g., storage-resize-images) use select params with
  // numeric values for properties like FUNCTION_MEMORY. These should be treated as IntParams
  // to allow proper type coercion when used in numeric contexts like availableMemoryMb.
  // This pattern was later replaced by system params, but we need to support existing extensions.
  // Analysis shows only ~4% of extensions use this pattern, all for FUNCTION_MEMORY.
  if (param.type === "select" && hasAllNumericOptions(param)) {
    const intParam: params.IntParam = {
      type: "int",
      name: param.param,
      label: param.label,
    };

    proto.copyIfPresent(intParam, param, "description");
    proto.copyIfPresent(intParam, param, "immutable");
    
    // Convert default to number
    if (param.default !== undefined) {
      const defaultStr = String(param.default);
      if (hasParamReference(defaultStr)) {
        // If it's a param reference, keep as CEL expression
        intParam.default = processField(defaultStr);
      } else {
        intParam.default = Number(defaultStr);
      }
    }

    // Add select input with numeric values
    if (param.options) {
      intParam.input = {
        select: {
          options: param.options.map((opt) => ({
            label: opt.label || String(opt.value),
            value: Number(opt.value),
          })),
        },
      };
    }

    return intParam;
  }

  if (param.type === "multiSelect") {
    const listParam: params.ListParam = {
      type: "list",
      name: param.param,
      label: param.label,
    };

    proto.copyIfPresent(listParam, param, "description");
    proto.copyIfPresent(listParam, param, "immutable");

    if (param.default !== undefined) {
      const defaultStr = String(param.default);
      if (hasParamReference(defaultStr)) {
        // TODO: Consider supporting CEL expressions that return arrays
        listParam.default = [processField(defaultStr)];
      } else {
        listParam.default = defaultStr
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v);
      }
    }

    if (param.options) {
      listParam.input = {
        multiSelect: {
          options: param.options.map((opt) => ({
            label: opt.label || String(opt.value),
            value: String(opt.value),
          })),
        },
      };
    }

    return listParam;
  }

  const stringParam: params.StringParam = {
    type: "string",
    name: param.param,
    label: param.label,
  };

  proto.copyIfPresent(stringParam, param, "description");
  proto.copyIfPresent(stringParam, param, "immutable");

  proto.convertIfPresent(stringParam, param, "default", "default", (val) =>
    processField(String(val)),
  );

  switch (param.type) {
    case "select":
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

    case "selectResource":
      if (!param.resourceType) {
        throw new FirebaseError(
          `Parameter ${param.param} has type selectResource but missing required resourceType field`,
        );
      }
      stringParam.input = {
        resource: {
          type: param.resourceType,
        },
      };
      break;

    default:
      if (param.validationRegex) {
        const text: params.TextInput<string>["text"] = {
          validationRegex: param.validationRegex,
        };
        proto.copyIfPresent(text, param, "validationErrorMessage");
        proto.copyIfPresent(text, param, "example");
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
  let extensionSpec: ExtensionSpec;

  try {
    extensionSpec = await readExtensionYaml(projectDir);
  } catch (err) {
    if (err instanceof FirebaseError && err.message.includes('Could not find "extension.yaml"')) {
      return undefined;
    }
    const originalError = err instanceof Error ? err : new Error(String(err));
    throw new FirebaseError(`Failed to read extension.yaml in ${projectDir}`, {
      original: originalError,
    });
  }

  if (!isExtensionSpec(extensionSpec)) {
    throw new FirebaseError("extension.yaml does not contain a valid extension specification");
  }

  if (!extensionSpec.resources || extensionSpec.resources.length === 0) {
    throw new FirebaseError("extension.yaml must contain at least one resource");
  }

  logger.debug(`Detected extension "${extensionSpec.name}" v${extensionSpec.version}`);
  logger.debug("Adapting extension.yaml for functions deployment...");

  // TODO: Handle IAM roles - extensions can require specific IAM roles for their service account
  // TODO: Support lifecycle events (onInstall, onUpdate, onConfigure) - these are task queue functions
  
  // System params note: Extensions automatically get system params like:
  // - firebaseextensions.v1beta.function/location (defaults to us-central1)
  // - firebaseextensions.v1beta.function/memory (defaults to 256MB for v1, 256Mi for v2)
  // - firebaseextensions.v1beta.function/timeoutSeconds (configurable 0-540)
  // These are marked as "advanced" params and configure resources directly (not env vars).
  // For local testing, we rely on defaults in resource properties or let the Functions
  // platform use its defaults. Full system param injection would require:
  // 1. Detecting which function types are used (v1 vs v2)
  // 2. Generating appropriate system param definitions
  // 3. Accepting user values (from env vars or config for testing)
  // 4. Applying them to endpoints where not already specified in properties

  const functionsBuild = build.empty();

  for (const resource of extensionSpec.resources) {
    if (validFunctionTypes.includes(resource.type)) {
      functionsBuild.endpoints[resource.name] = createEndpoint(resource, projectId);
    }
  }

  if (Object.keys(functionsBuild.endpoints).length === 0) {
    throw new FirebaseError("No function resources found in extension.yaml");
  }

  logger.debug(`Found ${Object.keys(functionsBuild.endpoints).length} function(s) in extension`);

  functionsBuild.params = (extensionSpec.params || []).map(convertParam);

  if (extensionSpec.apis) {
    functionsBuild.requiredAPIs = extensionSpec.apis.map((api) => ({
      api: api.apiName,
      reason: api.reason,
    }));
  }

  return functionsBuild;
}
